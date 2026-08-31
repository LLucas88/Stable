'use strict'

const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { Readable } = require('node:stream')

const MAX_BODY_BYTES = 16 * 1024 * 1024
const RESPONSE_HEADERS = new Set(['content-type', 'cache-control', 'x-request-id'])

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
    if (server) await new Promise((resolve) => server.close(resolve))
  }

  modelRoute(modelId) {
    const item = this.account.publicState().models.find((model) => model.id === modelId)
    if (!item) throw new Error('所选云端模型已不可用，请重新选择。')
    if (!this.baseURL) throw new Error('Stable Cloud 本机网关尚未就绪。')
    return {
      model: { id: item.id, providerId: 'stable-cloud', displayName: item.display_name || item.id, baseURL: this.baseURL, model: item.id },
      apiKey: this.secret,
    }
  }

  async handle(request, response) {
    try {
      if (request.headers.authorization !== `Bearer ${this.secret}`) throw Object.assign(new Error('本机网关凭据无效。'), { status: 401 })
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname
      if (!['/v1/chat/completions', '/v1/models'].includes(pathname)) throw Object.assign(new Error('本机网关路径无效。'), { status: 404 })
      if (pathname === '/v1/chat/completions' && request.method !== 'POST') throw Object.assign(new Error('请求方法不受支持。'), { status: 405 })
      if (pathname === '/v1/models' && request.method !== 'GET') throw Object.assign(new Error('请求方法不受支持。'), { status: 405 })
      const token = this.account.token()
      if (!token) throw Object.assign(new Error('请先登录 Stable Cloud。'), { status: 401 })
      const body = request.method === 'POST' ? await readBody(request) : undefined
      const headers = { accept: request.headers.accept || 'application/json', authorization: `Bearer ${token}` }
      if (body) {
        headers['content-type'] = request.headers['content-type'] || 'application/json'
        headers['idempotency-key'] = `stable-${randomUUID()}`
      }
      const upstream = await this.fetch(`${this.account.baseURL}${pathname}`, { method: request.method, headers, body, redirect: 'error' })
      response.statusCode = upstream.status
      for (const [name, value] of upstream.headers) if (RESPONSE_HEADERS.has(name.toLowerCase())) response.setHeader(name, value)
      if (!upstream.body) { response.end(); return }
      Readable.fromWeb(upstream.body).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      response.statusCode = Number(error.status || 502)
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: { message: error.message, type: 'stable_cloud_proxy_error', code: error.code || 'proxy_error' } }))
    }
  }
}

module.exports = { CloudGatewayProxy, MAX_BODY_BYTES }
