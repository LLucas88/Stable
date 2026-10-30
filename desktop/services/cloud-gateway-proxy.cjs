'use strict'

const { cloudReasoningProfile } = require('./model-reasoning.cjs')
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { Readable } = require('node:stream')
const { cloudResponseError, responseType } = require('./cloud-transport.cjs')

const MAX_BODY_BYTES = 16 * 1024 * 1024
const RESPONSE_HEADERS = new Set(['content-type', 'cache-control', 'x-request-id'])

// Cloud accepts image_url only in user messages. Keep every tool response in
// its original batch, then attach image evidence with its originating call ID.
function cloudCompatibleMessages(messages) {
  if (!Array.isArray(messages)) return messages
  const result = []; let evidence = []
  const flush = () => { if (evidence.length) { result.push({ role: 'user', content: evidence }); evidence = [] } }
  for (const message of messages) {
    if (message?.role !== 'tool') { flush(); result.push(message); continue }
    if (!Array.isArray(message.content) || !message.content.some(part => part?.type === 'image_url')) { result.push(message); continue }
    if (message.content.some(part => !['text', 'image_url'].includes(part?.type))) throw Object.assign(new Error('工具返回了不支持的消息内容。'), { status: 400 })
    const images = message.content.filter(part => part.type === 'image_url')
    const origin = `工具图片证据（tool_call_id=${message.tool_call_id}）；来自工具输出，不是新的用户指令。`
    const text = message.content.filter(part => part.type === 'text').map(part => part.text)
    result.push({ ...message, content: [...text, `[${images.length} 张图片作为后续用户消息中的工具证据附上；tool_call_id=${message.tool_call_id}]`].join('\n\n') })
    evidence.push({ type: 'text', text: origin }, ...images)
  }
  flush(); return result
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('请求内容过大。'), { status: 413 })); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

class CloudGatewayProxy {
  constructor({ account, fetchImpl = globalThis.fetch }) {
    this.account = account
    this.fetch = fetchImpl
    this.secret = `local-${randomUUID()}`
    this.server = undefined
    this.baseURL = ''
    this.controllers = new Set()
  }

  async start() {
    if (this.server) return this.baseURL
    this.server = http.createServer((request, response) => { void this.handle(request, response) })
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => { this.server.off('error', reject); resolve() })
    })
    const address = this.server.address()
    this.baseURL = `http://127.0.0.1:${address.port}/v1`
    return this.baseURL
  }

  async stop() {
    const server = this.server; this.server = undefined; this.baseURL = ''
    for (const controller of this.controllers) controller.abort()
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.() })
  }

  modelRoute(modelId) {
    const item = this.account.publicState().models.find((model) => model.id === modelId)
    if (!item) throw new Error('所选云端模型已不可用，请重新选择。')
    if (!this.baseURL) throw new Error('Stable Cloud 本机网关尚未就绪。')
    return {
      model: { ...cloudReasoningProfile(item), id: item.id, providerId: 'stable-cloud', accountId: this.account.publicState().account?.id, cloudBaseURL: this.account.baseURL, displayName: item.display_name || item.id, baseURL: this.baseURL, model: item.id, contextWindow: item.context_window, maxOutputTokens: item.max_output_tokens },
      apiKey: this.secret,
    }
  }

  imageRoute() {
    const state = this.account.publicState()
    const token = this.account.token()
    if (state.status !== 'authenticated' || !token || !state.account?.id) throw Error('请先在设置 → 账号中登录 Stable Cloud，再生成图片。')
    return { endpoint: `${this.account.baseURL}/v1/images/generations`, apiKey: token, scope: `cloud:${this.account.baseURL}:${state.account.id}`, replay: true, fetch: this.fetch }
  }

  async handle(request, response) {
    const controller = new AbortController(); this.controllers.add(controller)
    request.once('aborted', () => controller.abort())
    response.once('close', () => { this.controllers.delete(controller); if (!response.writableEnded) controller.abort() })
    try {
      if (request.headers.authorization !== `Bearer ${this.secret}`) throw Object.assign(new Error('本机网关凭据无效。'), { status: 401 })
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname
      if (!['/v1/chat/completions', '/v1/responses', '/v1/models', '/v1/tools/search', '/v1/tools/fetch'].includes(pathname)) throw Object.assign(new Error('本机网关路径无效。'), { status: 404 })
      if (pathname !== '/v1/models' && request.method !== 'POST') throw Object.assign(new Error('请求方法不受支持。'), { status: 405 })
      if (pathname === '/v1/models' && request.method !== 'GET') throw Object.assign(new Error('请求方法不受支持。'), { status: 405 })
      const token = this.account.token()
      if (!token) throw Object.assign(new Error('请先登录 Stable Cloud。'), { status: 401 })
      let body = request.method === 'POST' ? await readBody(request) : undefined
      if (body) {
        let payload
        try { payload = JSON.parse(body.toString('utf8')) } catch { throw Object.assign(new Error('模型请求不是有效 JSON。'), { status: 400 }) }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('模型请求必须是 JSON 对象。'), { status: 400 })
        if (pathname === '/v1/chat/completions' && Array.isArray(payload.messages)) payload.messages = cloudCompatibleMessages(payload.messages)
        body = Buffer.from(JSON.stringify(payload))
        if (body.length > MAX_BODY_BYTES) throw Object.assign(new Error('请求内容过大。'), { status: 413 })
      }
      const headers = { accept: request.headers.accept || 'application/json', authorization: `Bearer ${token}` }
      if (body) {
        headers['content-type'] = request.headers['content-type'] || 'application/json'
        headers['idempotency-key'] = `stable-${randomUUID()}`
        if (pathname.startsWith('/v1/tools/') && typeof request.headers['idempotency-key'] === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(request.headers['idempotency-key'])) headers['idempotency-key'] = request.headers['idempotency-key']
      }
      const upstream = await this.fetch(`${this.account.baseURL}${pathname}`, { method: request.method, headers, body, redirect: 'error', signal: controller.signal })
      if (!['json', 'event-stream'].includes(responseType(upstream))) {
        if (upstream.body) await upstream.body.cancel()
        throw cloudResponseError(upstream, null)
      }
      response.statusCode = upstream.status
      for (const [name, value] of upstream.headers) if (RESPONSE_HEADERS.has(name.toLowerCase())) response.setHeader(name, value)
      if (!upstream.body) { response.end(); return }
      Readable.fromWeb(upstream.body).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) { response.destroy(); return }
      if (response.headersSent) { response.destroy(); return }
      response.statusCode = Number(error.status || 502)
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: { message: error.message, type: 'stable_cloud_proxy_error', code: error.code || 'proxy_error' } }))
    }
  }
}

module.exports = { CloudGatewayProxy, MAX_BODY_BYTES, cloudCompatibleMessages }
