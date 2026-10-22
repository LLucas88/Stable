'use strict'

const { randomUUID } = require('node:crypto')

const { reasoningOptions, cloudReasoningProfile } = require('./model-reasoning.cjs')

const { sortModelsByRelease } = require('./model-release-order.cjs')

const SECRET_PREFIX = 'model:'
const MODEL_DISPLAY_NAMES = { 'deepseek-flash': 'DeepSeek-V4.1-Flash-1017', 'deepseek-v4-pro': 'DeepSeek-V4-Pro', 'deepseek-v4-flash': 'DeepSeek-V4-Flash', 'glm-5.3-flash': 'GLM-5.3-Flash' }
function displayName(model, fallback) { return MODEL_DISPLAY_NAMES[String(model).toLowerCase()] || fallback }
function flashModel(items) { return items.find(item => ['deepseek-flash', 'deepseek-v4-flash'].includes(String(item.model || item.id).toLowerCase())) }

function requireModelText(value, label, limit) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label}不能为空。`)
  if (text.length > limit) throw new Error(`${label}不能超过 ${limit} 个字符。`)
  return text
}

function cleanProviderId(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!clean) throw new Error('服务 ID 只能包含字母、数字、连字符或下划线。')
  return clean
}

function normalizeBaseURL(value) {
  const input = requireModelText(value, 'API 地址', 500).replace(/\/+$/, '')
  let url
  try { url = new URL(input) } catch { throw new Error('API 地址不是有效 URL。') }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API 地址只支持 HTTP 或 HTTPS。')
  if (url.username || url.password || url.search || url.hash || (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API 地址必须使用 HTTPS（本机测试除外），且不能包含凭据、查询参数或片段。')
  return input
}

function modelSecretKey(id) { return `${SECRET_PREFIX}${id}:apiKey` }

function isDeepSeekModel(model = {}) {
  return [model.id, model.providerId, model.displayName, model.model, model.baseURL]
    .some((value) => String(value || '').toLowerCase().includes('deepseek'))
}

function isZhipuModel(model = {}) {
  return [model.id, model.providerId, model.displayName, model.model, model.baseURL]
    .some((value) => {
      const text = String(value || '').toLowerCase()
      return text.includes('glm') || text.includes('zhipu') || text.includes('bigmodel') || text.includes('智谱')
    })
}

class ModelRegistry {
  constructor(store, secrets, cloudGateway, chatgpt) {
    this.store = store
    this.secrets = secrets
    this.cloudGateway = cloudGateway
    this.chatgpt = chatgpt
  }

  cloudCatalog() {
    const state = this.cloudGateway?.account?.publicState()
    if (!this.cloudGateway) return null
    if (state?.status !== 'authenticated') return { items: [], defaultModelId: '' }
    const items = state.models.map((item) => ({
      ...cloudReasoningProfile(item), id: String(item.id), providerId: 'stable-cloud', displayName: displayName(item.id, String(item.display_name || item.id)),
      baseURL: this.cloudGateway.baseURL, model: String(item.id), hasApiKey: true,
      reasoningOptions: reasoningOptions({ ...cloudReasoningProfile(item), providerId: 'stable-cloud', baseURL: this.cloudGateway.baseURL, model: String(item.id) }),
    }))
    if ((this.store?.getSetting('flash1017DefaultV1') || this.store?.getSetting('flashHighDefaultV1')) && !items.some(item => item.id === 'deepseek-flash')) {
      items.push({ id: 'deepseek-flash', providerId: 'stable-cloud', displayName: MODEL_DISPLAY_NAMES['deepseek-flash'], model: 'deepseek-flash', baseURL: this.cloudGateway.baseURL, hasApiKey: false, cloudReasoning: true,
        reasoningOptions: reasoningOptions({ cloudReasoning: true, providerId: 'stable-cloud', baseURL: this.cloudGateway.baseURL, model: 'deepseek-flash' }) })
    }
    return { items: sortModelsByRelease(items), defaultModelId: items.find(item => item.id === 'deepseek-flash')?.id || flashModel(items)?.id || items[0]?.id || '' }
  }

  async discover(fetchImpl) {
    if (!this.discovery) this.discovery = require('./model-discovery.cjs').discoverModels(this, fetchImpl).finally(() => { this.discovery = null })
    return this.discovery
  }

  migrateDeepSeekModels() {
    const catalog = this.store.modelCatalog()
    for (const item of catalog.items) {
      let host
      try { host = new URL(item.baseURL).hostname } catch { continue }
      if (host !== 'api.deepseek.com') continue
      if (['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-flash'].includes(item.model)) {
        const flash = { ...item, model: 'deepseek-flash', displayName: MODEL_DISPLAY_NAMES['deepseek-flash'] }
        this.store.saveModelProfile(flash)
      }
    }
  }

  migrateLegacySecret() {
    const catalog = this.store.modelCatalog()
    const legacyId = catalog.legacyModelId
    if (!legacyId || this.secrets.has(modelSecretKey(legacyId)) || !this.secrets.has('apiKey')) return false
    this.secrets.set(modelSecretKey(legacyId), this.secrets.get('apiKey'))
    return true
  }

  migrateFlash1017Default() {
    if (this.store.getSetting('flash1017DefaultV1')) return false
    const catalog = this.store.modelCatalog()
    const candidates = catalog.items.filter(item => item.model === 'deepseek-flash' && /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/.test(item.baseURL))
    const hasKey = item => this.secrets.has(modelSecretKey(item.id)) || (item.id === catalog.legacyModelId && this.secrets.has('apiKey'))
    const profile = candidates.find(item => item.id === catalog.defaultModelId && hasKey(item)) || candidates.find(hasKey) || candidates[0]
      || { id: randomUUID(), providerId: 'deepseek', displayName: MODEL_DISPLAY_NAMES['deepseek-flash'], model: 'deepseek-flash', baseURL: 'https://api.deepseek.com' }
    if (!candidates.includes(profile) && catalog.items.some(item => item.providerId === profile.providerId && item.model === profile.model)) profile.providerId = 'deepseek-official-' + profile.id
    this.store.db.exec('BEGIN IMMEDIATE')
    try {
      // Change future defaults once; existing conversations and credentials stay intact.
      this.store.setSetting('flash1017DefaultBackupV1', { catalog, defaultReasoning: this.store.getSetting('defaultReasoning') ?? null })
      this.store.setSetting('modelCatalog', { ...catalog, items: candidates.includes(profile) ? catalog.items : [...catalog.items, profile], defaultModelId: profile.id })
      this.store.setSetting('defaultReasoning', 'high')
      this.store.setSetting('flash1017DefaultV1', { modelId: profile.id })
      this.store.db.exec('COMMIT')
      return true
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
  }

  publicCatalog() {
    const cloud = this.cloudCatalog()
    if (cloud) return { ...cloud, items: [...cloud.items, ...(this.chatgpt?.catalog() || [])] }
    const catalog = this.store.modelCatalog()
    const items = catalog.items
    return {
      items: sortModelsByRelease(items).map((item) => ({ ...item, displayName: displayName(item.model, item.displayName), reasoningOptions: reasoningOptions(item), hasApiKey: this.secrets.has(modelSecretKey(item.id)) || (item.id === catalog.legacyModelId && this.secrets.has('apiKey')) })).concat(this.chatgpt?.catalog() || []),
      defaultModelId: items.some(item => item.id === catalog.defaultModelId) ? catalog.defaultModelId : flashModel(items)?.id || items[0]?.id || '',
    }
  }

  resolve(modelId) {
    if (String(modelId).startsWith('chatgpt:')) {
      const model = this.chatgpt?.catalog().find(item => item.id === modelId)
      if (!model || !model.hasApiKey) throw new Error('ChatGPT 未登录或授权已失效，请在设置 → 模型连接中重新登录。')
      return { model: { ...model }, apiKey: 'chatgpt-subscription' }
    }
    if (this.cloudGateway && this.cloudGateway.account.publicState().status !== 'authenticated') {
      throw new Error('请先在设置 → 账号中登录或重新连接 Stable Cloud，再发送模型任务。')
    }
    const cloud = this.cloudCatalog()
    if (cloud) {
      if (!cloud.items.length) throw new Error('Stable Cloud 尚未配置可用模型，请联系管理员。')
      const id = cloud.items.some((item) => item.id === modelId) ? modelId : cloud.defaultModelId
      if (cloud.items.find(item => item.id === id)?.hasApiKey === false) throw new Error('Stable Cloud 尚未提供 DeepSeek-Flash，请联系管理员或手动选择其他模型。')
      return this.cloudGateway.modelRoute(id)
    }
    const catalog = this.store.modelCatalog()
    let id = String(modelId || catalog.defaultModelId)
    const model = this.store.modelProfile(id)
    if (!model) throw new Error('所选模型已不存在，请重新选择模型。')
    if (model.providerId === 'chatgpt') throw new Error('请通过 ChatGPT 登录入口重新选择订阅模型。')
    const secretKey = modelSecretKey(id)
    const apiKey = this.secrets.get(secretKey) || (id === catalog.legacyModelId ? this.secrets.get('apiKey') : '')
    if (!apiKey) throw new Error(`模型“${model.displayName}”尚未配置 API Key。`)
    return { model: { ...model }, apiKey }
  }

  resolveImageApiKey(preferredModelId) {
    // Only reuse credentials saved for the official standard API. A GLM name
    // on a proxy or Coding Plan profile does not authorize sending its key here.
    const catalog = this.store.modelCatalog()
    const candidates = catalog.items.filter(item => /^https:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/?$/.test(item.baseURL))
    const preferred = candidates.find(item => item.id === preferredModelId) || candidates.find(item => item.id === catalog.defaultModelId)
    for (const item of [...(preferred ? [preferred] : []), ...candidates.filter(item => item !== preferred)]) {
      const key = this.secrets.get(modelSecretKey(item.id)) || (item.id === catalog.legacyModelId ? this.secrets.get('apiKey') : '')
      if (key) return key
    }
    throw Error('请在设置 → 模型连接中配置智谱标准 API Key，再生成图片（Coding Plan 或代理凭据不能替代）。')
  }

  save(input = {}) {
    if (cleanProviderId(input.providerId) === 'chatgpt' || String(input.id).startsWith('chatgpt:')) throw new Error('请使用 ChatGPT 登录入口管理订阅连接。')
    if (this.cloudCatalog()) throw new Error('云端模型由管理员统一维护，桌面端不能修改。')
    const existing = input.id ? this.store.modelProfile(String(input.id)) : undefined
    const requestedId = String(input.id || '').trim()
    const id = existing?.id || (/^[a-zA-Z0-9_-]{1,160}$/.test(requestedId) ? requestedId : randomUUID())
    const model = {
      id,
      providerId: cleanProviderId(input.providerId),
      displayName: requireModelText(input.displayName, '显示名称', 80),
      baseURL: normalizeBaseURL(input.baseURL),
      model: requireModelText(input.model, '模型名称', 160),
    }
    const apiKey = String(input.apiKey || '').trim()
    if (existing && existing.baseURL !== model.baseURL && !apiKey) throw new Error('更改 API 地址时需要重新填写 API Key。')
    const key = modelSecretKey(model.id)
    const catalog = this.store.modelCatalog()
    if (catalog.items.some((item) => item.id !== model.id && item.providerId === model.providerId && item.model === model.model)) throw new Error('这个服务中已经存在同名模型。')
    const hasSavedKey = this.secrets.has(key) || (model.id === catalog.legacyModelId && this.secrets.has('apiKey'))
    if (!apiKey && !hasSavedKey) throw new Error('API Key 不能为空。')
    if (apiKey) this.secrets.set(key, apiKey)
    this.store.saveModelProfile(model)
    if (apiKey && model.id === catalog.legacyModelId) this.secrets.set('apiKey', apiKey)
    return this.publicCatalog()
  }

  remove(id) {
    if (this.cloudCatalog()) throw new Error('云端模型由管理员统一维护，桌面端不能删除。')
    const modelId = String(id || '')
    const catalog = this.store.modelCatalog()
    this.store.removeModelProfile(modelId)
    this.secrets.remove(modelSecretKey(modelId))
    if (modelId === catalog.legacyModelId) this.secrets.remove('apiKey')
    return this.publicCatalog()
  }

  setDefault(id) {
    if (this.cloudCatalog()) throw new Error('云端模式下请在对话输入区选择模型。')
    this.store.setDefaultModel(String(id || ''))
    return this.publicCatalog()
  }
}

module.exports = { ModelRegistry, cleanProviderId, isDeepSeekModel, isZhipuModel, modelSecretKey, normalizeBaseURL }
