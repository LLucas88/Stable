'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { windowsUserProtection } = require('./windows-user-protection.cjs')
const PENDING = 'model-setup.pending.json'
const STATUS = 'model-setup.status.json'

function applyPortableModelSetup({ userData, registry, cloudEnabled, userProtection = windowsUserProtection }) {
  const file = path.join(userData, PENDING)
  if (!fs.existsSync(file)) return null
  let result
  try {
    if (cloudEnabled) throw Error('请取消 STABLE_CLOUD_ENABLED 环境变量，重启 Stable 后重试。')
    if (fs.statSync(file).size > 128 * 1024) throw Error('配置文件过大。')
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (envelope.version !== 1 || envelope.protection !== 'windows-dpapi-current-user' || typeof envelope.data !== 'string') throw Error('格式无效。')
    const input = JSON.parse(userProtection.decryptString(Buffer.from(envelope.data, 'base64')))
    if (input.version !== 1 || !input.profile || typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.length > 4096) throw Error('格式无效。')
    const { providerId, displayName, baseURL, model } = input.profile
    const url = new URL(baseURL)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('地址无效。')
    const existing = registry.publicCatalog().items.find(item => item.providerId === providerId && item.model === model)
    const id = existing?.id || randomUUID()
    registry.save({ id, providerId, displayName, baseURL, model, apiKey: input.apiKey })
    registry.setDefault(id)
    const active = registry.store.activeConversationId()
    if (active) registry.store.updateConversationModel(active, id, registry.store.modelCatalog().items.map(item => item.id))
    result = { status: 'loaded', modelId: id, modelName: displayName, loadedAt: new Date().toISOString() }
    // Delete the single-use inbox only after credentials and model selection were saved.
    fs.unlinkSync(file)
  } catch {
    result = { status: 'error', detail: cloudEnabled ? '请取消 STABLE_CLOUD_ENABLED 环境变量后重启。' : '自动配置未完成，请重新运行配置包；已有聊天记录未删除。' }
  }
  try { fs.writeFileSync(path.join(userData, STATUS), JSON.stringify(result), 'utf8') } catch {}
  return result
}
module.exports = { applyPortableModelSetup, PENDING, STATUS }
