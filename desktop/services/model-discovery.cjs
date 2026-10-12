'use strict'
const { createHash } = require('node:crypto')
const { modelSecretKey, normalizeBaseURL } = require('./model-registry.cjs')

async function discoverModels(registry, fetchImpl = globalThis.fetch) {
  if (registry.cloudCatalog()) {
    await registry.cloudGateway.account.refresh()
    return { catalog: registry.publicCatalog(), added: 0, errors: [] }
  }
  const initial = registry.store.modelCatalog(), seen = new Set(), errors = []
  let added = 0
  for (const profile of initial.items) {
    let apiKey, baseURL
    try {
      baseURL = normalizeBaseURL(profile.baseURL)
      apiKey = registry.secrets.get(modelSecretKey(profile.id)) || (profile.id === initial.legacyModelId ? registry.secrets.get('apiKey') : '')
      if (!apiKey) continue
      const identity = baseURL + createHash('sha256').update(apiKey).digest('hex')
      if (seen.has(identity)) continue
      seen.add(identity)
      const response = await fetchImpl(baseURL + '/models', { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) { errors.push(`${profile.displayName}：模型列表请求失败（HTTP ${response.status}）`); continue }
      const payload = await response.json()
      if (!Array.isArray(payload?.data)) { errors.push(`${profile.displayName}：接口未返回模型列表`); continue }
      for (const item of payload.data) {
        if (typeof item?.id !== 'string' || !item.id.trim() || item.id.length > 160 || /[\x00-\x1f]/.test(item.id)) continue
        const model = item.id.trim()
        if (registry.store.modelCatalog().items.some(existing => existing.baseURL.replace(/\/+$/, '') === baseURL && existing.model === model)) continue
        const id = 'api-' + createHash('sha256').update(baseURL + '\0' + profile.providerId + '\0' + model).digest('hex').slice(0, 32)
        registry.secrets.set(modelSecretKey(id), apiKey)
        registry.store.saveModelProfile({ id, providerId: profile.providerId, baseURL, model, displayName: model.slice(0, 80) })
        added++
      }
    } catch {
      // Provider responses and crypto errors may contain credentials; expose only a safe summary.
      errors.push(`${profile.displayName}：无法读取模型列表，请检查连接与 API 授权`)
    }
  }
  return { catalog: registry.publicCatalog(), added, errors }
}
module.exports = { discoverModels }
