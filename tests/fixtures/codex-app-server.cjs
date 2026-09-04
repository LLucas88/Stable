'use strict'

// Deterministic protocol fixture for failure and descendant event handling.
// It does not execute commands, launch agents, or connect to a model.
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const notify = (method, params) => send({ method, params })
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const { id, method, params: p } = JSON.parse(line)
  if (method === 'initialize') send({ id, result: { userAgent: 'fixture' } })
  else if (method === 'thread/start' || method === 'thread/resume') send({ id, result: { thread: { id: p.threadId || 'root' } } })
  else if (method === 'turn/start') {
    fs.writeFileSync(path.join(process.env.CODEX_HOME, 'fixture-input.json'), JSON.stringify(p))
    send({ id, result: { turn: { id: 'turn' } } })
    if (p.input[0].text === 'EARLY_EXIT') { process.exit(7); return }
    notify('turn/started', { threadId: 'root', turn: { id: 'turn' } })
    notify('thread/started', { thread: { id: 'child', parentThreadId: 'root', agentNickname: 'Research' } })
    notify('thread/started', { thread: { id: 'grandchild', parentThreadId: 'child', agentNickname: 'Check' } })
    notify('item/agentMessage/delta', { threadId: 'child', turnId: 'child-turn', itemId: 'child-message', delta: 'CHILD_PRIVATE_OUTPUT' })
    notify('item/started', { threadId: 'grandchild', item: { type: 'commandExecution', id: 'tool', command: 'read', status: 'inProgress' } })
    notify('item/completed', { threadId: 'grandchild', item: { type: 'commandExecution', id: 'tool', command: 'read', status: 'completed' } })
    notify('item/agentMessage/delta', { threadId: 'root', turnId: 'turn', itemId: 'commentary', delta: '过程' })
    notify('item/completed', { threadId: 'root', item: { type: 'agentMessage', id: 'commentary', text: '过程', phase: 'commentary' } })
    notify('item/agentMessage/delta', { threadId: 'root', turnId: 'turn', itemId: 'final', delta: '完成🙂' })
    notify('item/completed', { threadId: 'root', item: { type: 'agentMessage', id: 'final', text: '完成🙂', phase: 'final_answer' } })
    notify('turn/completed', { threadId: 'grandchild', turn: { id: 'grandchild-turn', status: 'completed', items: [] } })
    notify('turn/completed', { threadId: 'child', turn: { id: 'child-turn', status: 'completed', items: [] } })
    notify('turn/completed', { threadId: 'root', turn: { id: 'turn', status: 'completed', items: [] } })
  } else if (id !== undefined) send({ id, result: {} })
})
rl.on('close', () => process.exit(0))
