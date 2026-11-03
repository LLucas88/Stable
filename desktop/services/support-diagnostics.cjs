'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { appendDiagnostic } = require('./cloud-transport.cjs')
const routes = new Set(['/api/account', '/api/auth/login', '/api/auth/logout', '/api/auth/change-password', '/api/usage/summary', '/v1/models', '/v1/chat/completions', '/v1/tools/search', '/v1/tools/fetch', 'other'])
const phases = new Set(['start', 'headers', 'complete', 'timeout', 'error', 'startup_failed'])
const cloudStates = new Set(['checking', 'signed_out', 'authenticated', 'password_change_required', 'unavailable', 'disabled'])
const updateStates = new Set(['idle', 'development', 'checking', 'available', 'current', 'downloading', 'downloaded', 'installing', 'error'])
const updateCodes = new Set(['ERR_UPDATER_CHECKSUM_MISMATCH', 'ERR_UPDATER_INVALID_RELEASE_FEED', 'ERR_UPDATER_INVALID_UPDATE_INFO', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_ASSET_NOT_FOUND', 'ERR_UPDATER_NO_FILES_PROVIDED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ENOSPC', 'EACCES', 'EPERM'])
const codes = new Set(['ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED','ERR_NO_SUPPORTED_PROXIES','ERR_PROXY_AUTH_UNSUPPORTED','ERR_CERT_AUTHORITY_INVALID','ERR_CERT_COMMON_NAME_INVALID','ERR_CERT_DATE_INVALID','ERR_NAME_NOT_RESOLVED','ERR_CONNECTION_CLOSED','ERR_CONNECTION_RESET','ERR_CONNECTION_REFUSED','ERR_INTERNET_DISCONNECTED','ERR_TIMED_OUT','ERR_ABORTED','NETWORK_ERROR'])
function sanitize(record) {
  if (!record || typeof record !== 'object') return null
  const clean = {}
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.time || '')) clean.time = record.time
  if (/^[a-f0-9-]{36}$/i.test(record.id || '')) clean.id = record.id
  if (/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(record.version || '')) clean.version = record.version
  if (routes.has(record.route)) clean.route = record.route
  if (phases.has(record.phase)) clean.phase = record.phase
  if (updateStates.has(record.updateStatus)) clean.updateStatus = record.updateStatus
  if (updateCodes.has(record.updateCode)) clean.updateCode = record.updateCode
  if (['GET','POST'].includes(record.method)) clean.method = record.method
  if (Number.isInteger(record.status) && record.status >= 0 && record.status <= 599) clean.status = record.status
  if (Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0) clean.elapsedMs = Math.min(Math.round(record.elapsedMs), 86400000)
  if (codes.has(record.networkCode)) clean.networkCode = record.networkCode
  if (['direct','proxy','unknown'].includes(record.proxy)) clean.proxy = record.proxy
  if (['json','event-stream','html','other','empty'].includes(record.responseType)) clean.responseType = record.responseType
  return clean.time ? clean : null
}
function recordRecovery(logPath, record) {
  const clean = sanitize({ ...record, time: new Date().toISOString() })
  if (clean) appendDiagnostic(logPath, clean)
}
function readEvents(logDir, name) {
  const file = path.join(logDir, name)
  let fd
  try {
    if (fs.lstatSync(file).isSymbolicLink()) return []
    if (path.dirname(fs.realpathSync(file)).toLowerCase() !== path.resolve(logDir).toLowerCase()) return []
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size, length = Math.min(size, 512 * 1024)
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, size - length)
    return buffer.toString('utf8').split(/\r?\n/).flatMap(line => {
      try { const item = sanitize(JSON.parse(line)); return item ? [item] : [] } catch { return [] }
    }).slice(-1000)
  } catch { return [] } finally { if (fd !== undefined) fs.closeSync(fd) }
}
function collectDiagnostics({ userData, version, cloudStatus, updateStatus }) {
  const logDir = path.join(userData, 'logs')
  return {
    format: 1, generatedAt: new Date().toISOString(),
    version: /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version) ? version : 'unknown',
    cloudStatus: cloudStates.has(cloudStatus) ? cloudStatus : 'unknown',
    updateStatus: updateStates.has(updateStatus) ? updateStatus : 'unknown',
    // Exclude identities, paths, messages, bodies, headers and secrets.
    network: ['cloud-network.jsonl.1','cloud-network.jsonl'].flatMap(name => readEvents(logDir, name)),
    recovery: ['cloud-recovery.jsonl.1','cloud-recovery.jsonl'].flatMap(name => readEvents(logDir, name)),
  }
}
module.exports = { collectDiagnostics, recordRecovery, sanitize }
