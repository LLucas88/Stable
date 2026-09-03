'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createCloudFetch, cloudResponseError, MAX_LOG_BYTES } = require('../desktop/services/cloud-transport.cjs')
const { CloudAccountService } = require('../desktop/services/cloud-account.cjs')

function fixture(t, fetch, resolveProxy = async () => 'DIRECT') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-cloud-network-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const logPath = path.join(directory, 'logs', 'cloud-network.jsonl')
  const session = { fetch, resolveProxy }
  return { logPath, session, cloudFetch: createCloudFetch({ session, logPath, appVersion: '0.9.40-proxy.1' }) }
}

test('Chromium session receives bearer auth, body, abort signal; cookies, caching and redirects are disabled', async (t) => {
  const signal = new AbortController().signal
  let sent
  const ctx = fixture(t, async function (url, options) { assert.equal(this, ctx.session); sent = { url, options }; return Response.json({ device_token: 'returned-secret' }) })
  const response = await ctx.cloudFetch('https://cloud.example/api/auth/login?secret=query-value', {
    method: 'POST', body: 'password-body', headers: { authorization: 'Bearer auth-secret', cookie: 'caller-cookie' }, signal,
    credentials: 'include', redirect: 'follow', cache: 'force-cache',
  })
  assert.equal(sent.options.credentials, 'omit')
  assert.equal(sent.options.redirect, 'error')
  assert.equal(sent.options.cache, 'no-store')
  assert.equal(sent.options.signal, signal)
  assert.equal(sent.options.body, 'password-body')
  assert.equal(sent.options.headers.authorization, 'Bearer auth-secret')
  assert.equal(sent.options.bypassCustomProtocolHandlers, true)
  assert.equal(response.bodyUsed, false)
  assert.equal((await response.json()).device_token, 'returned-secret')
  const logged = fs.readFileSync(ctx.logPath, 'utf8')
  assert.doesNotMatch(logged, /password-body|auth-secret|returned-secret|query-value|caller-cookie|cloud.example/)
  assert.equal(JSON.parse(logged).transport, 'chromium')
})

test('HTML 403 carries safe diagnostics without persisting error bodies or proxy credentials', async (t) => {
  const ctx = fixture(t, async () => new Response('<html>password=secret jwt=token user=member</html>', {
    status: 403, headers: { 'content-type': 'text/html', 'cf-ray': 'a1234567890abcde-NRT', 'set-cookie': 'private-cookie', 'x-request-id': 'private-id' },
  }), async () => 'PROXY user:proxy-password@proxy.internal:8080')
  const response = await ctx.cloudFetch('https://cloud.example/api/auth/login')
  const error = cloudResponseError(response, null)
  assert.equal(error.status, 403)
  assert.match(error.message, /代理或站点入口拦截/)
  assert.match(error.message, /诊断编号/)
  const logged = fs.readFileSync(ctx.logPath, 'utf8')
  const record = JSON.parse(logged)
  assert.equal(record.cfRay, 'a1234567890abcde-NRT')
  assert.equal(record.proxy, 'proxy')
  assert.equal(record.responseType, 'html')
  assert.ok(error.message.includes(record.id))
  assert.doesNotMatch(logged, /password|secret|jwt|token|member|private|proxy.internal/)
})

test('business errors remain actionable and success HTML is rejected', async (t) => {
  const ctx = fixture(t, async () => Response.json({ error: { code: 'account_disabled', message: '账号已停用。' } }, { status: 403 }))
  const response = await ctx.cloudFetch('https://cloud.example/api/auth/login')
  const error = cloudResponseError(response, await response.json())
  assert.equal(error.code, 'account_disabled')
  assert.equal(error.status, 403)
  assert.match(error.message, /^账号已停用。/)
  assert.doesNotMatch(error.message, /拦截/)
  const html = new Response('<html>Login to proxy</html>', { headers: { 'content-type': 'text/html' } })
  assert.equal(cloudResponseError(html, null).code, 'invalid_cloud_response')
  assert.match(cloudResponseError(new Response('', { status: 407 }), null).message, /代理要求认证/)
})

test('network exceptions are classified and sanitized; there is no silent direct retry', async (t) => {
  let calls = 0
  const ctx = fixture(t, async () => { calls += 1; throw new Error('net::ERR_CERT_AUTHORITY_INVALID https://user:password@private.test/?token=secret') })
  await assert.rejects(ctx.cloudFetch('https://cloud.example/api/account'), (error) => {
    assert.equal(error.code, 'ERR_CERT_AUTHORITY_INVALID')
    assert.equal(error.cloudDiagnostic, true)
    assert.match(error.message, /不要关闭证书校验/)
    assert.doesNotMatch(error.message, /private|password|secret/)
    return true
  })
  assert.equal(calls, 1)
  const logged = fs.readFileSync(ctx.logPath, 'utf8')
  assert.doesNotMatch(logged, /user|password|private|token|secret/)
  assert.equal(JSON.parse(logged).networkCode, 'ERR_CERT_AUTHORITY_INVALID')
})

test('timeout, abort and proxy failure use bounded known codes; unknown exception content is discarded', async (t) => {
  for (const [cause, code] of [[new DOMException('private', 'TimeoutError'), 'ERR_TIMED_OUT'], [new DOMException('private', 'AbortError'), 'ERR_ABORTED'], [new Error('net::ERR_PROXY_CONNECTION_FAILED'), 'ERR_PROXY_CONNECTION_FAILED'], [new Error('secret-unclassified'), 'NETWORK_ERROR']]) {
    const ctx = fixture(t, async () => { throw cause })
    await assert.rejects(ctx.cloudFetch('https://cloud.example/api/account'), (error) => {
      assert.equal(error.code, code)
      assert.doesNotMatch(error.message, /private|secret-unclassified/)
      return true
    })
  }
})

test('log files are size-bounded, unknown routes and invalid ray IDs are omitted, log failures are nonfatal', async (t) => {
  const ctx = fixture(t, async () => new Response('secret', { status: 403, headers: { 'content-type': 'text/html', 'cf-ray': 'private-bearer-token' } }))
  fs.mkdirSync(path.dirname(ctx.logPath), { recursive: true })
  fs.writeFileSync(ctx.logPath, 'x'.repeat(MAX_LOG_BYTES))
  await ctx.cloudFetch('https://cloud.example/secret-user?key=secret')
  assert.equal(fs.statSync(`${ctx.logPath}.1`).size, MAX_LOG_BYTES)
  const log = fs.readFileSync(ctx.logPath, 'utf8')
  assert.doesNotMatch(log, /secret|bearer|private/)
  assert.equal(JSON.parse(log).route, 'other')
  const noLog = createCloudFetch({ session: ctx.session, appVersion: 'test', logPath: path.dirname(ctx.logPath) })
  assert.equal((await noLog('https://cloud.example/api/account')).status, 403)
})

test('account service preserves classified errors and their diagnostic IDs', async (t) => {
  const ctx = fixture(t, async () => { throw new Error('net::ERR_PROXY_CONNECTION_FAILED') })
  const service = new CloudAccountService({ store: { getSetting: () => 'device', setSetting: () => {} }, secrets: { get: () => '' }, appVersion: 'test', fetchImpl: ctx.cloudFetch })
  await assert.rejects(service.login('private-user', 'private-password'), (error) => {
    assert.equal(error.code, 'ERR_PROXY_CONNECTION_FAILED')
    assert.match(error.message, /诊断编号/)
    return true
  })
  assert.doesNotMatch(fs.readFileSync(ctx.logPath, 'utf8'), /private-user|private-password/)
})

test('streaming responses are returned without consuming or buffering the stream', async (t) => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: first\n\n')); controller.close() } })
  const ctx = fixture(t, async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  const response = await ctx.cloudFetch('https://cloud.example/v1/chat/completions', { method: 'POST' })
  assert.equal(response.bodyUsed, false)
  assert.equal(await response.text(), 'data: first\n\n')
})

test('production wiring shares the Chromium transport across login and model requests', () => {
  const main = fs.readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
  assert.match(main, /session\.fromPartition\('stable-cloud-network', \{ cache: false \}\)/)
  assert.match(main, /new CloudAccountService\(\{[^\n]+fetchImpl: cloudFetch/)
  assert.match(main, /new CloudGatewayProxy\(\{[^\n]+fetchImpl: cloudFetch/)
  assert.throws(() => createCloudFetch({ session: {}, appVersion: 'test' }), /未就绪/)
})
