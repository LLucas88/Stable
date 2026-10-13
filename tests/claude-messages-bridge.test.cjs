'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { ClaudeMessagesBridge, translateMessages, translateTools, estimatedTokens } = require('../desktop/services/claude-messages-bridge.cjs')
const { readSSE } = require('../desktop/services/model-provider.cjs')
const { WAIT_MARKER } = require('../desktop/services/clarification.cjs')

const model = { id: 'test', providerId: 'test', model: 'actual-provider-model', baseURL: 'https://provider.example/v1' }
const completion = (delta, finish_reason = null) => ({ choices: [{ index: 0, delta, finish_reason }] })
const tool = { name: 'Read', description: 'Read a file', input_schema: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } }
const request = (overrides = {}) => ({ model: 'claude-compatibility-name', max_tokens: 4000, stream: true, messages: [{ role: 'user', content: 'hello' }], ...overrides })
function upstream(chunks) {
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
async function send(bridge, input, { route = '/v1/messages', headers = {} } = {}) {
  return fetch(`${bridge.baseURL}${route}`, { method: 'POST', headers: { 'x-api-key': bridge.token, 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) })
}
async function events(bridge, input) {
  const response = await send(bridge, input)
  assert.equal(response.status, 200)
  const values = []; for await (const value of readSSE(response.body)) values.push(value)
  return values
}

test('local request guard fails once with redacted reason before contacting upstream', async () => {
  let calls = 0, fatal
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'secret-test', onRequest: () => { throw Error('budget exhausted secret-test') }, onFatalError: value => { fatal = value }, fetchImpl: async () => { calls++; throw Error('must not fetch') } })
  await bridge.start()
  try {
    const response = await send(bridge, request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.type, 'invalid_request_error')
    assert.equal(fatal, 'budget exhausted [redacted]')
    assert.equal(calls, 0)
  } finally { await bridge.close() }
})

test('request budget guidance is refreshed for corrective generation without accumulating stale reminders', async () => {
  let calls = 0
  const bodies = []
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', onRequest: () => `BUDGET_${++calls}`, fetchImpl: async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return calls === 1
      ? upstream([completion({ tool_calls: [{ index: 0, id: 'bad', function: { name: 'Read', arguments: '{' } }] }, 'tool_calls')])
      : upstream([completion({ content: 'Cannot finish' }, 'stop')])
  } })
  await bridge.start()
  try {
    await events(bridge, request({ system: 'BASE_RULES', tools: [tool] }))
    assert.equal(bodies.length, 2)
    assert.match(bodies[0].messages[0].content, /BASE_RULES.*\n\nBUDGET_1/s)
    assert.match(bodies[1].messages[0].content, /BASE_RULES.*\n\nBUDGET_2/s)
    assert.doesNotMatch(bodies[1].messages[0].content, /BUDGET_1/)
    assert.equal(bodies[1].messages.at(-1).role, 'user')
    assert.match(bodies[1].messages.at(-1).content, /整组工具调用均未执行/)
  } finally { await bridge.close() }
})

test('deferred schemas require successful ToolSearch references and disappear after compaction', async () => {
  const bodies = []
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'fixture', fetchImpl: async (_url, init) => { bodies.push(JSON.parse(init.body)); return upstream([completion({ content: 'ok' }, 'stop')]) } })
  await bridge.start()
  try {
    const deferred = { name: 'mcp__fixture__query', description: 'query data', input_schema: { type: 'object', properties: {} }, defer_loading: true }
    const tools = [tool, { name: 'ToolSearch', input_schema: { type: 'object', properties: {} } }, deferred]
    const history = [
      { role: 'user', content: 'find query tool' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'find', name: 'ToolSearch', input: { query: 'query' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'find', content: [{ type: 'tool_reference', tool_name: deferred.name }] }] },
    ]
    await events(bridge, request({ tools }))
    assert(!bodies.at(-1).tools.some(t => t.function.name === deferred.name))
    await events(bridge, request({ tools, messages: history }))
    assert(bodies.at(-1).tools.some(t => t.function.name === deferred.name))
    assert.match(bodies.at(-1).messages.at(-1).content, /Tool available: mcp__fixture__query/)
    const failed = structuredClone(history); failed[2].content[0].is_error = true
    await events(bridge, request({ tools, messages: failed }))
    assert(!bodies.at(-1).tools.some(t => t.function.name === deferred.name))
    await events(bridge, request({ tools, messages: [{ role: 'user', content: 'compacted summary' }] }))
    assert(!bodies.at(-1).tools.some(t => t.function.name === deferred.name))
    assert.throws(() => translateMessages({ tools: [], messages: history }), /未知工具引用/)
  } finally { await bridge.close() }
})

test('native Messages HTTP streams Chinese text, actual provider and complete usage', async () => {
  let sent
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    sent = { url: req.url, authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const chunk of [completion({ content: '你' }), completion({ content: '好🙂' }, 'stop'), { choices: [], usage: { prompt_tokens: 30, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 10 } } }]) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const bridge = new ClaudeMessagesBridge({ model: { ...model, baseURL: `http://127.0.0.1:${server.address().port}/v1` }, apiKey: 'parent-only-key' })
  await bridge.start()
  try {
    assert.match(bridge.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/)
    const values = await events(bridge, request())
    assert.equal(sent.url, '/v1/chat/completions')
    assert.equal(sent.body.model, model.model)
    assert.equal(sent.authorization, 'Bearer parent-only-key')
    assert.equal(values[0].type, 'message_start')
    assert.equal(values[0].message.model, model.model)
    assert.deepEqual(values.filter(value => value.type === 'content_block_delta').map(value => value.delta.text), ['你', '好🙂'])
    assert.equal(values.at(-2).delta.stop_reason, 'end_turn')
    assert.equal(values.at(-2).usage.input_tokens, 20)
    assert.equal(values.at(-2).usage.cache_read_input_tokens, 10)
    assert.equal(values.at(-2).usage.output_tokens, 3)
    assert.equal(values.at(-1).type, 'message_stop')
    assert.doesNotMatch(JSON.stringify(values), /parent-only-key/)
  } finally { await bridge.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('fragmented tool names and JSON retain distinct IDs, native block indices and tool_use finish', async () => {
  let body
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', onRequest: value => { body = value }, fetchImpl: async () => upstream([
    completion({ content: '检查文件' }),
    completion({ tool_calls: [{ index: 1, id: 'call-2', function: { name: 'Re', arguments: '{"file_' } }, { index: 0, id: 'call-1', function: { name: 'Read', arguments: '{"file_path":"a"}' } }] }),
    completion({ tool_calls: [{ index: 1, function: { name: 'ad', arguments: 'path":"b"}' } }] }, 'tool_calls'),
  ]) })
  await bridge.start()
  try {
    const values = await events(bridge, request({ tools: [{ ...tool, cache_control: { type: 'ephemeral' }, defer_loading: false }], tool_choice: { type: 'any', disable_parallel_tool_use: true } }))
    assert.deepEqual(body.tools[0].function.parameters, tool.input_schema)
    assert.equal(body.tool_choice, 'required'); assert.equal(body.parallel_tool_calls, false)
    assert.equal(body.tools[0].cache_control, undefined)
    const blocks = values.filter(value => value.type === 'content_block_start')
    assert.deepEqual(blocks.map(value => value.index), [0, 1, 2])
    assert.deepEqual(blocks.slice(1).map(value => value.content_block.id), ['call-1', 'call-2'])
    assert.deepEqual(values.filter(value => value.delta?.type === 'input_json_delta').map(value => JSON.parse(value.delta.partial_json)), [{ file_path: 'a' }, { file_path: 'b' }])
    assert.equal(values.at(-2).delta.stop_reason, 'tool_use')
    assert.equal(values.at(-1).type, 'message_stop')
  } finally { await bridge.close() }
})

test('private provider thinking survives tool replay after bridge restart without visible thought', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-thinking-'))
  const reasoningFile = path.join(directory, 'reasoning.jsonl')
  const first = new ClaudeMessagesBridge({ model, apiKey: 'key', reasoningFile, fetchImpl: async () => upstream([
    completion({ reasoning_content: 'PRIVATE_CHAIN_OF_THOUGHT' }),
    completion({ tool_calls: [{ index: 0, id: 'persistent-call', function: { name: 'Read', arguments: '{"file_path":"a"}' } }] }, 'tool_calls'),
  ]) })
  await first.start()
  try {
    const values = await events(first, request({ tools: [tool] }))
    assert.doesNotMatch(JSON.stringify(values), /PRIVATE_CHAIN_OF_THOUGHT|reasoning_content/)
  } finally { await first.close() }
  let body
  const second = new ClaudeMessagesBridge({ model, apiKey: 'key', reasoningFile, onRequest: value => { body = value }, fetchImpl: async () => upstream([completion({ content: '完成' }, 'stop')]) })
  await second.start()
  try {
    await events(second, request({ tools: [tool], messages: [
      { role: 'user', content: 'inspect' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'persistent-call', name: 'Read', input: { file_path: 'a' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'persistent-call', content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }] }] },
    ] }))
    assert.equal(body.messages[1].reasoning_content, 'PRIVATE_CHAIN_OF_THOUGHT')
    assert.equal(body.messages[2].content, 'first\n\nsecond')
    assert.equal(body.messages[2].tool_call_id, 'persistent-call')
  } finally { await second.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})

test('messages preserve adjacent assistant blocks, explicit thinking and tool result ordering', () => {
  const messages = translateMessages({ system: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second', cache_control: { type: 'ephemeral' } }], messages: [
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'private', signature: 'vendor-signature' }, { type: 'text', text: 'start' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'next' }, { type: 'tool_use', id: 'id', name: 'Read', input: { file_path: 'a' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'id', is_error: true, content: 'failed' }, { type: 'text', text: 'retry' }] },
  ] })
  assert.equal(messages[0].content, 'first\n\nsecond')
  assert.equal(messages[1].content, 'start\n\nnext')
  assert.equal(messages[1].reasoning_content, 'private')
  assert.equal(messages[1].tool_calls[0].id, 'id')
  assert.deepEqual(messages.slice(2).map(message => message.role), ['tool', 'user'])
  assert.equal(messages[2].content, 'Tool execution error:\n\nfailed')
})

test('text documents and real image bytes survive conversion including tool images', async () => {
  let body
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'cGl4ZWw=' } }
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', expectedImages: 1, onRequest: value => { body = value }, fetchImpl: async () => upstream([completion({ content: 'OK' }, 'stop')]) })
  await bridge.start()
  try {
    await events(bridge, request({ messages: [{ role: 'user', content: [
      { type: 'text', text: 'inspect' }, image,
      { type: 'document', title: 'notes', source: { type: 'text', media_type: 'text/plain', data: 'document text' } },
    ] }] }))
    assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,cGl4ZWw=')
    assert.ok(body.messages[0].content.some(part => part.text === 'document text'))
    const translated = translateMessages({ messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'id', content: [image, { type: 'text', text: 'image explanation' }] }] }] })
    assert.equal(translated[0].content[0].image_url.url, 'data:image/png;base64,cGl4ZWw=')
  } finally { await bridge.close() }
})

test('unknown content, hosted tools and incompatible binary documents fail explicitly', () => {
  for (const block of [{ type: 'unknown', data: 'cannot omit' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'binary' } }, { type: 'image', source: { type: 'file', file_id: 'id' } }]) assert.throws(() => translateMessages({ messages: [{ role: 'user', content: [block] }] }), /不支持|不受支持/)
  assert.throws(() => translateTools([{ type: 'web_search_20250305', name: 'web_search' }]), /不支持 Claude 工具/)
  assert.throws(() => translateTools([tool, tool]), /名称重复/)
})

test('unparsed expected images fail before any upstream request', async () => {
  let calls = 0
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', expectedImages: 1, fetchImpl: async () => { calls++; return upstream([completion({ content: 'OK' }, 'stop')]) } })
  await bridge.start()
  try {
    const response = await send(bridge, request())
    assert.equal(response.status, 502); assert.match((await response.json()).error.message, /无法解析部分图片/)
    assert.equal(calls, 0)
  } finally { await bridge.close() }
})

test('text-only clarifications remove advertised tools and reject provider tool execution', async () => {
  let body
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', textOnly: true, onRequest: value => { body = value }, fetchImpl: async () => upstream([completion({ tool_calls: [{ index: 0, id: 'id', function: { name: 'Read', arguments: '{}' } }] }, 'tool_calls')]) })
  await bridge.start()
  try {
    const values = await events(bridge, request({ tools: [tool], tool_choice: { type: 'auto' } }))
    assert.equal(body.tools, undefined); assert.equal(body.tool_choice, undefined)
    assert.equal(values.at(-1).type, 'error'); assert.match(values.at(-1).error.message, /不允许/)
    assert.equal(values.some(value => value.content_block?.type === 'tool_use' || value.type === 'message_stop'), false)
    await assert.rejects(bridge.runSearch({ query: 'search' }), /不允许/)
    const replay = await send(bridge, request({ messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'id', name: 'Read', input: {} }] }] }))
    assert.equal(replay.status, 502)
  } finally { await bridge.close() }
})

test('incomplete streams, unknown tools and invalid arguments never end successfully', async () => {
  const fixtures = [
    [completion({ content: 'partial' })],
    [completion({ tool_calls: [{ index: 0, id: 'id', function: { name: 'unknown', arguments: '{}' } }] }, 'tool_calls')],
    [completion({ tool_calls: [{ index: 0, id: 'id', function: { name: 'Read', arguments: '{broken' } }] }, 'tool_calls')],
    [completion({ tool_calls: [{ index: 0, id: 'id', function: { name: 'Read', arguments: '{}' } }] }, 'length')],
    [completion({ content: 'blocked' }, 'content_filter')],
    [completion({}, 'tool_calls')],
  ]
  for (const chunks of fixtures) {
    const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => upstream(chunks) })
    await bridge.start()
    try {
      const values = await events(bridge, request({ tools: [tool] }))
      assert.equal(values.at(-1).type, 'error')
      assert.equal(values.some(value => value.type === 'message_stop' || value.content_block?.type === 'tool_use'), false)
    } finally { await bridge.close() }
  }
})

test('plain text output limits map to Anthropic max_tokens', async () => {
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => upstream([completion({ content: 'partial answer' }, 'length')]) })
  await bridge.start()
  try {
    const values = await events(bridge, request())
    assert.equal(values.at(-2).delta.stop_reason, 'max_tokens'); assert.equal(values.at(-1).type, 'message_stop')
  } finally { await bridge.close() }
})

test('invalid tool JSON gets one corrective generation; no partial or sibling tool is exposed', async () => {
  for (const stream of [true, false]) {
    const bodies = [], diagnostics = []
    const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', onDiagnostic: value => diagnostics.push(value), fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      if (bodies.length === 1) return upstream([
        completion({ content: '检查文件。' }),
        completion({ tool_calls: [
          { index: 0, id: 'valid-but-not-executed', function: { name: 'Read', arguments: '{"file_path":"a"}' } },
          { index: 1, id: 'invalid', function: { name: 'Read', arguments: '{"file_path":"sensitive-incomplete' } },
        ] }, 'length'),
        { usage: { completion_tokens: 4000 } },
      ])
      return upstream([completion({ tool_calls: [{ id: 'corrected', function: { name: 'Read', arguments: '{"file_path":"b"}' } }] }, 'tool_calls')])
    } })
    await bridge.start()
    try {
      const response = await send(bridge, request({ stream, tools: [tool] }))
      assert.equal(response.status, 200)
      const value = await response.text()
      assert.match(value, /corrected/)
      assert.doesNotMatch(value, /valid-but-not-executed|sensitive-incomplete|"type":"error"/)
      assert.equal(bodies.length, 2)
      assert.match(bodies[1].messages.at(-1).content, /未执行|分成小段/)
      assert.equal(diagnostics[0].finishReason, 'length')
      assert.equal(diagnostics[0].completionTokens, 4000)
      assert.equal(diagnostics[0].outputBudget, 4000)
      assert(diagnostics[0].calls[1].argumentBytes > 0)
      assert.doesNotMatch(JSON.stringify(diagnostics), /sensitive-incomplete/)
      if (stream) assert.equal((value.match(/event: message_start/g) || []).length, 1)
    } finally { await bridge.close() }
  }
})

test('second invalid tool response stops with a diagnostic instead of unlimited transport retries', async () => {
  let requests = 0, fatal
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', onFatalError: value => { fatal = value }, fetchImpl: async () => {
    requests++
    return upstream([completion({ tool_calls: [{ id: 'invalid', function: { name: 'Read', arguments: '{bad' } }] }, 'tool_calls')])
  } })
  await bridge.start()
  try {
    const values = await events(bridge, request({ tools: [tool] }))
    assert.equal(requests, 2)
    assert.equal(values.at(-1).error.type, 'invalid_request_error')
    assert.match(fatal, /finish_reason=tool_calls.*arguments_bytes=4/)
    assert(!values.some(value => value.content_block?.type === 'tool_use'))
  } finally { await bridge.close() }
})

test('cancellation aborts corrective generation before any tool can be released', async () => {
  let requests = 0, correctionSignal, ready
  const correcting = new Promise(resolve => { ready = resolve })
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async (_url, init) => {
    requests++
    if (requests === 1) return upstream([completion({ tool_calls: [{ id: 'invalid', function: { name: 'Read', arguments: '{bad' } }] }, 'tool_calls')])
    correctionSignal = init.signal
    ready()
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  } })
  await bridge.start()
  try {
    const response = await send(bridge, request({ tools: [tool] }))
    const settled = response.text().catch(() => '')
    await correcting
    await bridge.close()
    assert.equal(correctionSignal.aborted, true)
    assert.equal(requests, 2)
    assert.doesNotMatch(await settled, /"type":"tool_use"/)
  } finally { await bridge.close() }
})

test('a Stable waiting card ends the SDK turn without releasing accompanying tools', async () => {
  const card = '  \n' + WAIT_MARKER + '\n' + JSON.stringify({ question: 'Which file?', hint: 'Choose a source.', options: [{ label: 'Source A', description: 'Use A.' }, { label: 'Source B', description: 'Use B.' }] })
  for (const stream of [true, false]) {
    const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => upstream([
      completion({ content: card.slice(0, 15) }),
      completion({ content: card.slice(15), tool_calls: [{ index: 0, id: 'must-not-run', function: { name: 'Read', arguments: '{"file_path":"unconfirmed"}' } }] }, 'tool_calls'),
    ]) })
    await bridge.start()
    try {
      if (stream) {
        const values = await events(bridge, request({ tools: [tool], stream }))
        assert.equal(values.some(value => value.content_block?.type === 'tool_use' || value.delta?.type === 'input_json_delta'), false)
        assert.equal(values.at(-2).delta.stop_reason, 'end_turn'); assert.equal(values.at(-1).type, 'message_stop')
        assert.equal(values.filter(value => value.delta?.type === 'text_delta').map(value => value.delta.text).join(''), card)
      } else {
        const response = await send(bridge, request({ tools: [tool], stream }))
        const value = await response.json()
        assert.equal(value.stop_reason, 'end_turn'); assert.deepEqual(value.content, [{ type: 'text', text: card }])
      }
    } finally { await bridge.close() }
  }
})

test('non-stream messages accept JSON upstream and keep native tool input objects', async () => {
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'reading', tool_calls: [{ id: 'id', type: 'function', function: { name: 'Read', arguments: '{"file_path":"file"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { headers: { 'content-type': 'application/json' } }) })
  await bridge.start()
  try {
    const response = await send(bridge, request({ stream: false, tools: [tool] }))
    const value = await response.json()
    assert.equal(value.type, 'message'); assert.equal(value.stop_reason, 'tool_use')
    assert.equal(value.content[0].text, 'reading'); assert.deepEqual(value.content[1].input, { file_path: 'file' })
    assert.equal(value.usage.input_tokens, 10); assert.equal(value.usage.output_tokens, 5)
  } finally { await bridge.close() }
})

test('capabilities are per bridge and Origin or foreign Host cannot access upstream', async () => {
  let calls = 0
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => { calls++; return upstream([completion({ content: 'OK' }, 'stop')]) } })
  await bridge.start()
  try {
    assert.notEqual(bridge.token, new ClaudeMessagesBridge({ model, apiKey: 'key' }).token)
    for (const headers of [{ 'x-api-key': 'wrong' }, { origin: 'https://foreign.example' }]) assert.equal((await send(bridge, request(), { headers })).status, 401)
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = http.request(`${bridge.baseURL}/v1/messages`, { method: 'POST', headers: { host: 'foreign.example', 'x-api-key': bridge.token } }, response => { response.resume(); resolve(response.statusCode) })
      req.on('error', reject); req.end(JSON.stringify(request()))
    })
    assert.equal(foreignHostStatus, 401)
    assert.equal(calls, 0)
    assert.equal((await send(bridge, request(), { route: '/unknown' })).status, 404)
    const response = await send(bridge, request({ stream: false }), { headers: { 'x-api-key': '', authorization: `Bearer ${bridge.token}` }, route: '/v1/messages?beta=true' })
    assert.equal(response.status, 200)
  } finally { await bridge.close() }
})

test('local count_tokens is conservative, excludes binary image bytes and uses no provider', async () => {
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: async () => { throw new Error('must not call provider') } })
  await bridge.start()
  try {
    const input = request({ tools: [tool] })
    const response = await send(bridge, input, { route: '/v1/messages/count_tokens' })
    assert.equal(response.status, 200); assert.equal((await response.json()).input_tokens, estimatedTokens(input))
    assert.ok(estimatedTokens(input) > input.messages[0].content.length)
    const imageInput = request({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'a'.repeat(1_000_000) } }] }] })
    assert.ok(estimatedTokens(imageInput) < 10_000)
  } finally { await bridge.close() }
})

test('upstream errors redact parent key and disposable capability in JSON and SSE errors', async () => {
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'parent-secret', fetchImpl: async () => new Response(JSON.stringify({ error: { message: `invalid parent-secret ${bridge.token}` } }), { status: 401 }) })
  await bridge.start()
  try {
    const response = await send(bridge, request())
    assert.equal(response.status, 401)
    const error = await response.text(); assert.doesNotMatch(error, /parent-secret/); assert.ok(!error.includes(bridge.token)); assert.match(error, /redacted/)
  } finally { await bridge.close() }
  const streamBridge = new ClaudeMessagesBridge({ model, apiKey: 'parent-secret', fetchImpl: async () => upstream([{ error: { message: 'invalid parent-secret' } }]) })
  await streamBridge.start()
  try { const values = await events(streamBridge, request()); assert.doesNotMatch(JSON.stringify(values), /parent-secret/); assert.equal(values.at(-1).type, 'error') }
  finally { await streamBridge.close() }
})

test('closing the bridge aborts the upstream and releases outstanding HTTP calls', async () => {
  let signal; let started
  const ready = new Promise(resolve => { started = resolve })
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal; started(); signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
  }) })
  await bridge.start()
  const pending = send(bridge, request()).catch(() => null)
  await ready; await bridge.close(); await pending
  assert.equal(signal.aborted, true)
})

test('credential prefixes cannot leak across the provider error truncation boundary', async () => {
  const secret = 'BOUNDARY_PROVIDER_CREDENTIAL_NEVER_DISPLAY'
  let bridge
  bridge = new ClaudeMessagesBridge({ model, apiKey: secret, fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'x'.repeat(990) + secret + bridge.token } }), { status: 401 }) })
  await bridge.start()
  try {
    const response = await send(bridge, request())
    assert.equal(response.status, 401)
    const text = await response.text()
    assert.doesNotMatch(text, /BOUNDARY/)
    assert.ok(!text.includes(bridge.token.slice(0, 8)))
    assert.match(text, /\[redacted\]/)
  } finally { await bridge.close() }
})

test('custom search retains provider behavior without starting a Responses service', async () => {
  const signal = new AbortController().signal
  const bridge = new ClaudeMessagesBridge({ model, apiKey: 'key', search: async (input, forwardedSignal) => { assert.equal(forwardedSignal, signal); return { sources: [{ title: input.query, url: 'https://source.example' }] } } })
  const result = await bridge.runSearch({ query: 'hello' }, signal)
  assert.equal(result.sources[0].title, 'hello'); assert.equal(bridge.server, undefined)
})
