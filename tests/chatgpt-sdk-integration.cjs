'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { ClaudeHarnessRunner } = require('../desktop/services/claude-harness.cjs')
const model = { id: 'chatgpt:fixture:gpt-fixture', providerId: 'chatgpt', accountId: 'fixture', model: 'gpt-fixture', baseURL: 'https://api.openai.com/v1' }
function output(items) {
  return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: items, usage: { input_tokens: 100, output_tokens: 20 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
const message = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
const call = (name, args) => ({ type: 'function_call', call_id: 'call_native', name, namespace: 'stable_tools', arguments: JSON.stringify(args) })
test('ChatGPT transport preserves native Read, tool output, reasoning replay and session restart', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-chatgpt-sdk-')); const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const file = path.join(workspace, 'fixture.txt'); fs.writeFileSync(file, 'STABLE_READ_ONLY_FIXTURE')
  const events = []; let requests = 0
  const account = { request: async (_model, body) => {
    requests++; assert.equal(body.store, false); assert.equal(body.tools[0].type, 'namespace')
    assert(body.tools[0].tools.some(t => t.name === 'Read')); assert(!body.tools[0].tools.some(t => t.name === 'Bash'))
    if (requests === 1) return output([{ type: 'reasoning', id: 'rs_fixture', encrypted_content: 'fixture-encrypted', summary: [] }, call('Read', { file_path: file })])
    assert(body.input.some(item => item.type === 'reasoning' && item.encrypted_content === 'fixture-encrypted'))
    assert(body.input.some(item => item.type === 'function_call_output' && JSON.stringify(item.output).includes('STABLE_READ_ONLY_FIXTURE')))
    return output([message('CHATGPT_AGENT_OK')])
  } }
  const runner = new ClaudeHarnessRunner({ userData: root, workspace, chatgpt: account, fetchImpl: () => { throw Error('Unexpected fallback') } })
  t.after(() => { runner.cancel(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) })
  const session = { key: 'chatgpt-native', cwd: workspace, networkAccess: false }
  assert.equal(await runner.run('Read fixture.txt and reply.', model, 'chatgpt-subscription', 30000, event => events.push(event), 'read-only', [], session), 'CHATGPT_AGENT_OK')
  assert.equal(requests, 2)
  assert(events.some(event => event.status === 'completed' && event.id === 'call_native'))
  assert.equal(await runner.run('Remember the result.', model, 'chatgpt-subscription', 30000, undefined, 'read-only', [], session), 'CHATGPT_AGENT_OK')
  assert.equal(requests, 3)
})
test('ChatGPT native Bash still asks approval; rejection causes no write', { timeout: 45000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-chatgpt-approval-')); const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  let requests = 0, approvals = 0
  const runner = new ClaudeHarnessRunner({ userData: root, workspace, chatgpt: { request: async (_model, body) => {
    if (++requests === 1) return output([call('Bash', { command: 'printf never > forbidden.txt' })])
    assert(body.input.some(item => item.type === 'function_call_output' && /未批准|denied/i.test(JSON.stringify(item.output))))
    return output([message('APPROVAL_PRESERVED')])
  } } })
  t.after(() => { runner.cancel(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) })
  const result = await runner.run('Run fixture command', model, 'chatgpt-subscription', 30000, event => { if (event.kind === 'approval' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, false) } }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.equal(result, 'APPROVAL_PRESERVED'); assert.equal(approvals, 1); assert(!fs.existsSync(path.join(workspace, 'forbidden.txt')))
})
test('empty ChatGPT completion terminates the real SDK after one request', { timeout: 15000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-chatgpt-empty-')); let requests = 0
  const runner = new ClaudeHarnessRunner({ userData: root, workspace: root, chatgpt: { request: async () => { requests++; return output([]) } } })
  t.after(() => { runner.cancel(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) })
  await assert.rejects(runner.run('Reply briefly', model, 'chatgpt-subscription', 10000, undefined, 'read-only', [], { cwd: root }), /EMPTY_MODEL_RESPONSE/)
  assert.equal(requests, 1)
})
