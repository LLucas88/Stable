'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { CodexResponsesBridge, translateInput, translateTools, readSSE, chatURL } = require('../desktop/services/codex-responses-bridge.cjs')
const { CodexHarnessRunner, codexEnvironment, buildConfig, sessionDirectory, clearCodexSession } = require('../desktop/services/codex-harness.cjs')
const { HarnessRunner } = require('../desktop/services/execution-harness.cjs')

const model = { id: 'test', providerId: 'test', model: 'test-model', baseURL: 'https://provider.example/v1' }
const completion = (delta, finish_reason = null) => ({ choices: [{ index: 0, delta, finish_reason }] })
function upstream(chunks) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
async function responseEvents(bridge, input) {
  const response = await fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}`, 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const events = []; for await (const event of readSSE(response.body)) events.push(event)
  return events
}

test('execution factory uses Codex by default with an explicit legacy rollback', () => {
  const previous = process.env.STABLE_HARNESS
  try {
    delete process.env.STABLE_HARNESS
    assert.ok(new HarnessRunner({}) instanceof CodexHarnessRunner)
    process.env.STABLE_HARNESS = 'deepseek'
    assert.equal(new HarnessRunner({}).supportsPersistentSessions, undefined)
  } finally { if (previous === undefined) delete process.env.STABLE_HARNESS; else process.env.STABLE_HARNESS = previous }
})

test('provider URLs preserve existing v1 and vendor paths without appending another v1', () => {
  assert.equal(chatURL('https://api.example/v1/'), 'https://api.example/v1/chat/completions')
  assert.equal(chatURL('https://api.example/api/paas/v4'), 'https://api.example/api/paas/v4/chat/completions')
  assert.throws(() => chatURL('file:///secret'), /地址无效/)
  assert.throws(() => chatURL('https://user:password@api.example'), /地址无效/)
})

test('Responses history keeps tool call IDs, namespace, raw custom input and real image content', () => {
  const image = 'data:image/png;base64,cGl4ZWw='
  const messages = translateInput([
    { role: 'developer', content: [{ type: 'input_text', text: 'instructions' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'inspect' }, { type: 'input_image', image_url: image }] },
    { type: 'reasoning', encrypted_content: 'opaque' },
    { type: 'function_call', call_id: 'a', namespace: 'agents', name: 'spawn', arguments: '{"message":"hello"}' },
    { type: 'custom_tool_call', call_id: 'b', name: 'apply_patch', input: '*** Begin Patch\n*** End Patch' },
    { type: 'function_call_output', call_id: 'a', output: 'child-id' },
    { type: 'custom_tool_call_output', call_id: 'b', output: 'done' },
  ], 'base')
  assert.equal(messages[1].role, 'system')
  assert.equal(messages[2].content[1].image_url.url, image)
  assert.equal(messages[3].tool_calls.length, 2)
  assert.equal(messages[3].tool_calls[0].function.name, 'agents__spawn')
  assert.equal(JSON.parse(messages[3].tool_calls[1].function.arguments).input, '*** Begin Patch\n*** End Patch')
  assert.deepEqual(messages.slice(-2).map((message) => message.tool_call_id), ['a', 'b'])
  assert.doesNotMatch(JSON.stringify(messages), /opaque/)
})

test('unsupported Responses input and native hosted tools fail explicitly', () => {
  assert.throws(() => translateInput([{ role: 'user', content: [{ type: 'input_file' }] }]), /不支持消息内容/)
  assert.throws(() => translateTools([{ type: 'web_search' }]), /不支持工具类型/)
})

test('SSE parser preserves Chinese text split across bytes and accepts CRLF', async () => {
  const data = Buffer.from('data: {"text":"中文🙂"}\r\n\r\ndata: [DONE]\n\n')
  async function* fragments() { for (const byte of data) yield Buffer.from([byte]) }
  const values = []; for await (const value of readSSE(fragments())) values.push(value)
  assert.deepEqual(values, [{ text: '中文🙂' }])
})

test('bridge requires its own capability and does not forward an arbitrary URL or model', async () => {
  const captured = []
  const bridge = new CodexResponsesBridge({ model, apiKey: 'provider-secret', fetchImpl: async (url, request) => { captured.push({ url, request }); return upstream([completion({ content: 'OK' }, 'stop')]) } })
  await bridge.start()
  try {
    assert.equal((await fetch(`${bridge.baseURL}/responses`, { method: 'POST', body: '{}' })).status, 401)
    assert.equal((await fetch(`${bridge.baseURL}/other`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: '{}' })).status, 404)
    const events = await responseEvents(bridge, { model: 'attacker-model', input: 'hello', stream: true })
    assert.equal(captured.length, 1)
    assert.equal(captured[0].url, 'https://provider.example/v1/chat/completions')
    assert.equal(JSON.parse(captured[0].request.body).model, 'test-model')
    assert.equal(captured[0].request.headers.authorization, 'Bearer provider-secret')
    assert.doesNotMatch(JSON.stringify(events), /provider-secret/)
    assert.equal(events.at(-1).type, 'response.completed')
  } finally { await bridge.close() }
})

test('bridge streams text and preserves upstream usage', async () => {
  const bridge = new CodexResponsesBridge({ model, apiKey: 'key', fetchImpl: async () => upstream([
    completion({ content: '你' }), completion({ content: '好' }, 'stop'),
    { choices: [], usage: { prompt_tokens: 30, completion_tokens: 2, total_tokens: 32, prompt_tokens_details: { cached_tokens: 10 } } },
  ]) })
  await bridge.start()
  try {
    const events = await responseEvents(bridge, { input: 'hello' })
    assert.deepEqual(events.filter((event) => event.type === 'response.output_text.delta').map((event) => event.delta), ['你', '好'])
    const result = events.at(-1).response
    assert.equal(result.output.find((item) => item.type === 'message').content[0].text, '你好')
    assert.equal(result.usage.input_tokens_details.cached_tokens, 10)
    assert.equal(result.usage.total_tokens, 32)
  } finally { await bridge.close() }
})

test('function and custom tools survive translation in both directions', async () => {
  const bridge = new CodexResponsesBridge({ model, apiKey: 'key', fetchImpl: async () => upstream([
    completion({ tool_calls: [{ index: 0, id: 'a', function: { name: 'agents__spawn', arguments: '{"message":' } }] }),
    completion({ tool_calls: [{ index: 0, function: { arguments: '"hello"}' } }, { index: 1, id: 'b', function: { name: 'apply_patch', arguments: '{"input":"patch"}' } }] }, 'tool_calls'),
  ]) })
  await bridge.start()
  try {
    const events = await responseEvents(bridge, { input: 'task', tools: [{ type: 'namespace', name: 'agents', tools: [{ type: 'function', name: 'spawn', parameters: { type: 'object' } }] }, { type: 'custom', name: 'apply_patch' }] })
    const output = events.at(-1).response.output.filter((item) => item.type !== 'reasoning')
    assert.equal(output[0].namespace, 'agents'); assert.equal(output[0].name, 'spawn'); assert.equal(output[0].call_id, 'a')
    assert.equal(output[1].type, 'custom_tool_call'); assert.equal(output[1].input, 'patch')
  } finally { await bridge.close() }
})

test('broken streams and malformed tools never report successful completion', async () => {
  for (const chunks of [
    [completion({ content: 'partial' })],
    [completion({ content: 'partial' }, 'length')],
    [completion({ tool_calls: [{ index: 0, id: 'a', function: { name: 'unknown', arguments: '{}' } }] }, 'tool_calls')],
    [completion({ tool_calls: [{ index: 0, id: 'a', function: { name: 'known', arguments: '{broken' } }] }, 'tool_calls')],
  ]) {
    const bridge = new CodexResponsesBridge({ model, apiKey: 'secret', fetchImpl: async () => upstream(chunks) })
    await bridge.start()
    try {
      const events = await responseEvents(bridge, { input: 'task', tools: [{ type: 'function', name: 'known' }] })
      assert.equal(events.at(-1).type, 'error')
      assert.equal(events.some((event) => event.type === 'response.completed'), false)
    } finally { await bridge.close() }
  }
})

test('upstream credential errors are redacted', async () => {
  const bridge = new CodexResponsesBridge({ model, apiKey: 'top-secret', fetchImpl: async () => new Response('invalid top-secret', { status: 401 }) })
  await bridge.start()
  try {
    const response = await fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: '{"input":"hello"}' })
    assert.equal(response.status, 401)
    assert.doesNotMatch(await response.text(), /top-secret/)
  } finally { await bridge.close() }
})

test('a rejected image cannot silently turn into a text-only model request', async () => {
  let calls = 0
  const bridge = new CodexResponsesBridge({ model, apiKey: 'key', expectedImages: 1, fetchImpl: async () => { calls++; return upstream([completion({ content: 'OK' }, 'stop')]) } })
  await bridge.start()
  try {
    const response = await fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: JSON.stringify({ input: [{ role: 'user', content: [{ type: 'input_text', text: 'image omitted' }] }] }) })
    assert.equal(response.status, 502)
    assert.match((await response.json()).error.message, /无法解析部分图片/)
    assert.equal(calls, 0)
  } finally { await bridge.close() }
})

test('each bridge isolates model credentials and cancellation aborts upstream fetch', async () => {
  let upstreamSignal; let called
  const started = new Promise((resolve) => { called = resolve })
  const bridge = new CodexResponsesBridge({ model, apiKey: 'key', fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    upstreamSignal = options.signal; called()
    options.signal.addEventListener('abort', () => reject(new Error('aborted')))
  }) })
  await bridge.start()
  const request = fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: '{"input":"hello"}' }).catch(() => null)
  await started; await bridge.close(); await request
  assert.equal(upstreamSignal.aborted, true)
  assert.notEqual(bridge.token, new CodexResponsesBridge({ model, apiKey: 'key' }).token)
})

test('Codex environment excludes host credentials and uses an isolated home', () => {
  const env = codexEnvironment({ PATH: 'tools', OPENAI_API_KEY: 'real', STABLE_API_KEY: 'real', GH_TOKEN: 'real', DSH_HOME: 'old', CODEX_HOME: 'host', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' }, 'isolated', 'loopback', 'C:\\runtime\\bin\\codex.exe')
  assert.equal(env.CODEX_HOME, 'isolated'); assert.equal(env.STABLE_CODEX_GATEWAY_TOKEN, 'loopback')
  assert.doesNotMatch(JSON.stringify(env), /real|--inspect/)
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
  const config = buildConfig({ model, baseURL: 'http://127.0.0.1:1/v1', searchEnabled: false })
  assert.match(config, /requires_openai_auth = false/)
  assert.match(config, /plugins = false/)
  assert.match(config, /sandbox_mode = "workspace-write"/)
})

test('clearing one session does not remove other sessions or follow user-provided paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-codex-session-'))
  try {
    for (const key of ['a', '../outside']) {
      const home = sessionDirectory(root, key); fs.mkdirSync(home, { recursive: true })
      fs.writeFileSync(path.join(home, 'stable-thread.json'), '{}')
    }
    clearCodexSession(root, 'a')
    assert.equal(fs.existsSync(path.join(sessionDirectory(root, 'a'), 'stable-thread.json')), false)
    assert.equal(fs.existsSync(path.join(sessionDirectory(root, '../outside'), 'stable-thread.json')), true)
    assert.ok(sessionDirectory(root, '../outside').startsWith(path.join(root, 'codex', 'sessions')))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('Codex runtime is shipped in both full and update packages', () => {
  const pkg = require('../package.json'); const update = require('../build/update-builder.config.cjs')
  assert.ok(pkg.build.extraResources.some((item) => item.to === 'codex'))
  assert.ok(update.extraResources.some((item) => item.to === 'codex'))
  assert.equal(update.extraResources.some((item) => item.to === 'runtime'), false)
  assert.equal(pkg.devDependencies['@openai/codex'], '0.142.2')
})

test('descendant events keep parent depth and never leak child answers into the main reply', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-codex-protocol-'))
  const options = { userData: root, workspace: path.join(root, 'workspace'), executable: process.execPath, executableArgs: [path.join(__dirname, 'fixtures', 'codex-app-server.cjs')] }
  try {
    const events = []; const runner = new CodexHarnessRunner(options)
    const result = await runner.run('test', model, 'never-sent', 5000, (event) => events.push(event), 'read-only', [], { key: 'a', initialPrompt: 'INITIAL_HISTORY' })
    assert.equal(result, '完成🙂')
    assert.equal(events.some((event) => event.delta === 'CHILD_PRIVATE_OUTPUT'), false)
    const grandchild = events.find((event) => event.sessionId === 'grandchild' && event.kind === 'tool')
    assert.equal(grandchild.parentSessionId, 'child'); assert.equal(grandchild.depth, 2)
    const deltas = events.filter((event) => event.eventType === 'agent/answer-delta')
    assert.notEqual(deltas[0].step, deltas[1].step)
    const inputPath = path.join(sessionDirectory(root, 'a'), 'fixture-input.json')
    assert.equal(JSON.parse(fs.readFileSync(inputPath)).input[0].text, 'INITIAL_HISTORY')
    await new CodexHarnessRunner(options).run('NEXT', model, 'never-sent', 5000, () => {}, 'read-only', [], { key: 'a', initialPrompt: 'DUPLICATE_HISTORY' })
    assert.equal(JSON.parse(fs.readFileSync(inputPath)).input[0].text, 'NEXT')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('process crashes and corrupt session pointers release the runner lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-codex-failure-'))
  const runner = new CodexHarnessRunner({ userData: root, workspace: path.join(root, 'workspace'), executable: process.execPath, executableArgs: [path.join(__dirname, 'fixtures', 'codex-app-server.cjs')] })
  try {
    await assert.rejects(runner.run('EARLY_EXIT', model, 'never-sent', 5000), /运行时已退出/)
    assert.equal(runner.busy, false)
    const home = sessionDirectory(root, 'bad'); fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, 'stable-thread.json'), 'broken')
    await assert.rejects(runner.run('test', model, 'never-sent', 5000, () => {}, 'read-only', [], { key: 'bad' }), /会话索引损坏/)
    assert.equal(runner.busy, false)
    clearCodexSession(root, 'bad')
    assert.equal(await runner.run('RECOVERED', model, 'never-sent', 5000, () => {}, 'read-only', [], { key: 'bad' }), '完成🙂')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
