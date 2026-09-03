'use strict'

const os = require('node:os')
const { randomUUID } = require('node:crypto')
const { cloudResponseError } = require('./cloud-transport.cjs')

const DEFAULT_CLOUD_URL = 'https://stable-cloud-admin.foamy-auk-6029.chatgpt.site'
const DEVICE_TOKEN_KEY = 'cloud:device-token'
const DEVICE_ID_SETTING = 'cloudDeviceId'

function cleanBaseURL(value) {
  const raw = String(value || DEFAULT_CLOUD_URL).trim().replace(/\/+$/, '')
  let url
  try { url = new URL(raw) } catch { throw new Error('Stable Cloud 地址无效。') }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))) {
    throw new Error('Stable Cloud 只允许 HTTPS 或本机 HTTP 地址。')
  }
  return raw
}

function timeoutSignal(milliseconds = 15_000) {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(milliseconds) : undefined
}

class CloudAccountService {
  constructor({ store, secrets, appVersion, fetchImpl = globalThis.fetch, baseURL = process.env.STABLE_CLOUD_URL }) {
    this.store = store
    this.secrets = secrets
    this.appVersion = appVersion
    this.fetch = fetchImpl
    this.baseURL = cleanBaseURL(baseURL)
    this.snapshot = { status: 'checking', account: null, quota: null, usage: null, models: [], error: '', baseURL: this.baseURL }
    let deviceId = String(store.getSetting(DEVICE_ID_SETTING) || '')
    if (!deviceId) { deviceId = randomUUID(); store.setSetting(DEVICE_ID_SETTING, deviceId) }
    this.device = { id: deviceId, name: os.hostname() || 'Windows 设备', platform: process.platform, appVersion }
  }

  token() {
    try { return this.secrets.get(DEVICE_TOKEN_KEY) } catch (error) {
      this.secrets.remove(DEVICE_TOKEN_KEY)
      throw new Error(`Stable Cloud 登录凭据无法读取：${error.message}`)
    }
  }

  publicState() { return structuredClone(this.snapshot) }
  isAuthenticated() { return this.snapshot.status === 'authenticated' || this.snapshot.status === 'password_change_required' }

  async request(pathname, { method = 'GET', body, token = this.token() } = {}) {
    const headers = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    let response
    try {
      response = await this.fetch(`${this.baseURL}${pathname}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeoutSignal(), redirect: 'error',
      })
    } catch (error) {
      if (error.cloudDiagnostic) throw error
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('连接 Stable Cloud 超时，请检查网络后重试。')
      throw new Error(`无法连接 Stable Cloud：${error.message}`)
    }
    const text = await response.text()
    let payload = null
    if (text) {
      try { payload = JSON.parse(text) } catch { payload = null }
    }
    if (!response.ok) throw cloudResponseError(response, payload)
    if (text && !payload) throw cloudResponseError(response, null)
    return payload
  }

  async restore() {
    const token = this.token()
    if (!token) { this.snapshot = { ...this.snapshot, status: 'signed_out', error: '' }; return this.publicState() }
    try {
      await this.refresh()
    } catch (error) {
      if (error.status === 401) {
        this.secrets.remove(DEVICE_TOKEN_KEY)
        this.snapshot = { ...this.snapshot, status: 'signed_out', account: null, quota: null, usage: null, models: [], error: '登录已失效，请重新登录。' }
      } else {
        this.snapshot = { ...this.snapshot, status: 'unavailable', error: error.message }
      }
    }
    return this.publicState()
  }

  async login(username, password) {
    const result = await this.request('/api/auth/login', {
      method: 'POST', token: '', body: { username: String(username || '').trim(), password: String(password || ''), device: this.device },
    })
    if (!result?.device_token || !result?.account) throw new Error('Stable Cloud 登录响应不完整。')
    this.secrets.set(DEVICE_TOKEN_KEY, result.device_token)
    this.snapshot = {
      ...this.snapshot, status: result.account.mustChangePassword ? 'password_change_required' : 'authenticated',
      account: result.account, quota: result.quota, usage: null, models: [], error: '',
    }
    if (!result.account.mustChangePassword) await this.refresh()
    return this.publicState()
  }

  async changePassword(currentPassword, newPassword) {
    const result = await this.request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
    if (!result?.device_token) throw new Error('Stable Cloud 改密响应不完整。')
    this.secrets.set(DEVICE_TOKEN_KEY, result.device_token)
    await this.refresh()
    return this.publicState()
  }

  async refresh() {
    const account = await this.request('/api/account')
    if (!account?.account) throw new Error('Stable Cloud 账号响应不完整。')
    if (account.account.mustChangePassword) {
      this.snapshot = { ...this.snapshot, status: 'password_change_required', account: account.account, quota: account.quota, usage: null, models: [], error: '' }
      return this.publicState()
    }
    const [catalog, usage] = await Promise.all([
      this.request('/v1/models'),
      this.request('/api/usage/summary'),
    ])
    this.snapshot = {
      ...this.snapshot, status: 'authenticated', account: account.account, quota: account.quota,
      usage, models: Array.isArray(catalog?.data) ? catalog.data : [], error: '',
    }
    return this.publicState()
  }

  async logout() {
    const token = this.token()
    if (token) {
      try { await this.request('/api/auth/logout', { method: 'POST', token }) } catch { /* local logout must always succeed */ }
    }
    this.secrets.remove(DEVICE_TOKEN_KEY)
    this.snapshot = { ...this.snapshot, status: 'signed_out', account: null, quota: null, usage: null, models: [], error: '' }
    return this.publicState()
  }
}

module.exports = { CloudAccountService, DEFAULT_CLOUD_URL, DEVICE_TOKEN_KEY, cleanBaseURL }
