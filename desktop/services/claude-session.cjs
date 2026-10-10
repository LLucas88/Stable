'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

// Shared with the runner so clearing a conversation cannot detach a live run.
const activeSessions = new Set()

function sessionDirectory(userData, key) {
  const hash = createHash('sha256').update(String(key)).digest('hex')
  return path.join(userData, 'claude', 'sessions', hash)
}

function assertSessionPath(userData, key, filename) {
  const directory = sessionDirectory(userData, key)
  const paths = [path.join(userData, 'claude'), path.join(userData, 'claude', 'sessions'), directory]
  if (filename) {
    if (!['stable-thread.json', 'stable-turns.jsonl'].includes(filename)) throw Error('无效的 Claude 会话文件。')
    paths.push(path.join(directory, filename))
  }
  for (let index = 0; index < paths.length; index++) {
    let stat
    try { stat = fs.lstatSync(paths[index]) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (stat.isSymbolicLink() || (index < 3 ? !stat.isDirectory() : !stat.isFile())) {
      throw Error('Claude 会话路径不是安全的本地文件，历史仍保留。')
    }
  }
  return filename ? path.join(directory, filename) : directory
}

function clearClaudeSession(userData, key) {
  const directory = sessionDirectory(userData, key)
  if (activeSessions.has(directory)) throw Error('请先停止当前任务，再清空对话。')
  const pointer = assertSessionPath(userData, key, 'stable-thread.json')
  // Preserve the SDK transcript and terminal-turn journal for diagnostics.
  try { fs.unlinkSync(pointer) } catch (error) { if (error.code !== 'ENOENT') throw error }
}

module.exports = { sessionDirectory, clearClaudeSession, activeSessions, assertSessionPath }
