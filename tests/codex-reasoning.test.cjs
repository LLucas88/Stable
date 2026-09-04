'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { CodexResponsesBridge, readSSE } = require('../desktop/services/codex-responses-bridge.cjs')
const { CodexReasoningStore } = require('../desktop/services/codex-reasoning-store.cjs')
const { CodexHarnessRunner, sessionDirectory, readableCodexErrorMessage } = require('../desktop/services/codex-harness.cjs')
const model = { model: 'deepseek-v4-flash', providerId: 'deepseek', baseURL: 'https://mock.invalid/v1' }
const tools = [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }]
function completion(delta, reason = 'stop') {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`)
}
async function request(bridge, input) {
  const response = await fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: JSON.stringify({ input, tools }) })
  if (!response.ok) throw new Error(await response.text())
  const events = []; for await (const item of readSSE(response.body)) events.push(item)
  assert.equal(events.at(-1).type, 'response.completed', JSON.stringify(events.at(-1)))
  return events.at(-1).response.output
}
// Codex omits Responses item IDs when replaying history.
function replay(output) { return output.map(({ id, status, ...item }) => item) }

test('thinking history survives bridge restart, including plain replies and commentary plus tools', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-reasoning-'))
  const reasoningFile = path.join(root, 'reasoning.jsonl')
  let bridge
  try {
    bridge = new CodexResponsesBridge({ model, apiKey: 'not-a-real-key', reasoningFile, fetchImpl: async () => completion({ reasoning_content: 'PRIVATE_FIRST', content: 'first answer' }) })
    await bridge.start()
    const history = [{ role: 'user', content: 'first' }, ...replay(await request(bridge, 'first'))]
    assert.doesNotMatch(JSON.stringify(history), /PRIVATE_FIRST/)
    await bridge.close()
    bridge = new CodexResponsesBridge({ model, apiKey: 'not-a-real-key', reasoningFile, fetchImpl: async (_url, options) => {
      const messages = JSON.parse(options.body).messages
      assert.equal(messages.find((m) => m.role === 'assistant').reasoning_content, 'PRIVATE_FIRST')
      return completion({ reasoning_content: 'PRIVATE_TOOL', content: 'I will read the file', tool_calls: [{ index: 0, id: 'call-1', function: { name: 'read_file', arguments: '{}' } }, { index: 1, id: 'call-2', function: { name: 'read_file', arguments: '{}' } }] }, 'tool_calls')
    } })
    await bridge.start()
    history.push({ role: 'user', content: 'continue' })
    history.push(...replay(await request(bridge, history)))
    await bridge.close()
    bridge = new CodexResponsesBridge({ model, apiKey: 'not-a-real-key', reasoningFile, fetchImpl: async (_url, options) => {
      const assistants = JSON.parse(options.body).messages.filter((m) => m.role === 'assistant')
      assert.equal(assistants.length, 2)
      assert.equal(assistants[0].reasoning_content, 'PRIVATE_FIRST')
      assert.equal(assistants[1].reasoning_content, 'PRIVATE_TOOL')
      assert.equal(assistants[1].tool_calls.length, 2)
      assert.match(JSON.stringify(assistants[1].content), /I will read the file/)
      return completion({ reasoning_content: 'PRIVATE_FINAL', content: 'done' })
    } })
    await bridge.start()
    history.push({ type: 'function_call_output', call_id: 'call-1', output: 'one' }, { type: 'function_call_output', call_id: 'call-2', output: 'two' })
    await request(bridge, history)
  } finally { await bridge?.close(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('reasoning state is isolated and missing or corrupt records fail explicitly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-reasoning-store-'))
  try {
    const file = path.join(root, 'state.jsonl'); const store = new CodexReasoningStore(file)
    const first = store.remember('FIRST')
    for (let index = 0; index < 501; index++) store.remember(`record-${index}`)
    assert.equal(new CodexReasoningStore(file).get(first), 'FIRST')
    assert.throws(() => new CodexReasoningStore().get(first), /记录缺失/)
    fs.appendFileSync(file, '{broken')
    assert.throws(() => new CodexReasoningStore(file), /记录损坏/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('legacy sessions seed compatible context from Stable history and keep existing files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-reasoning-migrate-'))
  const home = sessionDirectory(root, 'legacy'); fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, 'stable-thread.json'), JSON.stringify({ threadId: 'old', seeded: true, version: '0.142.2' }))
  fs.writeFileSync(path.join(home, 'original-rollout.txt'), 'KEEP')
  const events = []
  const runner = new CodexHarnessRunner({ userData: root, workspace: path.join(root, 'workspace'), executable: process.execPath, executableArgs: [path.join(__dirname, 'fixtures/codex-app-server.cjs')] })
  try {
    await runner.run('NEXT', model, 'fake-key', 5000, (event) => events.push(event), 'read-only', [], { key: 'legacy', initialPrompt: 'STABLE_HISTORY_AND_CURRENT_TASK' })
    const input = JSON.parse(fs.readFileSync(path.join(home, 'fixture-input.json'))).input[0].text
    assert.match(input, /STABLE_HISTORY_AND_CURRENT_TASK/)
    assert.match(input, /避免重复追加/)
    assert.equal(events.some((event) => event.id === 'codex-context-upgrade'), true)
    assert.equal(fs.readFileSync(path.join(home, 'original-rollout.txt'), 'utf8'), 'KEEP')
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'stable-thread.json'))).reasoningVersion, 1)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('provider errors display a readable message instead of nested escaped JSON', async () => {
  const message = '模型服务请求失败（HTTP 400）：reasoning_content is missing'
  assert.equal(readableCodexErrorMessage(new Error(JSON.stringify({ error: { message } }))), message)
  const bridge = new CodexResponsesBridge({ model, apiKey: 'key', fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'reasoning_content is missing' } }), { status: 400 }) })
  await bridge.start()
  try {
    const response = await fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: '{"input":"hello"}' })
    assert.equal((await response.json()).error.message, message)
  } finally { await bridge.close() }
})
