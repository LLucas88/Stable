'use strict'
const { app, BrowserWindow, safeStorage } = require('electron')
const path = require('node:path')
const { StableStore } = require('../../desktop/services/store.cjs')
const { SecretStore } = require('../../desktop/services/secrets.cjs')
const { ModelRegistry } = require('../../desktop/services/model-registry.cjs')
const { applyLocalModelConfig } = require('../../desktop/services/local-model-config.cjs')
const root = path.resolve(process.argv[2])
const userData = path.join(root, process.argv[3] || 'profile-a')
app.setPath('userData', userData)
app.disableHardwareAcceleration()
let store
app.whenReady().then(() => {
  store = new StableStore(userData)
  const registry = new ModelRegistry(store, new SecretStore(userData, safeStorage))
  const result = applyLocalModelConfig({ appPath: root, userData, isPackaged: false, cloudEnabled: false, registry, safeStorage })
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  const status = { status: result.status, windowCreated: !window.isDestroyed() }
  if (result.status === 'loaded') {
    const resolved = registry.resolve('zhipu-glm-5-3')
    status.model = resolved.model.model
    status.hasApiKey = Boolean(resolved.apiKey)
    status.defaultModelId = registry.store.modelCatalog().defaultModelId
  }
  console.log('LOCAL_MODEL_STARTUP_RESULT ' + JSON.stringify(status))
  window.destroy(); store.close(); store = null; app.exit(0)
}).catch(() => { console.error('LOCAL_MODEL_STARTUP_FAILED'); store?.close(); app.exit(1) })