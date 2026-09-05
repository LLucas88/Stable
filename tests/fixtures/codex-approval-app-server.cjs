'use strict'
const path = require('node:path')
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
let cwd
rl.on('line', (line) => {
  const { id, method, params: p, result } = JSON.parse(line)
  if (method === 'initialize') send({ id, result: {} })
  else if (method === 'thread/start' || method === 'thread/resume') { cwd = p.cwd; send({ id, result: { thread: { id: 'root' } } }) }
  else if (method === 'turn/start') {
    send({ id, result: { turn: { id: 'turn' } } })
    const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`
    const command = [path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), '-NoProfile', '-Command', p.input[0].text].map(quote).join(' ')
    send({ id: 'approval-test', method: 'item/commandExecution/requestApproval', params: { threadId: 'root', turnId: 'turn', itemId: 'tool', cwd, command, startedAtMs: Date.now(), environmentId: 'local', reason: `fixture request ${Date.now()}`, commandActions: [{ type: 'unknown', command }], availableDecisions: ['accept', 'cancel'], proposedExecpolicyAmendment: [command] } })
  } else if (id === 'approval-test') send({ method: 'turn/completed', params: { threadId: 'root', turn: { id: 'turn', status: 'completed', items: [{ type: 'agentMessage', id: 'answer', phase: 'final_answer', text: result.decision }] } } })
  else if (id !== undefined) send({ id, result: {} })
})
rl.on('close', () => process.exit(0))
