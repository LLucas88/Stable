'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { windowsUserProtection } = require('./windows-user-protection.cjs')

const CONFIG_FILE = '.stable-local-model.json'
const STATUS_FILE = '.stable-local-model-status.json'
const IMPORT_SETTING = 'localModelConfigFingerprint'

function applyLocalModelConfig(options) {
  try { return importLocalModelConfig(options) } catch {
    // Optional developer configuration must not prevent the application opening.
    // Do not expose raw crypto, provider, filesystem errors, or configuration data.
    const result = {
      status: 'error', loadedAt: new Date().toISOString(), pid: process.pid,
      appPath: options.appPath, userData: options.userData,
      detail: '本地模型配置未加载，应用将继续启动；请在设置中检查模型和 API Key。',
    }
    writeStatus(options.appPath, result)
    console.warn(result.detail)
    return result
  }
}

function writeStatus(appPath, result) {
  try { fs.writeFileSync(path.join(appPath, STATUS_FILE), JSON.stringify(result, null, 2), 'utf8') }
  catch { result.statusWriteFailed = true }
}

function importLocalModelConfig({ appPath, userData, isPackaged, cloudEnabled, registry, safeStorage, userProtection = windowsUserProtection }) {
  // Local credentials must never change packaged or cloud-account model routing.
  if (isPackaged || cloudEnabled) return null
  const file = path.join(appPath, CONFIG_FILE)
  if (!fs.existsSync(file)) return null
  let config
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {
    throw new Error('本地模型配置无法读取，请检查 .stable-local-model.json。')
  }
  if (![1, 2].includes(config.version) || (config.version === 2 && config.protection !== 'windows-dpapi-current-user') || !config.profile || typeof config.encryptedApiKey !== 'string' || !config.encryptedApiKey || Object.hasOwn(config, 'apiKey') || Object.hasOwn(config.profile, 'apiKey')) {
    throw new Error('本地模型配置格式无效；密钥必须使用 Windows 安全存储加密。')
  }
  const profile = config.profile
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(profile.id || '')) throw new Error('本地模型配置需要有效的模型 ID。')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储不可用，本地模型配置未加载。')
  let apiKey
  try { apiKey = (config.version === 2 ? userProtection : safeStorage).decryptString(Buffer.from(config.encryptedApiKey, 'base64')) } catch {
    throw new Error('本地模型密钥无法解密；加密配置可能不匹配或已损坏。')
  }
  if (!apiKey.trim()) throw new Error('本地模型密钥为空。')
  const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex')
  const existing = registry.store.modelProfile(profile.id)
  const firstImport = registry.store.getSetting(IMPORT_SETTING) !== fingerprint || !existing
  registry.save({ ...profile, apiKey })
  if (firstImport) {
    registry.setDefault(profile.id)
    const activeId = registry.store.activeConversationId()
    if (activeId) registry.store.updateConversationModel(activeId, profile.id, registry.store.modelCatalog().items.map(item => item.id))
    registry.store.setSetting(IMPORT_SETTING, fingerprint)
  }
  const result = {
    status: 'loaded', loadedAt: new Date().toISOString(), pid: process.pid, appPath, userData,
    configuredModel: profile.model, configuredModelId: profile.id,
    defaultModelId: registry.store.modelCatalog().defaultModelId,
    activeModelId: registry.store.conversation(registry.store.activeConversationId())?.modelId,
    firstImport, hasApiKey: Boolean(registry.resolve(profile.id).apiKey),
  }
  writeStatus(appPath, result)
  return result
}

module.exports = { applyLocalModelConfig, CONFIG_FILE, STATUS_FILE }
