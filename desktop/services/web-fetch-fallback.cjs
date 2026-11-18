'use strict'

const { publicWebURL } = require('./deepseek-web.cjs')

function pageKey(value) {
  const url = new URL(publicWebURL(value))
  url.hash = ''
  return url.href
}

// Only runtime errors can unlock the fallback. Never inspect page/extraction
// text: a webpage must not be able to manufacture permission to use a service.
function recoverableFetchError(error) {
  const text = String(error || '')
  if (/\b(?:401|402|403)\b|safe|security|permission|denied|forbidden|blocked|auth|quota|budget|cancel|interrupt|安全|审批|拒绝|禁止|取消|额度|余额/i.test(text)) return false
  return /(?:status code|HTTP(?:\/\d(?:\.\d)?)?)\s*[:=]?\s*(?:404|408|410|415|422|429|5\d\d)\b|\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b|^(?:fetch failed|network error|request timed out|request timeout)(?:[.:\s]|$)/i.test(text)
}

function createWebFetchFallbackPolicy() {
  const attempts = new Map()
  return {
    start(id, url) { attempts.set(id, { url: pageKey(url), state: 'pending' }) },
    blocked(id, url) {
      try { attempts.set(id, { url: pageKey(url), state: 'blocked' }) } catch { /* Invalid URLs never qualify. */ }
    },
    complete(id) { const attempt = attempts.get(id); if (attempt) attempt.state = 'success' },
    failed(id, error, interrupted = false) {
      const attempt = attempts.get(id)
      if (attempt) attempt.state = !interrupted && recoverableFetchError(error) ? 'recoverable' : 'blocked'
    },
    assertAllowed(url) {
      const key = pageKey(url), matching = [...attempts.values()].filter(attempt => attempt.url === key)
      if (!matching.length) throw Error('备用抓取尚未启用：请先用 ToolSearch 查找 WebFetch，再用原生 WebFetch 读取同一 URL；只有实际发生兼容性或服务错误后才可回退。')
      if (matching.some(attempt => attempt.state === 'blocked')) throw Error('不能回退抓取：原生 WebFetch 曾被拒绝、被安全策略阻止或错误原因尚未明确；不可换用工具绕过限制。')
      if (matching.some(attempt => attempt.state === 'pending')) throw Error('原生 WebFetch 尚未结束，请等待结果后决定是否使用备用抓取。')
      if (matching.some(attempt => attempt.state === 'success')) throw Error('原生 WebFetch 已成功读取该 URL，请使用其结果或 offset 续读，不重复使用备用抓取。')
      if (!matching.some(attempt => attempt.state === 'recoverable')) throw Error('没有可用于回退的原生 WebFetch 失败记录。')
    },
  }
}

module.exports = { createWebFetchFallbackPolicy, recoverableFetchError }
