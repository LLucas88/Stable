'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { ChatGPTResponses, alias } = require('../desktop/services/chatgpt-responses.cjs')
const { readSSE } = require('../desktop/services/model-provider.cjs')
const model = { accountId: 'fixture', model: 'gpt-fixture', providerId: 'chatgpt' }
const textItem = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
const complete = output => ({ type: 'response.completed', response: { status: 'completed', output, usage: { input_tokens: 30, output_tokens: 5 } } })
const sse = events => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
async function chunks(response) { const result = []; for await (const chunk of readSSE(response.body)) result.push(chunk); return result }
test('Responses request maps complete history, images, namespaces and omits unsupported sampling parameters', () => {
  const bridge = new ChatGPTResponses({ account: {}, model })
  const name = 'mcp__' + 'long_name'.repeat(10)
  const { request, names } = bridge.translate({ messages: [{ role: 'system', content: 'system' }, { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aa' } }] }, { role: 'assistant', tool_calls: [{ id: 'call1', function: { name, arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'call1', content: 'result' }], tools: [{ function: { name, description: '', parameters: { type: 'object' } } }], temperature: .5, max_tokens: 100, tool_choice: 'auto' })
  assert.equal(request.store, false); assert.equal(request.stream, true); assert.equal(request.input[0].role, 'developer')
  assert.equal(request.input[1].content[1].type, 'input_image'); assert.equal(request.tools[0].type, 'namespace')
  assert.equal(request.tools[0].tools[0].strict, false); assert.equal(names.get(alias(name)), name)
  assert.equal(request.input[2].name, alias(name)); assert.equal(request.input[3].call_id, 'call1')
  assert(!('temperature' in request)); assert(!('max_output_tokens' in request)); assert(!('max_tokens' in request))
})
test('streams text and restores tool names only after response.completed', async () => {
  const name = 'long-tool.'.repeat(10)
  const bridge = new ChatGPTResponses({ model, account: { request: async () => sse([{ type: 'response.output_text.delta', delta: 'hi' }, { type: 'response.function_call_arguments.delta', delta: '{' }, complete([textItem('hi'), { type: 'function_call', namespace: 'stable_tools', call_id: 'call', name: alias(name), arguments: '{}' }])]) } })
  const output = await chunks(await bridge.request({ messages: [], tools: [{ function: { name, parameters: {} } }] }))
  assert.equal(output[0].choices[0].delta.content, 'hi'); assert(!output[0].choices[0].delta.tool_calls)
  assert.equal(output.at(-1).choices[0].delta.tool_calls[0].function.name, name)
  assert.equal(output.at(-1).choices[0].finish_reason, 'tool_calls')
})
test('partial function calls, failure events and quota never yield executable calls', async t => {
  for (const events of [[{ type: 'response.function_call_arguments.done', arguments: '{}' }], [{ type: 'response.incomplete', response: { status: 'incomplete' } }], [{ type: 'error', code: 'subscription_sharing_usage_limit_exceeded', message: 'secret' }]]) {
    const bridge = new ChatGPTResponses({ model, account: { request: async () => sse(events) } })
    await assert.rejects(chunks(await bridge.request({ messages: [] })), e => e.requestRejected && !e.message.includes('secret'))
  }
})
test('SIWC empty final output assembles completed items; added or partial items are never executed', async () => {
  const call = { type: 'function_call', namespace: 'stable_tools', status: 'completed', call_id: 'real-shape', name: 'Read', arguments: '{}' }
  const bridge = new ChatGPTResponses({ model, account: { request: async () => sse([{ type: 'response.output_item.done', output_index: 0, item: call }, complete([])]) } })
  const result = await chunks(await bridge.request({ messages: [], tools: [{ function: { name: 'Read', parameters: {} } }] }))
  assert.equal(result.at(-1).choices[0].delta.tool_calls[0].id, 'real-shape')
  for (const events of [[{ type: 'response.output_item.added', output_index: 0, item: call }, complete([])], [{ type: 'response.output_item.done', output_index: 0, item: call }], [complete([])]]) {
    const failed = new ChatGPTResponses({ model, account: { request: async () => sse(events) } })
    await assert.rejects(chunks(await failed.request({ messages: [] })), error => error.requestRejected)
  }
})
test('encrypted reasoning context persists across process-style adapter restart', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-chatgpt-response-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const output = [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque-reasoning', summary: [] }, { type: 'function_call', id: 'fc_1', namespace: 'stable_tools', call_id: 'call1', name: 'Read', arguments: '{}' }]
  const options = { model, reasoningFile: path.join(root, 'reasoning'), account: { request: async () => sse([complete(output)]) } }
  const first = new ChatGPTResponses(options)
  await chunks(await first.request({ messages: [], tools: [{ function: { name: 'Read', parameters: {} } }] }))
  const second = new ChatGPTResponses(options)
  const { request } = second.translate({ messages: [{ role: 'assistant', tool_calls: [{ id: 'call1', function: { name: 'Read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'call1', content: 'done' }] })
  assert.deepEqual(request.input.slice(0, 2), output); assert.equal(request.input[2].output, 'done')
  const other = new ChatGPTResponses({ ...options, model: { ...model, accountId: 'different' } })
  assert.equal(other.records.size, 0)
})
test('IPC guards every auth operation and uses a fixed usage URL', async () => {
  const handlers = new Map(); const { registerChatGPT } = require('../desktop/services/chatgpt-ipc.cjs')
  registerChatGPT({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, account: { state: () => ({ status: 'connected' }) }, guard: event => { if (event !== 'main') throw Error('blocked') }, openExternal: async url => assert.equal(url, 'https://chatgpt.com/settings/usage') })
  for (const handler of handlers.values()) await assert.rejects(handler('foreign'), /blocked/)
  assert.deepEqual(await handlers.get('stable:chatgpt:status')('main'), { status: 'connected' })
  await handlers.get('stable:chatgpt:openUsage')('main')
})
test('subscription catalog coexists with other providers and never falls back on logout', () => {
  const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
  const apiModel = { id: 'api', providerId: 'custom', model: 'api-model', displayName: 'API', baseURL: 'https://api.example/v1' }
  const store = { modelCatalog: () => ({ items: [apiModel], defaultModelId: 'api' }), modelProfile: () => apiModel }
  let items = [{ ...model, id: 'chatgpt:fixture:gpt-fixture', hasApiKey: true }]
  const registry = new ModelRegistry(store, { has: () => true, get: () => 'api-key' }, null, { catalog: () => items })
  assert.equal(registry.publicCatalog().items.length, 2); assert.equal(registry.publicCatalog().defaultModelId, 'api')
  assert.equal(registry.resolve(items[0].id).apiKey, 'chatgpt-subscription')
  const selected = items[0].id; items = []
  assert.throws(() => registry.resolve(selected), /重新登录/)
  assert.equal(registry.resolve('api').apiKey, 'api-key')
  assert.throws(() => registry.save({ providerId: 'ChatGPT' }), /登录入口/)
})
