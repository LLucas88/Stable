'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')

function listen(server) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())) })
}

test('local gateway keeps the cloud token in the main process and injects a unique idempotency key per request', async (t) => {
  const received = []
  const upstream = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push({ authorization: request.headers.authorization, idempotencyKey: request.headers['idempotency-key'], body: Buffer.concat(chunks).toString('utf8') })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ id: `reply-${received.length}`, choices: [] }))
    })
  })
  const address = await listen(upstream)
  t.after(() => new Promise((resolve) => upstream.close(resolve)))
  const state = { status: 'authenticated', models: [{ id: 'model-a', display_name: 'Model A' }] }
  const account = { baseURL: `http://127.0.0.1:${address.port}`, token: () => 'real-cloud-token', publicState: () => state }
  const proxy = new CloudGatewayProxy({ account })
  await proxy.start(); t.after(() => proxy.stop())
  const route = proxy.modelRoute('model-a')
  assert.notEqual(route.apiKey, 'real-cloud-token')
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${route.model.baseURL}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${route.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'model-a', messages: [{ role: 'user', content: String(index) }] }) })
    assert.equal(response.status, 200)
  }
  assert.equal(received.length, 2)
  assert.equal(received[0].authorization, 'Bearer real-cloud-token')
  assert.match(received[0].idempotencyKey, /^stable-/)
  assert.notEqual(received[0].idempotencyKey, received[1].idempotencyKey)
})

test('local gateway rejects callers without its per-process credential', async (t) => {
  const account = { baseURL: 'https://stable.example.com', token: () => 'cloud', publicState: () => ({ status: 'authenticated', models: [] }) }
  const proxy = new CloudGatewayProxy({ account, fetchImpl: async () => { throw new Error('must not forward') } })
  await proxy.start(); t.after(() => proxy.stop())
  const response = await fetch(`${proxy.baseURL}/models`)
  assert.equal(response.status, 401)
})
