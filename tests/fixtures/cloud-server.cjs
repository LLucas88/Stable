'use strict'

const http = require('node:http')

const port = Number(process.argv[2] || 18765)
const account = { id: 'acc_qa', username: 'qa-member', displayName: '验收成员', role: 'member', status: 'active', mustChangePassword: false }
const quota = { id: 'quota_qa', currency: 'CNY', limitMicros: 100_000_000, spentMicros: 27_650_000, reservedMicros: 350_000, remainingMicros: 72_000_000, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  const send = (status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(body === undefined ? '' : JSON.stringify(body)) }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') return send(200, { account, quota, device_token: 'qa-device-token', token_type: 'Bearer', expires_at: '2026-10-01T00:00:00.000Z' })
  if (request.headers.authorization !== 'Bearer qa-device-token') return send(401, { error: { message: '请登录。', code: 'invalid_session' } })
  if (url.pathname === '/api/account') return send(200, { account, quota })
  if (url.pathname === '/v1/models') return send(200, { object: 'list', data: [
    { id: 'stable-reasoning', object: 'model', display_name: 'Stable Reasoning', provider: 'deepseek', context_window: 128000, max_output_tokens: 8192 },
    { id: 'stable-fast', object: 'model', display_name: 'Stable Fast', provider: 'deepseek', context_window: 64000, max_output_tokens: 4096 },
  ] })
  if (url.pathname === '/api/usage/summary') return send(200, { accountId: account.id, from: '2026-08-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', totals: { request_count: 42, settled_count: 41, exception_count: 1, prompt_tokens: 186240, completion_tokens: 32780, usage_unknown_count: 0, actual_micros: 27_650_000 }, byModel: [] })
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') { response.writeHead(204); return response.end() }
  return send(404, { error: { message: 'not found', code: 'not_found' } })
})

server.listen(port, '127.0.0.1', () => process.stdout.write(`READY ${port}\n`))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
