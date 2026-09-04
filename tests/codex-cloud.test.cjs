'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { CodexResponsesBridge, translateInput, readSSE } = require('../desktop/services/codex-responses-bridge.cjs')
const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')

test('text blocks become ordered strings across roles, retaining reasoning and tool calls', () => {
  const history = [
    { role: 'developer', content: [{ type: 'input_text', text: '规则一\n保持换行' }, { type: 'text', text: '规则二' }] },
    { role: 'user', content: [{ type: 'input_text', text: '继续旧任务' }] },
    { type: 'reasoning', encrypted_content: 'reference' },
    { role: 'assistant', content: [{ type: 'output_text', text: '先读取文件' }] },
    { type: 'function_call', call_id: 'call-1', name: 'read_file', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-1', output: '文件内容' },
    { role: 'user', content: [] },
  ]
  const original = structuredClone(history)
  const messages = translateInput(history, 'system', new Map([['reference', 'PRIVATE_REASONING']]))
  assert.ok(messages.every((message) => typeof message.content === 'string'))
  assert.equal(messages[1].role, 'system')
  assert.equal(messages[1].content, '规则一\n保持换行\n\n规则二')
  assert.equal(messages[3].content, '先读取文件')
  assert.equal(messages[3].reasoning_content, 'PRIVATE_REASONING')
  assert.equal(messages[3].tool_calls[0].id, 'call-1')
  assert.equal(messages[4].tool_call_id, 'call-1')
  assert.equal(messages[5].content, '')
  assert.deepEqual(history, original)
  assert.throws(() => translateInput([{ role: 'user', content: [{ type: 'input_text', text: { unexpected: true } }] }]), /无效的文本/)
})

test('Responses crosses the authenticated cloud proxy with the strict string-only contract', async () => {
  const captured = []
  const proxy = new CloudGatewayProxy({
    account: { baseURL: 'https://cloud.invalid', token: () => 'device-token', publicState: () => ({ models: [{ id: 'cloud-model' }] }) },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body); captured.push(body)
      assert.equal(url, 'https://cloud.invalid/v1/chat/completions')
      assert.equal(options.headers.authorization, 'Bearer device-token')
      assert.match(options.headers['idempotency-key'], /^stable-/)
      // Contract from stable-cloud/lib/core/gateway.ts assertTextOnlyMessages.
      if (body.messages.some((message) => typeof message.content !== 'string' && !(message.role === 'assistant' && message.content == null && message.tool_calls?.length))) {
        return Response.json({ error: { message: '第一版网关只允许纯文本消息；图片、音频和多模态内容暂不开放。' } }, { status: 400 })
      }
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'CLOUD_OK' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    },
  })
  await proxy.start()
  const route = proxy.modelRoute('cloud-model')
  const bridge = new CodexResponsesBridge(route)
  await bridge.start()
  const request = (input) => fetch(`${bridge.baseURL}/responses`, { method: 'POST', headers: { authorization: `Bearer ${bridge.token}` }, body: JSON.stringify({ input }) })
  try {
    // Reproduce the pre-fix failure at the actual proxy boundary.
    const before = await fetch(`${proxy.baseURL}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${route.apiKey}` }, body: JSON.stringify({ model: 'cloud-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'plain text' }] }] }) })
    assert.equal(before.status, 400); await before.text()
    const response = await request([
      { role: 'developer', content: [{ type: 'input_text', text: '总结会话' }] },
      { role: 'user', content: [{ type: 'input_text', text: '继续测试' }] },
      { type: 'function_call', name: 'read_file', call_id: 'call-1', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: 'A店=170' },
    ])
    assert.equal(response.status, 200)
    const events = []; for await (const event of readSSE(response.body)) events.push(event)
    assert.equal(events.at(-1).type, 'response.completed')
    assert.equal(captured[1].messages[0].content, '总结会话')
    assert.equal(captured[1].messages[2].content, null)
    assert.equal(captured[1].messages[2].tool_calls[0].id, 'call-1')
    const image = 'data:image/png;base64,cGl4ZWw='
    const rejected = await request([{ role: 'user', content: [{ type: 'input_text', text: '看图' }, { type: 'input_image', image_url: image }] }])
    assert.equal(rejected.status, 400)
    assert.match((await rejected.json()).error.message, /只允许纯文本/)
    assert.equal(captured[2].messages[0].content[1].image_url.url, image)
  } finally { await bridge.close(); await proxy.stop() }
})
