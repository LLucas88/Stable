'use strict'

const { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const MAX_LOG_BYTES = 256 * 1024
const responseDiagnostics = new WeakMap()
const ROUTES = new Set(['/api/auth/login', '/api/auth/change-password', '/api/auth/logout', '/api/account', '/api/usage/summary', '/v1/models', '/v1/chat/completions'])
const NETWORK_CODES = ['ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_NO_SUPPORTED_PROXIES', 'ERR_PROXY_AUTH_UNSUPPORTED', 'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_COMMON_NAME_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_REFUSED', 'ERR_INTERNET_DISCONNECTED', 'ERR_TIMED_OUT', 'ERR_ABORTED']

function responseType(response) {
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (type === 'application/json' || type.endsWith('+json')) return 'json'
  if (type === 'text/event-stream') return 'event-stream'
  if (type === 'text/html') return 'html'
  return type ? 'other' : 'empty'
}

function networkCode(error) {
  if (error?.name === 'TimeoutError') return 'ERR_TIMED_OUT'
  if (error?.name === 'AbortError') return 'ERR_ABORTED'
  return NETWORK_CODES.find((code) => String(error?.message || '').includes(code)) || 'NETWORK_ERROR'
}

// Only records constructed below reach disk. Never log request/response bodies,
// arbitrary headers, URLs, proxy addresses, exception text, or account data.
function appendDiagnostic(logPath, record) {
  if (!logPath) return
  try {
    mkdirSync(path.dirname(logPath), { recursive: true })
    if (existsSync(logPath) && statSync(logPath).size >= MAX_LOG_BYTES) {
      const previous = `${logPath}.1`
      if (existsSync(previous)) unlinkSync(previous)
      renameSync(logPath, previous)
    }
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch { /* Diagnostics must not prevent signing in, including on a full disk. */ }
}

async function proxyMode(session, url) {
  if (typeof session.resolveProxy !== 'function') return 'unknown'
  let timer
  try {
    const result = await Promise.race([
      session.resolveProxy(url),
      new Promise((resolve) => { timer = setTimeout(() => resolve(''), 750) }),
    ])
    if (result === 'DIRECT') return 'direct'
    return /^(PROXY|HTTPS|SOCKS|SOCKS4|SOCKS5|QUIC)\s/.test(String(result)) ? 'proxy' : 'unknown'
  } catch { return 'unknown' } finally { clearTimeout(timer) }
}

function diagnosticSuffix(record) {
  return record ? `（诊断编号 ${record.id}）` : ''
}

function cloudResponseError(response, payload) {
  const record = responseDiagnostics.get(response)
  const businessMessage = typeof payload?.error?.message === 'string' ? payload.error.message : typeof payload?.message === 'string' ? payload.message : ''
  let message = businessMessage.trim()
  if (!message) {
    if (response.status === 403) message = 'Stable Cloud 访问被拒绝（HTTP 403），未收到可识别的业务错误，可能是代理或站点入口拦截。请将诊断编号和网络日志交给管理员。'
    else if (response.status === 407) message = '网络代理要求认证（HTTP 407）。请联系公司网络管理员确认代理登录。'
    else if (response.ok) message = 'Stable Cloud 返回了无法识别的响应，可能是代理或站点入口返回的网页。请将诊断编号和网络日志交给管理员。'
    else message = `Stable Cloud 请求失败（HTTP ${response.status}）。`
  }
  const error = new Error(`${message}${diagnosticSuffix(record)}`)
  error.status = response.ok ? 502 : response.status
  error.code = payload?.error?.code || payload?.code || (response.ok ? 'invalid_cloud_response' : `http_${response.status}`)
  return error
}

function createCloudFetch({ session, logPath, appVersion }) {
  if (typeof session?.fetch !== 'function') throw new Error('Stable Cloud Chromium 网络层未就绪。')
  const version = /^[0-9A-Za-z.-]{1,48}$/.test(String(appVersion)) ? String(appVersion) : 'unknown'
  return async (url, options = {}) => {
    const pathname = new URL(url).pathname
    const record = {
      id: randomUUID(), time: new Date().toISOString(), version, transport: 'chromium',
      method: ['GET', 'POST'].includes(options.method || 'GET') ? options.method || 'GET' : 'other',
      route: ROUTES.has(pathname) ? pathname : 'other',
    }
    let response
    try {
      // Use the Chromium system/PAC proxy path; never silently retry credentials
      // over a direct connection. Keep cloud cookies out of the browser session.
      response = await session.fetch(url, { ...options, credentials: 'omit', cache: 'no-store', redirect: 'error', bypassCustomProtocolHandlers: true })
    } catch (cause) {
      const code = networkCode(cause)
      Object.assign(record, { status: 0, networkCode: code, proxy: await proxyMode(session, url) })
      appendDiagnostic(logPath, record)
      const message = code === 'ERR_TIMED_OUT' ? '连接 Stable Cloud 超时，请检查网络后重试。' : code.startsWith('ERR_CERT_') ? 'Stable Cloud HTTPS 证书验证失败，请联系网络管理员检查证书；不要关闭证书校验。' : '无法连接 Stable Cloud，请检查系统代理或联系网络管理员。'
      const error = new Error(`${message} [${code}]${diagnosticSuffix(record)}`)
      error.code = code
      error.status = code === 'ERR_TIMED_OUT' ? 504 : 502
      error.cloudDiagnostic = true
      throw error
    }
    const type = responseType(response)
    Object.assign(record, { status: response.status, responseType: type })
    if (!response.ok || !['json', 'event-stream'].includes(type)) {
      const ray = response.headers.get('cf-ray') || ''
      record.proxy = await proxyMode(session, url)
      if (/^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/.test(ray)) record.cfRay = ray
    }
    appendDiagnostic(logPath, record)
    responseDiagnostics.set(response, record)
    return response
  }
}

module.exports = { createCloudFetch, cloudResponseError, responseType, MAX_LOG_BYTES }
