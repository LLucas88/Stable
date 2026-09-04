'use strict'

// A small application-owned MCP server. No upstream provider key is exposed.
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
const controllers = new Map()
const send = (value) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`)
rl.on('line', (line) => void (async () => {
  let message
  try {
    message = JSON.parse(line)
    if (message.method === 'notifications/cancelled') { controllers.get(message.params?.requestId)?.abort(); return }
    if (message.id === undefined) return
    let result
    if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'stable-search', version: '1.0.0' } }
    else if (message.method === 'ping') result = {}
    else if (message.method === 'tools/list') result = { tools: [{ name: 'web_search', description: '使用当前模型服务的官方联网搜索。返回可引用的来源链接和摘要。', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }, inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['query'] } }] }
    else if (message.method === 'tools/call' && message.params?.name === 'web_search') {
      const controller = new AbortController(); controllers.set(message.id, controller)
      const response = await fetch(`${process.env.STABLE_CODEX_GATEWAY}/search`, { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${process.env.STABLE_CODEX_GATEWAY_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(message.params.arguments || {}) })
      const body = await response.json()
      result = { content: [{ type: 'text', text: JSON.stringify(body) }], isError: !response.ok }
    } else { send({ id: message.id, error: { code: -32601, message: 'Unsupported MCP method' } }); return }
    send({ id: message.id, result })
  } catch (error) { if (message?.id !== undefined) send({ id: message.id, result: { content: [{ type: 'text', text: error.message }], isError: true } }) }
  finally { if (message) controllers.delete(message.id) }
})())
rl.on('close', () => { for (const controller of controllers.values()) controller.abort() })
