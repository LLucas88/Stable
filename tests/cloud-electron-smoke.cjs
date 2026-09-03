'use strict'

// Background-only Chromium integration: a local mock proxy, no BrowserWindow,
// no production credentials, and an isolated user-data directory.
const { app, session } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { createCloudFetch, cloudResponseError } = require(process.env.STABLE_TEST_TRANSPORT_MODULE || '../desktop/services/cloud-transport.cjs')

const qaDirectory = path.join(__dirname, '..', 'qa-artifacts', `cloud-electron-${randomUUID()}`)
fs.mkdirSync(qaDirectory, { recursive: true })
app.setPath('userData', qaDirectory)
app.disableHardwareAcceleration()
const watch = setTimeout(() => { process.stderr.write('CLOUD_ELECTRON_SMOKE_TIMEOUT\n'); app.exit(1) }, 25000)

app.whenReady().then(async () => {
  const requests = []
  const proxy = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({ url: request.url, cookie: request.headers.cookie, auth: request.headers.authorization, body: Buffer.concat(chunks).toString() })
      const pathname = new URL(request.url).pathname
      if (pathname === '/api/auth/login') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ device_token: 'fake-result-token' }))
      } else if (pathname === '/api/auth/change-password') {
        response.writeHead(302, { location: 'http://must-not-follow.invalid/secret' }); response.end()
      } else if (pathname === '/v1/models') {
        response.writeHead(403, { 'content-type': 'text/html', 'cf-ray': 'a1234567890abcde-NRT' })
        response.end('<html>fake-sensitive-block-page</html>')
      } else if (pathname === '/v1/chat/completions') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write('data: first\n\n')
        setTimeout(() => response.end('data: [DONE]\n\n'), 150)
      } else if (pathname === '/api/account') {
        // Kept pending to prove AbortSignal reaches Chromium.
      } else { response.writeHead(500); response.end() }
    })
  })
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  try {
    const cloudSession = session.fromPartition(`cloud-test-${randomUUID()}`, { cache: false })
    await cloudSession.setProxy({ mode: 'fixed_servers', proxyRules: `127.0.0.1:${proxy.address().port}`, proxyBypassRules: '<-loopback>' })
    const base = 'http://stable-proxy-probe.invalid'
    await cloudSession.cookies.set({ url: base, name: 'private-cookie', value: 'fake-cookie-secret' })
    const logPath = path.join(qaDirectory, 'cloud-network.jsonl')
    const cloudFetch = createCloudFetch({ session: cloudSession, logPath, appVersion: '0.9.40-proxy.1' })
    const login = await cloudFetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer fake-auth-token' }, body: JSON.stringify({ password: 'fake-password' }) })
    assert.equal((await login.json()).device_token, 'fake-result-token')
    assert.equal(requests[0].cookie, undefined)
    assert.equal(requests[0].auth, 'Bearer fake-auth-token')
    assert.ok(requests[0].body.includes('fake-password'))
    const blocked = await cloudFetch(`${base}/v1/models`)
    assert.match(cloudResponseError(blocked, null).message, /诊断编号/)
    assert.equal(blocked.status, 403)
    const stream = await cloudFetch(`${base}/v1/chat/completions`, { method: 'POST', body: '{}' })
    assert.equal(stream.bodyUsed, false)
    const reader = stream.body.getReader()
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n')
    let rest = ''
    for (;;) { const item = await reader.read(); if (item.done) break; rest += new TextDecoder().decode(item.value) }
    assert.match(rest, /DONE/)
    await assert.rejects(cloudFetch(`${base}/api/auth/change-password`, { method: 'POST', body: 'fake-password' }))
    assert.ok(!requests.some((request) => request.url.includes('must-not-follow')))
    await assert.rejects(cloudFetch(`${base}/api/account`, { signal: AbortSignal.timeout(100) }))
    const log = fs.readFileSync(logPath, 'utf8')
    assert.doesNotMatch(log, /fake-auth-token|fake-password|fake-result-token|fake-cookie-secret|fake-sensitive|must-not-follow|stable-proxy-probe/)
    const records = log.trim().split('\n').map(JSON.parse)
    assert.ok(records.some((record) => record.status === 403 && record.proxy === 'proxy'))
    const result = { requests: requests.length, checks: ['proxy-post', 'bearer-preserved', 'cookies-omitted', 'html-403', 'streaming', 'redirect-blocked', 'abort', 'log-redaction'], evidence: logPath }
    fs.writeFileSync(path.join(qaDirectory, 'result.json'), JSON.stringify(result, null, 2))
    process.stdout.write(`CLOUD_ELECTRON_SMOKE_OK ${JSON.stringify(result)}\n`)
  } finally {
    proxy.closeAllConnections()
    await new Promise((resolve) => proxy.close(resolve))
    clearTimeout(watch)
  }
  app.exit(0)
}).catch((error) => { clearTimeout(watch); process.stderr.write(`${error.stack}\n`); app.exit(1) })
