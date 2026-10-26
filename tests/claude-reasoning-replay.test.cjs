'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { ClaudeMessagesBridge, ClaudeReasoningStore, translateMessages } = require('../desktop/services/claude-messages-bridge.cjs')
const model = { providerId: 'fixture', model: 'deepseek-flash', baseURL: 'https://fixture.invalid' }
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-reasoning-replay-')), file = path.join(root, 'reasoning.jsonl')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const create = (selected = model) => new ClaudeMessagesBridge({ model: selected, apiKey: 'offline-fixture', reasoningFile: file })
  return { root, file, create }
}
async function answer(bridge, messages, thought, text = 'OK') {
  let response
  await bridge.respond(Response.json({ choices: [{ message: { reasoning_content: thought, content: text }, finish_reason: 'stop' }] }),
    { writeHead() {}, end(value) { response = JSON.parse(value) } }, new Map(), { messages, stream: false }, null, 100)
  assert.doesNotMatch(JSON.stringify(response), /private-reasoning/)
  return { role: 'assistant', content: response.content }
}

test('text thought survives restart, SDK stripping and non-identical repeat answers', async t => {
  const { create } = fixture(t), first = [{ role: 'user', content: 'one' }]
  const a = await answer(create(), first, 'private-reasoning-one')
  const second = [...first, a, { role: 'user', content: 'two' }]
  const b = await answer(create(), second, 'private-reasoning-two')
  const restored = translateMessages({ messages: [...second, b] }, create().reasoning).filter(m => m.role === 'assistant')
  assert.deepEqual(restored.map(m => m.reasoning_content), ['private-reasoning-one', 'private-reasoning-two'])
})

test('a unique surviving answer restores after compaction, ambiguous repeated text is never guessed', async t => {
  const { create } = fixture(t), first = [{ role: 'user', content: 'one' }]
  const a = await answer(create(), first, 'private-reasoning-one')
  assert.equal(translateMessages({ messages: [{ role: 'user', content: 'summary' }, a] }, create().reasoning)[1].reasoning_content, 'private-reasoning-one')
  await answer(create(), [{ role: 'user', content: 'two' }], 'private-reasoning-two')
  assert.throws(() => translateMessages({ messages: [{ role: 'user', content: 'summary' }, a] }, create().reasoning), /无法唯一恢复/)
})

test('new message associations cannot restore a different model or provider', async t => {
  const { create } = fixture(t), messages = [{ role: 'user', content: 'one' }]
  const a = await answer(create(), messages, 'private-reasoning-one')
  for (const changed of [{ ...model, model: 'glm-5.3-flashx' }, { ...model, baseURL: 'https://another.invalid' }]) {
    assert.equal(translateMessages({ messages: [...messages, a] }, create(changed).reasoning)[1].reasoning_content, undefined)
  }
})

test('legacy tool records remain readable and damaged sidecar fails without exposing content', t => {
  const { file } = fixture(t)
  fs.writeFileSync(file, JSON.stringify({ id: 'stable-claude-reasoning-v1:legacy', text: 'private-reasoning-legacy', callIds: ['legacy-call'] }) + '\n')
  assert.equal(new ClaudeReasoningStore(file).forCalls([{ id: 'legacy-call' }]), 'private-reasoning-legacy')
  fs.appendFileSync(file, '{damaged private-reasoning}\n')
  assert.throws(() => new ClaudeReasoningStore(file), error => /记录损坏/.test(error.message) && !error.message.includes('private-reasoning'))
})

test('native DeepSeek cache usage preserves total tokens and ignores malformed counts', async t => {
  const { create } = fixture(t), bridge = create()
  for (const [usage, expected] of [
    [{ prompt_tokens: 100, prompt_cache_hit_tokens: 80, completion_tokens: 2 }, [20, 80]],
    [{ prompt_tokens: 100, prompt_cache_hit_tokens: 800, completion_tokens: 2 }, [0, 100]],
    [{ prompt_tokens: 100, prompt_cache_hit_tokens: -1, completion_tokens: 2 }, [100, 0]],
  ]) {
    let result
    await bridge.respond(Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }], usage }), { writeHead() {}, end(s) { result = JSON.parse(s) } }, new Map(), { stream: false, messages: [{ role: 'user', content: 'test' }] })
    assert.deepEqual([result.usage.input_tokens, result.usage.cache_read_input_tokens], expected)
  }
})

test('counting uses discovered schemas and restored thought, and calibrates from provider totals', async t => {
  const { create } = fixture(t), bridge = create()
  const tool = { name: 'Deferred', defer_loading: true, input_schema: { type: 'object', description: 'huge schema'.repeat(500) } }
  const messages = [{ role: 'user', content: 'one' }]
  const a = await answer(bridge, messages, 'private-reasoning-one'.repeat(100))
  const request = { tools: [tool], messages: [...messages, a, { role: 'user', content: 'two' }] }
  const body = bridge.countBody(request)
  assert.equal(body.tools, undefined)
  assert(body.messages.find(m => m.role === 'assistant').reasoning_content.length > 1000)
  bridge.tokenCounter.observe(body, { prompt_tokens: 1000 })
  assert.equal(bridge.tokenCounter.estimate(body).tokens, 1084)
  assert.equal(bridge.tokenCounter.estimate({ ...body, messages: body.messages.map(m => ({ ...m, reasoning_content: undefined })) }).calibrated, false)
})

test('ambiguous compacted thinking fails once as a local error without provider retry', async t => {
  const { create } = fixture(t)
  const a = await answer(create(), [{ role: 'user', content: 'one' }], 'private-reasoning-one')
  await answer(create(), [{ role: 'user', content: 'two' }], 'private-reasoning-two')
  const bridge = create(); let calls = 0, fatal
  bridge.fetch = async () => { calls++; throw Error('must not call provider') }
  bridge.onFatalError = message => { fatal = message }
  await bridge.start()
  try {
    const res = await fetch(bridge.baseURL + '/v1/messages', { method: 'POST', headers: { 'x-api-key': bridge.token }, body: JSON.stringify({ stream: false, messages: [{ role: 'user', content: 'summary' }, a, { role: 'user', content: 'continue' }] }) })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error.type, 'invalid_request_error')
    assert.match(fatal, /无法唯一恢复/); assert.equal(calls, 0)
  } finally { await bridge.close() }
})
