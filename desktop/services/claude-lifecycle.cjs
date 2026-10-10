'use strict'

const fs = require('node:fs')
const { assertSessionPath, clearClaudeSession } = require('./claude-session.cjs')

function readJournal(filename, threadId) {
  let source
  try { source = fs.readFileSync(filename, 'utf8') } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const lines = source.split('\n'), turns = new Map()
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue
    let turn
    try { turn = JSON.parse(lines[index]) } catch {
      // A crash can leave only the final append incomplete. Earlier completed
      // records remain useful, but never guess a result for the partial line.
      if (index === lines.length - 1 && !source.endsWith('\n')) break
      throw Error('Claude 运行记录损坏，暂时无法核实发送结果；历史仍保留。')
    }
    if (!turn || typeof turn.id !== 'string' || !turn.id || !['completed', 'failed', 'interrupted'].includes(turn.status) || !Array.isArray(turn.items)) {
      throw Error('Claude 运行记录格式不完整，暂时无法核实发送结果；历史仍保留。')
    }
    if (turn.threadId && turn.threadId !== threadId) continue
    turns.set(turn.id, turn)
  }
  return [...turns.values()]
}

function createClaudeLifecycle({ userData } = {}) {
  if (typeof userData !== 'string' || !userData) throw Error('缺少 Claude 会话存储目录。')
  return {
    async read(id) {
      const pointer = assertSessionPath(userData, id, 'stable-thread.json')
      let source
      try { source = fs.readFileSync(pointer, 'utf8') } catch (error) { if (error.code === 'ENOENT') return { noRuntime: true }; throw error }
      let saved
      try { saved = JSON.parse(source) } catch { throw Error('Claude 运行时映射损坏，历史仍保留。') }
      if (!saved || typeof saved.threadId !== 'string' || !saved.threadId) throw Error('Claude 运行时映射不完整，历史仍保留。')
      const journal = assertSessionPath(userData, id, 'stable-turns.jsonl')
      return { thread: { id: saved.threadId, turns: readJournal(journal, saved.threadId) } }
    },
    async sync(id, kind) {
      if (!['archive', 'unarchive', 'delete'].includes(kind)) throw Error('未知同步操作。')
      // Stable's database owns archive state. No network request or agent
      // process is needed to synchronize a local execution session.
      if (kind === 'delete') clearClaudeSession(userData, id)
      return { local: true }
    },
  }
}

module.exports = { createClaudeLifecycle }
