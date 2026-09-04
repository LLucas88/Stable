'use strict'

const fs = require('node:fs')
const path = require('node:path')
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
let start
rl.on('line', (line) => {
  const { id, method, params, result } = JSON.parse(line)
  if (method === 'initialize') send({ id, result: {} })
  else if (method === 'thread/start' || method === 'thread/resume') {
    start = { method, params }
    send({ id, result: { thread: { id: 'root' } } })
  } else if (method === 'turn/start') {
    fs.writeFileSync(path.join(process.env.CODEX_HOME, 'fixture-start.json'), JSON.stringify({ start, input: params.input }))
    send({ id, result: { turn: { id: 'turn' } } })
    send({ method: 'turn/started', params: { threadId: 'root', turn: { id: 'turn' } } })
    send({ id: 'call', method: 'item/tool/call', params: { threadId: 'root', turnId: 'turn', callId: 'tool', namespace: null, tool: 'stable_browser', arguments: { action: 'click', ref: 'e1' } } })
  } else if (id === 'call') {
    send({ method: 'turn/completed', params: { threadId: 'root', turn: { id: 'turn', status: 'completed', items: [{ type: 'agentMessage', id: 'answer', phase: 'final_answer', text: JSON.stringify(result) }] } } })
  } else if (id !== undefined) send({ id, result: {} })
})
rl.on('close', () => process.exit(0))
