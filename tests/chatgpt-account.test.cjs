'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { ChatGPTAccount, ISSUER, API } = require('../desktop/services/chatgpt-account.cjs')
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-chatgpt-auth-')); const key = randomBytes(32)
  const protection = {
    encryptString(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]) },
    decryptString(value) { const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString() },
  }
  const jose = await import('jose'); const keys = await jose.generateKeyPair('RS256'); const jwk = await jose.exportJWK(keys.publicKey)
  let count = 0; const requests = []; const states = []
  const tokens = async (extra = {}) => ({ access_token: 'private-access-' + ++count, refresh_token: 'private-refresh-' + count, token_type: 'Bearer', expires_in: 3600, scope: 'chatgpt.tokens.use.direct',
    id_token: await new jose.SignJWT({ nonce: 'nonce', ...extra }).setProtectedHeader({ alg: 'RS256' }).setIssuer(ISSUER).setAudience('issued-client').setSubject('subject').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey) })
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init })
    const result = await options.responder?.(url, init, tokens)
    if (result) return result
    if (url.endsWith('openid-configuration')) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`, token_endpoint: `${ISSUER}/api/accounts/oauth/token`, jwks_uri: `${ISSUER}/keys`, revocation_endpoint: `${ISSUER}/revoke` })
    if (url.endsWith('/keys')) return json({ keys: [jwk] })
    if (url.endsWith('/token')) return json(await tokens())
    if (url.endsWith('/models')) return json({ models: [{ slug: 'gpt-test', visibility: 'list', display_name: 'Test' }, { slug: 'hidden', visibility: 'hidden' }] })
    throw Error('Unexpected URL')
  }
  const account = new ChatGPTAccount({ userData: root, protection, fetchImpl, onChange: state => states.push(state), ...options.account })
  await account.init()
  await account.locked(async () => { Object.assign(account.data, { clientId: 'issued-client', subject: 'subject', tokens: await tokens(), expiresAt: Date.now() - 1, models: [{ slug: 'gpt-test', displayName: 'Test' }] }); account.save() })
  t.after(() => { account.dispose(); assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, protection, account, tokens, requests, states, fetchImpl }
}
test('encrypted session survives restart; renderer state and catalog contain no credentials', async t => {
  const f = await fixture(t)
  const next = new ChatGPTAccount({ userData: f.root, protection: f.protection, fetchImpl: f.fetchImpl }); t.after(() => next.dispose())
  await next.init()
  assert.equal(next.state().status, 'connected'); assert.equal(next.catalog().length, 1)
  assert(!fs.readFileSync(next.file).includes('private-access'))
  assert(!JSON.stringify([next.state(), next.catalog()]).includes('private-'))
  await next.refreshModels(); assert.equal(next.catalog().length, 1)
})
test('two account instances serialize rotating refresh and persist the successor', async t => {
  let refreshes = 0
  const f = await fixture(t, { responder: async (url, init, tokens) => { if (url.endsWith('/token')) { refreshes++; assert.equal(init.body.get('scope'), null); assert.equal(init.body.get('client_id'), 'issued-client'); await new Promise(r => setTimeout(r, 60)); return json(await tokens()) } } })
  const second = new ChatGPTAccount({ userData: f.root, protection: f.protection, fetchImpl: f.fetchImpl }); await second.init(); t.after(() => second.dispose())
  const values = await Promise.all([f.account.accessToken(), second.accessToken(), f.account.accessToken()])
  assert.equal(refreshes, 1); assert.equal(new Set(values).size, 1)
  assert.notEqual(f.account.data.tokens.refresh_token, 'private-refresh-1')
})
test('rotated credentials survive temporary JWKS failure and restart without refreshing again', async t => {
  let refreshes = 0, failKeys = true
  const f = await fixture(t, { responder: async (url, init, tokens) => {
    if (url.endsWith('/token')) { refreshes++; return json(await tokens()) }
    if (url.endsWith('/keys') && failKeys) throw Error('network-secret-detail')
  } })
  await assert.rejects(f.account.accessToken(), /网络/)
  assert(f.account.data.pending); assert.equal(refreshes, 1)
  failKeys = false
  const second = new ChatGPTAccount({ userData: f.root, protection: f.protection, fetchImpl: f.fetchImpl }); await second.init(); t.after(() => second.dispose())
  assert.match(await second.accessToken(), /^private-access/); assert.equal(refreshes, 1); assert(!second.data.pending)
})
test('invalid refresh grant requires login; network failures retain the session', async t => {
  for (const mode of ['invalid', 'network']) await t.test(mode, async t => {
    const f = await fixture(t, { responder: async url => { if (url.endsWith('/token')) { if (mode === 'network') throw Error('secret'); return json({ error: 'invalid_grant' }, 400) } } })
    await assert.rejects(f.account.accessToken(), mode === 'invalid' ? /重新登录/ : /网络/)
    assert.equal(f.account.state().status, mode === 'invalid' ? 'reauth-required' : 'connected')
    assert(f.account.data.tokens.refresh_token); assert(!JSON.stringify(f.states).includes('secret'))
  })
})
test('standard refresh without an ID token retains the validated account identity', async t => {
  const f = await fixture(t, { responder: async (url, init, tokens) => {
    if (url.endsWith('/token')) { const value = await tokens(); delete value.id_token; return json(value) }
  } })
  const retained = f.account.data.tokens.id_token
  await f.account.accessToken()
  assert.equal(f.account.data.subject, 'subject'); assert.equal(f.account.data.tokens.id_token, retained)
})
test('earliest refresh is respected and 401 can refresh only once', async t => {
  let apiCalls = 0
  const f = await fixture(t, { responder: async url => { if (url.endsWith('/responses')) { apiCalls++; return apiCalls === 1 ? json({ error: {} }, 401) : json({ ok: true }) } } })
  await f.account.locked(async () => { f.account.data.expiresAt = Date.now() + 3_600_000; f.account.save() })
  const result = await f.account.request(f.account.catalog()[0], {}, undefined); assert.deepEqual(await result.json(), { ok: true }); assert.equal(apiCalls, 2)
  await f.account.locked(async () => { f.account.data.refreshAt = Date.now() + 300_000; f.account.save() })
  await assert.rejects(f.account.accessToken({ force: true }), /REFRESH_NOT_YET_AVAILABLE/)
})
test('quota exhaustion is terminal and never falls back; errors redact provider text', async t => {
  const f = await fixture(t, { responder: async url => url.endsWith('/responses') ? json({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'private-access-2' } }, 429) : null })
  await assert.rejects(f.account.request(f.account.catalog()[0], {}, undefined), error => error.requestRejected && /额度已用尽/.test(error.message) && !error.message.includes('private-'))
  assert.equal(f.requests.filter(r => r.url.endsWith('/responses')).length, 1)
})
test('logout aborts streams, clears local credentials, preserves registration and reports unconfirmed revocation', async t => {
  const f = await fixture(t, { responder: async url => url.endsWith('/revoke') ? new Response('', { status: 503 }) : null })
  const state = await f.account.signOut()
  assert.equal(state.status, 'disconnected'); assert.match(state.message, /未能确认/)
  assert.equal(f.account.data.clientId, 'issued-client'); assert(!f.account.data.tokens); assert.equal(f.account.catalog().length, 0)
})
test('mismatched account identity is rejected before credentials become usable', async t => {
  const f = await fixture(t)
  await assert.rejects(f.account.verify(await f.tokens({ nonce: 'wrong' }), 'issued-client', 'expected', 'subject'), /ID_TOKEN_IDENTITY_MISMATCH/)
  await assert.rejects(f.account.verify(await f.tokens(), 'another-client'), /ID_TOKEN_VALIDATION_FAILED/)
})
test('loopback login validates state and PKCE, persists registration and completes without leaking tokens', async t => {
  let f; let nonce; let callback
  f = await fixture(t, { account: { openExternal: async href => {
    const url = new URL(href); nonce = url.searchParams.get('nonce'); callback = new URL(url.searchParams.get('redirect_uri'))
    assert.equal(url.origin, ISSUER); assert.equal(url.searchParams.get('client_id'), 'issued-client'); assert.equal(url.searchParams.get('agent_name_hint'), null); assert(url.searchParams.get('code_challenge'))
    callback.search = new URLSearchParams({ state: 'wrong', code: 'code' }).toString()
    assert.equal((await fetch(callback)).status, 400)
    callback.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'code' }).toString()
    assert.equal((await fetch(callback)).status, 200)
  } }, responder: async (url, init, tokens) => url.endsWith('/token') ? json(await tokens({ nonce })) : null })
  const state = await f.account.signIn()
  assert.equal(state.status, 'connected'); assert.equal(state.modelCount, 1)
  assert(!JSON.stringify(state).includes('private-'))
})
test('login cancellation closes callback and keeps an existing session', async t => {
  let opened; const ready = new Promise(resolve => { opened = resolve })
  const f = await fixture(t, { account: { openExternal: async href => opened(new URL(href).searchParams.get('redirect_uri')) } })
  const result = f.account.signIn(); const callback = await ready; f.account.cancel()
  await assert.rejects(result, /取消/); assert.equal(f.account.state().status, 'connected')
  await assert.rejects(fetch(callback))
})
test('closing a completed SSE response tolerates an already-aborted underlying reader', async t => {
  const f = await fixture(t, { responder: async url => {
    if (!url.endsWith('/responses')) return null
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] } }) + '\n\n'))
    }, cancel() { throw Object.assign(Error('reader already aborted'), { code: 'ERR_INVALID_STATE' }) } }), { headers: { 'content-type': 'text/event-stream' } })
  } })
  const { ChatGPTResponses } = require('../desktop/services/chatgpt-responses.cjs')
  const { readSSE } = require('../desktop/services/model-provider.cjs')
  const bridge = new ChatGPTResponses({ account: f.account, model: f.account.catalog()[0] })
  const result = []; for await (const item of readSSE((await bridge.request({ messages: [] })).body)) result.push(item)
  assert.equal(result.at(-1).choices[0].finish_reason, 'stop'); assert.equal(f.account.controllers.size, 0)
})
