'use strict'

// Independent implementation of the public Sign in with ChatGPT protocol.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { randomUUID, randomBytes, createHash, timingSafeEqual } = require('node:crypto')
const lockfile = require('proper-lockfile')
const ISSUER = 'https://auth.openai.com'
const API = 'https://api.openai.com/v1'
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const terminal = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'])
const known = new Set([...terminal, 'access_denied', 'invalid_client', 'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable', 'subscription_sharing_unsupported_capability', 'subscription_sharing_route_not_supported', 'subscription_sharing_invalid_user', 'chatpass_v2_scope_not_authorized', 'chatpass_v2_invalid_authorization_context', 'subscription_sharing_user_unavailable'])
function failure(code, status = 400) {
  const messages = {
    subscription_sharing_usage_limit_exceeded: 'ChatGPT 订阅额度已用尽。请查看用量或稍后重试；本次请求已停止。',
    REAUTH_REQUIRED: 'ChatGPT 登录已失效，请在设置 → 模型连接中重新登录。',
    STORAGE_UNAVAILABLE: '无法使用系统加密存储，ChatGPT 登录未保存。',
    STORAGE_INVALID: 'ChatGPT 加密登录记录无法读取，请检查当前系统用户或恢复原记录。',
    LOGIN_CANCELLED: '已取消 ChatGPT 登录。',
    ACCOUNT_CHANGED: 'ChatGPT 账号已改变，请重新选择模型。',
    STREAM_INCOMPLETE: 'ChatGPT 响应中断，未执行本次响应的工具调用。',
    NETWORK_ERROR: 'ChatGPT 连接失败，请检查网络后重试。',
  }
  const error = new Error(messages[code] || `ChatGPT 请求失败（${known.has(code) || /^[A-Z_]+$/.test(code) ? code : 'REQUEST_FAILED'}）。请重试或在模型连接中重新登录。`)
  return Object.assign(error, { code, status, requestRejected: true })
}
function apiError(data, status) {
  const code = typeof data?.error === 'string' ? data.error : data?.error?.code || data?.code
  return failure(known.has(code) ? code : status === 401 ? 'REAUTH_REQUIRED' : 'UPSTREAM_REQUEST_FAILED', status)
}
async function readJSON(response) {
  let value = ''; const decoder = new TextDecoder()
  for await (const chunk of response.body) {
    value += decoder.decode(chunk, { stream: true })
    if (value.length > 2_000_000) throw failure('RESPONSE_TOO_LARGE')
  }
  try { return JSON.parse(value + decoder.decode()) } catch { throw failure('INVALID_RESPONSE', response.status) }
}
class ChatGPTAccount {
  constructor({ userData, protection, openExternal, fetchImpl = globalThis.fetch, onChange = () => {}, now = Date.now }) {
    this.file = path.join(userData, 'chatgpt-account.enc')
    this.protection = protection; this.openExternal = openExternal; this.fetch = fetchImpl; this.onChange = onChange; this.now = now
    this.data = {}; this.controllers = new Set(); this.disposed = false; this.message = ''; this.busy = false
  }
  async init() {
    try { await this.locked(async () => { if (!this.data.hostId) { this.data.hostId = `urn:uuid:${randomUUID()}`; this.save() } }) }
    catch (error) { this.storageError = error.code || 'STORAGE_UNAVAILABLE'; this.message = failure(this.storageError).message }
    this.schedule(); return this.state()
  }
  load() {
    if (!fs.existsSync(this.file)) { this.data = {}; return }
    try { this.data = JSON.parse(this.protection.decryptString(fs.readFileSync(this.file))); if (this.data.version !== 1) throw new Error() }
    catch { throw failure('STORAGE_INVALID') }
  }
  save() {
    if (this.compromised) throw failure('REFRESH_LOCK_LOST')
    if (this.protection.isEncryptionAvailable && !this.protection.isEncryptionAvailable()) throw failure('STORAGE_UNAVAILABLE')
    if (this.protection.getSelectedStorageBackend?.() === 'basic_text') throw failure('STORAGE_UNAVAILABLE')
    const tmp = `${this.file}.${randomUUID()}.tmp`
    try {
      const encrypted = this.protection.encryptString(JSON.stringify({ ...this.data, version: 1 }))
      fs.writeFileSync(tmp, encrypted, { mode: 0o600, flush: true }); fs.renameSync(tmp, this.file)
    } catch { try { fs.unlinkSync(tmp) } catch {} throw failure('STORAGE_UNAVAILABLE') }
  }
  async locked(fn) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    // A cross-process lease prevents rotated refresh tokens being consumed twice.
    const release = await lockfile.lock(this.file, { realpath: false, stale: 120_000, update: 10_000, retries: { retries: 80, minTimeout: 100, maxTimeout: 500 }, onCompromised: () => { this.compromised = true } })
    try { this.compromised = false; this.load(); return await fn() } finally { await release() }
  }
  state() {
    return { status: this.storageError ? 'error' : this.busy ? 'signing-in' : this.data.reauth ? 'reauth-required' : this.data.tokens ? 'connected' : 'disconnected',
      email: this.data.email || '', modelCount: this.catalog().length, message: this.message }
  }
  emit() { if (!this.disposed) this.onChange(this.state()) }
  catalog() {
    if (this.storageError || !this.data.subject) return []
    const accountId = createHash('sha256').update(this.data.subject).digest('hex').slice(0, 16)
    return (this.data.models || []).map(m => ({ id: `chatgpt:${accountId}:${m.slug}`, providerId: 'chatgpt', authType: 'chatgpt', accountId,
      displayName: `ChatGPT · ${m.displayName}`, model: m.slug, baseURL: API, hasApiKey: Boolean(this.data.tokens && !this.data.reauth) }))
  }
  async json(url, init = {}) {
    try {
      const response = await this.fetch(url, { ...init, redirect: 'error', signal: init.signal || AbortSignal.timeout(30_000) })
      const data = await readJSON(response)
      if (!response.ok) throw apiError(data, response.status)
      return data
    } catch (error) { if (error.requestRejected) throw error; throw failure('NETWORK_ERROR') }
  }
  async discovery() {
    const config = await this.json(`${ISSUER}/.well-known/openid-configuration`)
    if (config.issuer !== ISSUER || config.authorization_endpoint !== `${ISSUER}/api/accounts/authorize` || config.token_endpoint !== `${ISSUER}/api/accounts/oauth/token`) throw failure('INVALID_DISCOVERY')
    for (const key of ['jwks_uri', 'revocation_endpoint']) {
      if (!config[key] && key === 'revocation_endpoint') continue
      const url = new URL(config[key]); if (url.origin !== ISSUER || url.username || url.password) throw failure('INVALID_DISCOVERY')
    }
    return config
  }
  async verify(tokens, clientId, nonce, subject) {
    if (!tokens?.access_token || !tokens.id_token || typeof tokens.access_token !== 'string' || tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw failure('INVALID_TOKEN_RESPONSE')
    const { createLocalJWKSet, jwtVerify } = await import('jose')
    const config = await this.discovery()
    const keys = createLocalJWKSet(await this.json(config.jwks_uri))
    let identity
    try { ({ payload: identity } = await jwtVerify(tokens.id_token, keys, { issuer: ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat', ...(nonce ? ['nonce'] : [])], clockTolerance: 5 })) }
    catch { throw failure('ID_TOKEN_VALIDATION_FAILED') }
    if (typeof identity.sub !== 'string' || !identity.sub || (nonce && identity.nonce !== nonce) || (subject && subject !== identity.sub) || (identity.azp && identity.azp !== clientId) || (Array.isArray(identity.aud) && identity.aud.length > 1 && identity.azp !== clientId)) throw failure('ID_TOKEN_IDENTITY_MISMATCH')
    if (!String(tokens.scope || '').split(/\s+/).includes('chatgpt.tokens.use.direct')) throw failure('PLAN_USAGE_NOT_AUTHORIZED')
    return identity
  }
  async acceptPending() {
    const pending = this.data.pending
    if (!pending) return
    let identity
    if (!pending.nonce && !pending.tokens.id_token && this.data.subject && this.data.tokens) {
      // OIDC refresh may omit an ID token. Keep the already validated identity;
      // do not revalidate an expired retained ID token as if it were newly issued.
      if (typeof pending.tokens.access_token !== 'string' || !pending.tokens.access_token || pending.tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(pending.tokens.expires_in) || pending.tokens.expires_in <= 0 || !String(pending.tokens.scope || '').split(/\s+/).includes('chatgpt.tokens.use.direct')) throw failure('INVALID_TOKEN_RESPONSE')
      identity = { sub: this.data.subject, email: this.data.email }
      pending.tokens.id_token = this.data.tokens.id_token
    } else identity = await this.verify(pending.tokens, this.data.clientId, pending.nonce, this.data.subject)
    this.data.tokens = pending.tokens; this.data.subject = identity.sub; this.data.email = typeof identity.email === 'string' ? identity.email : this.data.email || ''
    this.data.expiresAt = pending.receivedAt + pending.tokens.expires_in * 1000
    const earliest = pending.tokens.earliest_refresh_at
    this.data.refreshAt = Number.isFinite(earliest) ? earliest * 1000 : 0
    delete this.data.pending; delete this.data.reauth; this.save()
  }
  async signIn() {
    if (this.busy) return this.state()
    if (this.storageError) throw failure(this.storageError)
    this.busy = true; this.message = ''; this.emit()
    try {
      await this.locked(async () => {
        if (this.disposed) throw failure('LOGIN_CANCELLED')
        const tx = { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'), verifier: randomBytes(48).toString('base64url') }
        const result = await new Promise((resolve, reject) => {
          let consumed = false
          const server = http.createServer((req, res) => {
            const address = server.address(); const host = `127.0.0.1:${address.port}`
            const url = new URL(req.url, `http://${host}`)
            if (req.method !== 'GET' || req.headers.host !== host || url.pathname !== '/auth/callback') { res.writeHead(404); res.end(); return }
            const actual = Buffer.from(url.searchParams.get('state') || ''); const expected = Buffer.from(tx.state)
            if (consumed || actual.length !== expected.length || !timingSafeEqual(actual, expected) || ['state', 'code', 'client_id', 'error'].some(key => url.searchParams.getAll(key).length > 1)) { res.writeHead(400); res.end('Invalid sign-in callback.'); return }
            consumed = true
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); res.end('已收到授权，请返回 Stable 查看登录结果。')
            if (url.searchParams.has('error')) reject(apiError({ error: url.searchParams.get('error') }, 400))
            else resolve({ code: url.searchParams.get('code'), clientId: url.searchParams.get('client_id') || this.data.clientId })
          })
          const cleanup = () => { clearTimeout(timer); server.close(); server.closeAllConnections(); this.cancelLogin = null }
          this.cancelLogin = () => { cleanup(); reject(failure('LOGIN_CANCELLED')) }
          const timer = setTimeout(() => { cleanup(); reject(failure('LOGIN_EXPIRED')) }, 600_000); timer.unref()
          tx.cleanup = cleanup
          server.on('error', () => { cleanup(); reject(failure('LOGIN_LISTENER_FAILED')) })
          server.listen(0, '127.0.0.1', async () => {
            tx.redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`
            const url = new URL(`${ISSUER}/api/accounts/authorize`)
            url.search = new URLSearchParams({ client_id: this.data.clientId || 'dynamic_agent_client', ...(!this.data.clientId ? { agent_name_hint: 'Stable' } : {}), ext_agent_host_id: this.data.hostId,
              redirect_uri: tx.redirectUri, response_type: 'code', scope: SCOPE, resource: API, state: tx.state, nonce: tx.nonce, code_challenge_method: 'S256',
              code_challenge: createHash('sha256').update(tx.verifier).digest('base64url'), ...(this.data.tokens?.id_token ? { id_token_hint: this.data.tokens.id_token } : {}) }).toString()
            try { await this.openExternal(url.href) } catch { cleanup(); reject(failure('OPEN_BROWSER_FAILED')) }
          })
        }).finally(() => tx.cleanup?.())
        if (!result.code || result.code.length > 16384 || !result.clientId || result.clientId === 'dynamic_agent_client' || result.clientId.length > 512 || /\s/.test(result.clientId) || (this.data.clientId && result.clientId !== this.data.clientId)) throw failure('INVALID_AUTHORIZATION_CALLBACK')
        this.data.clientId = result.clientId; this.save()
        const tokens = await this.json(`${ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', client_id: result.clientId, code: result.code, code_verifier: tx.verifier, redirect_uri: tx.redirectUri, resource: API }) })
        this.data.pending = { tokens, nonce: tx.nonce, receivedAt: this.now() }; this.save()
        await this.acceptPending()
      })
      await this.refreshModels(); this.message = '已加密保存登录。请在聊天输入框主动选择 ChatGPT 模型。'
    } catch (error) { this.message = error.requestRejected ? error.message : failure('NETWORK_ERROR').message; throw failure(error.code || 'NETWORK_ERROR') }
    finally { this.busy = false; this.schedule(); this.emit() }
    return this.state()
  }
  cancel() { this.cancelLogin?.(); return this.state() }
  async accessToken({ force = false, rejectedToken } = {}) {
    if (this.storageError) throw failure(this.storageError)
    return this.locked(async () => {
      if (this.disposed) throw failure('REAUTH_REQUIRED')
      await this.acceptPending()
      if (!this.data.tokens || this.data.reauth) throw failure('REAUTH_REQUIRED')
      if (rejectedToken && rejectedToken !== this.data.tokens.access_token) return this.data.tokens.access_token
      const due = this.data.expiresAt - 120_000 <= this.now()
      if (!(force || due)) return this.data.tokens.access_token
      if (this.data.refreshAt > this.now()) {
        if (force || this.data.expiresAt <= this.now()) throw failure('REFRESH_NOT_YET_AVAILABLE')
        return this.data.tokens.access_token
      }
      if (!this.data.tokens.refresh_token) throw failure('REAUTH_REQUIRED')
      try {
        const tokens = await this.json(`${ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: this.data.clientId, refresh_token: this.data.tokens.refresh_token, resource: API }) })
        // Persist the rotated successor before JWT/JWKS validation or cancellation.
        this.data.pending = { tokens: { ...tokens, refresh_token: tokens.refresh_token || this.data.tokens.refresh_token, scope: tokens.scope || this.data.tokens.scope }, receivedAt: this.now() }
        if (this.compromised) throw failure('REFRESH_LOCK_LOST')
        this.save(); await this.acceptPending(); this.message = ''; this.emit()
        return this.data.tokens.access_token
      } catch (error) {
        if (terminal.has(error.code) || error.code === 'REAUTH_REQUIRED') { this.data.reauth = true; this.save(); this.message = failure('REAUTH_REQUIRED').message; this.emit(); throw failure('REAUTH_REQUIRED') }
        throw error
      } finally { this.schedule() }
    })
  }
  schedule() {
    clearTimeout(this.timer)
    if (this.disposed || this.storageError || this.data.reauth || !this.data.tokens) return
    const delay = Math.max(30_000, Math.max(this.data.expiresAt - 120_000, this.data.refreshAt || 0) - this.now())
    this.timer = setTimeout(() => { void this.accessToken().catch(error => { this.message = error.message; this.emit() }).finally(() => this.schedule()) }, Math.min(delay, 2_147_483_647))
    this.timer.unref()
  }
  async authorized(url, init = {}, accountId) {
    const controller = new AbortController(); this.controllers.add(controller)
    const signal = AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : []), AbortSignal.timeout(600_000)])
    try {
      let token = await this.accessToken()
      const check = () => { if (accountId && !this.catalog().some(model => model.accountId === accountId)) throw failure('ACCOUNT_CHANGED'); signal.throwIfAborted() }
      check()
      const send = () => this.fetch(url, { ...init, redirect: 'error', signal, headers: { ...init.headers, authorization: `Bearer ${token}` } })
      let response = await send()
      if (response.status === 401) { await response.body?.cancel(); token = await this.accessToken({ force: true, rejectedToken: token }); check(); response = await send() }
      if (!response.ok) { const error = apiError(await readJSON(response), response.status); this.message = error.message; this.emit(); throw error }
      // Keep cancellation registered until the body has been consumed.
      const reader = response.body.getReader(); const account = this; let closed = false
      return new Response(new ReadableStream({
        async pull(stream) {
          try { const next = await reader.read(); if (closed) return; if (next.done) { closed = true; account.controllers.delete(controller); stream.close() } else stream.enqueue(next.value) }
          catch { if (!closed) { closed = true; account.controllers.delete(controller); stream.error(failure('STREAM_INCOMPLETE')) } }
        },
        async cancel(reason) {
          closed = true; controller.abort(); account.controllers.delete(controller)
          // Undici may already have closed the reader on abort. Cleanup must not
          // invalidate a response whose completed event was already consumed.
          try { await reader.cancel(reason) } catch {}
        },
      }), { status: response.status, headers: response.headers })
    } catch (error) { this.controllers.delete(controller); if (error.requestRejected) throw error; if (signal.aborted) throw failure('REQUEST_CANCELLED'); throw failure('NETWORK_ERROR') }
  }
  async refreshModels() {
    const subject = this.data.subject
    const response = await this.authorized(`${API}/models`)
    const body = await readJSON(response)
    if (!Array.isArray(body.models)) throw failure('INVALID_MODEL_CATALOG')
    const models = body.models.filter(m => m?.visibility === 'list' && /^[a-zA-Z0-9._-]{1,120}$/.test(m.slug || '')).map(m => ({ slug: m.slug, displayName: typeof m.display_name === 'string' ? m.display_name.slice(0, 120) : m.slug }))
    await this.locked(async () => { if (!this.data.tokens) throw failure('REAUTH_REQUIRED'); if (this.data.subject !== subject) throw failure('ACCOUNT_CHANGED'); this.data.models = models; this.save() })
    this.emit(); return this.state()
  }
  request(model, body, signal) {
    if (!model.accountId || !this.catalog().some(item => item.id === model.id && item.model === model.model) || (body.model && body.model !== model.model)) throw failure('ACCOUNT_CHANGED')
    return this.authorized(`${API}/responses`, { method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body) }, model.accountId)
  }
  async signOut() {
    this.cancel(); for (const controller of this.controllers) controller.abort(); clearTimeout(this.timer)
    let revoked = false
    await this.locked(async () => {
      const token = this.data.pending?.tokens?.refresh_token || this.data.tokens?.refresh_token
      if (token) {
        try {
          const config = await this.discovery()
          if (config.revocation_endpoint) {
            const response = await this.fetch(config.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: 'refresh_token', client_id: this.data.clientId }) })
            revoked = response.ok; await response.body?.cancel()
          }
        } catch {}
      }
      this.data = { hostId: this.data.hostId, clientId: this.data.clientId, subject: this.data.subject }; this.save()
    })
    this.message = revoked ? '已退出 ChatGPT 并撤销授权。' : '本机登录已清除。未能确认远端撤销，可在 ChatGPT 设置中移除 Stable 授权。'
    this.emit(); return this.state()
  }
  dispose() { this.disposed = true; this.cancel(); clearTimeout(this.timer); for (const controller of this.controllers) controller.abort() }
}
module.exports = { ChatGPTAccount, API, ISSUER, failure, apiError }
