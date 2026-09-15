'use strict'

const { randomUUID } = require('node:crypto')

const { reasoningOptions, cloudReasoningProfile } = require('./model-reasoning.cjs')

const SECRET_PREFIX = 'model:'
const MODEL_DISPLAY_NAMES = { 'deepseek-flash': 'DeepSeek-Flash', 'deepseek-v4-pro': 'DeepSeek-V4-Pro', 'deepseek-v4-flash': 'DeepSeek-V4-Flash', 'glm-5.3-flash': 'GLM-5.3-Flash' }
function displayName(model, fallback) { return MODEL_DISPLAY_NAMES[String(model).toLowerCase()] || fallback }
function retiredModel(item) { return String(item.model || item.id || '').toLowerCase() === 'deepseek-v4-pro' }
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
  constructor(store, secrets, cloudGateway) {
    this.store = store
    this.secrets = secrets
    this.cloudGateway = cloudGateway
  }

  cloudCatalog() {
    const state = this.cloudGateway?.account?.publicState()
    if (state?.status !== 'authenticated') return null
    const items = state.models.filter(item => !retiredModel(item)).map((item) => ({
      ...cloudReasoningProfile(item), id: String(item.id), providerId: 'stable-cloud', displayName: displayName(item.id, String(item.display_name || item.id)),
      baseURL: this.cloudGateway.baseURL, model: String(item.id), hasApiKey: true,
      reasoningOptions: reasoningOptions({ ...cloudReasoningProfile(item), providerId: 'stable-cloud', baseURL: this.cloudGateway.baseURL, model: String(item.id) }),
    }))
    return { items, defaultModelId: flashModel(items)?.id || items[0]?.id || '' }
  }

  migrateDeepSeekModels() {
    const catalog = this.store.modelCatalog()
    for (const item of catalog.items) {
      let host
      try { host = new URL(item.baseURL).hostname } catch { continue }
      if (host !== 'api.deepseek.com') continue
      if (['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-flash'].includes(item.model)) {
        const flash = { ...item, model: 'deepseek-flash', displayName: 'DeepSeek-Flash' }
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

  publicCatalog() {
    const cloud = this.cloudCatalog()
    if (cloud) return cloud
    const catalog = this.store.modelCatalog()
    const items = catalog.items.filter(item => !retiredModel(item))
    return {
      items: items.map((item) => ({ ...item, displayName: displayName(item.model, item.displayName), reasoningOptions: reasoningOptions(item), hasApiKey: this.secrets.has(modelSecretKey(item.id)) || (item.id === catalog.legacyModelId && this.secrets.has('apiKey')) })),
      defaultModelId: items.some(item => item.id === catalog.defaultModelId) ? catalog.defaultModelId : flashModel(items)?.id || items[0]?.id || '',
    }
  }

  resolve(modelId) {
    const cloud = this.cloudCatalog()
    if (cloud) {
      if (!cloud.items.length) throw new Error('Stable Cloud 尚未配置可用模型，请联系管理员。')
      const id = cloud.items.some((item) => item.id === modelId) ? modelId : cloud.defaultModelId
      return this.cloudGateway.modelRoute(id)
    }
    const catalog = this.store.modelCatalog()
    let id = String(modelId || catalog.defaultModelId)
    if (retiredModel(this.store.modelProfile(id) || { id })) {
      const flash = flashModel(catalog.items)
      if (!flash) throw new Error('DeepSeek-V4-Pro 已下架，请重新选择可用模型。')
      id = flash.id
    }
    const model = this.store.modelProfile(id)
    if (!model) throw new Error('所选模型已不存在，请重新选择模型。')
    const secretKey = modelSecretKey(id)
    const apiKey = this.secrets.get(secretKey) || (id === catalog.legacyModelId ? this.secrets.get('apiKey') : '')
    if (!apiKey) throw new Error(`模型“${model.displayName}”尚未配置 API Key。`)
    return { model: { ...model }, apiKey }
  }

  save(input = {}) {
    if (retiredModel(input)) throw new Error('DeepSeek-V4-Pro 已下架，请选择 DeepSeek-Flash。')
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
    if (retiredModel(this.store.modelProfile(String(id || '')) || { id })) throw new Error('DeepSeek-V4-Pro 已下架，请选择 DeepSeek-Flash。')
    if (this.cloudCatalog()) throw new Error('云端模式下请在对话输入区选择模型。')
    this.store.setDefaultModel(String(id || ''))
    return this.publicCatalog()
  }
}

module.exports = { ModelRegistry, cleanProviderId, isDeepSeekModel, isZhipuModel, modelSecretKey, normalizeBaseURL }
