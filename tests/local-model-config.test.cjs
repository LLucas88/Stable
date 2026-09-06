'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { SecretStore } = require('../desktop/services/secrets.cjs')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
const { applyLocalModelConfig, CONFIG_FILE, STATUS_FILE } = require('../desktop/services/local-model-config.cjs')
const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
const profile = { id: 'zhipu-glm-5-3', providerId: 'zhipu', displayName: '智谱 GLM-5.3', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3' }
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-local-model-'))
  let store
  const open = () => {
    store = new StableStore(path.join(root, 'userdata'))
    return { appPath: root, userData: path.join(root, 'userdata'), isPackaged: false, cloudEnabled: false, safeStorage, registry: new ModelRegistry(store, new SecretStore(path.join(root, 'userdata'), safeStorage)) }
  }
  const options = open()
  fs.writeFileSync(path.join(root, CONFIG_FILE), JSON.stringify({ version: 1, profile, encryptedApiKey: Buffer.from('fixture-only-secret').toString('base64') }))
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, options, reopen: () => { store.close(); return open() } }
}
test('local config survives a real database reopen and keeps an explicit later model choice', t => {
  const context = setup(t)
  const first = applyLocalModelConfig(context.options)
  assert.equal(first.activeModelId, profile.id)
  assert.equal(first.defaultModelId, profile.id)
  assert.equal(context.options.registry.resolve(profile.id).apiKey, 'fixture-only-secret')
  const options = context.reopen()
  options.registry.setDefault('legacy-default-model')
  options.registry.store.updateConversationModel(options.registry.store.activeConversationId(), 'legacy-default-model', ['legacy-default-model', profile.id])
  const second = applyLocalModelConfig(options)
  assert.equal(second.firstImport, false)
  assert.equal(second.defaultModelId, 'legacy-default-model')
  assert.equal(second.activeModelId, 'legacy-default-model')
  assert.equal(options.registry.resolve(profile.id).apiKey, 'fixture-only-secret')
  assert.equal(fs.readFileSync(path.join(context.root, STATUS_FILE), 'utf8').includes('fixture-only-secret'), false)
})
test('local config restores its model if the database catalog loses it', t => {
  const { options } = setup(t)
  applyLocalModelConfig(options)
  const catalog = options.registry.store.modelCatalog()
  options.registry.store.setSetting('modelCatalog', { ...catalog, items: catalog.items.filter(item => item.id !== profile.id), defaultModelId: 'legacy-default-model' })
  const result = applyLocalModelConfig(options)
  assert.equal(result.firstImport, true)
  assert.equal(result.defaultModelId, profile.id)
})
test('packaged and cloud launches ignore local credentials', t => {
  const { options } = setup(t)
  assert.equal(applyLocalModelConfig({ ...options, isPackaged: true }), null)
  assert.equal(applyLocalModelConfig({ ...options, cloudEnabled: true }), null)
  assert.equal(options.registry.store.modelProfile(profile.id), undefined)
})
test('unreadable encrypted key does not block startup, change the catalog, or leak the error', t => {
  const { options } = setup(t)
  const result = applyLocalModelConfig({ ...options, safeStorage: { ...safeStorage, decryptString: () => { throw new Error('fixture-only-secret') } } })
  assert.equal(result.status, 'error')
  assert.ok(!JSON.stringify(result).includes('fixture-only-secret'))
  assert.equal(JSON.parse(fs.readFileSync(path.join(options.appPath, STATUS_FILE), 'utf8')).status, 'error')
  assert.equal(options.registry.store.modelProfile(profile.id), undefined)
})


test('version 2 uses user protection while importing into the current Electron secret store', t => {
  const { options, root } = setup(t)
  fs.writeFileSync(path.join(root, CONFIG_FILE), JSON.stringify({ version: 2, protection: 'windows-dpapi-current-user', profile, encryptedApiKey: 'Zml4dHVyZQ==' }))
  let calls = 0
  const result = applyLocalModelConfig({ ...options, userProtection: { decryptString: () => { calls++; return 'fixture-only-secret' } }, safeStorage: { ...safeStorage, decryptString: () => { throw new Error('old profile key') } } })
  assert.equal(calls, 1)
  assert.equal(result.status, 'loaded')
  assert.equal(options.registry.resolve(profile.id).apiKey, 'fixture-only-secret')
})

test('malformed config preserves an existing model and key and permits the next startup', t => {
  const { options, root } = setup(t)
  applyLocalModelConfig(options)
  fs.writeFileSync(path.join(root, CONFIG_FILE), '{invalid')
  assert.equal(applyLocalModelConfig(options).status, 'error')
  assert.equal(options.registry.resolve(profile.id).apiKey, 'fixture-only-secret')
  assert.equal(options.registry.store.modelCatalog().defaultModelId, profile.id)
})

test('failure writing diagnostic status cannot turn a successful import into a failed launch', t => {
  const { options, root } = setup(t)
  fs.mkdirSync(path.join(root, STATUS_FILE))
  const result = applyLocalModelConfig(options)
  assert.equal(result.status, 'loaded')
  assert.equal(result.statusWriteFailed, true)
  assert.equal(options.registry.resolve(profile.id).apiKey, 'fixture-only-secret')
})

test('plaintext credentials and unknown protection versions are rejected without catalog changes', t => {
  const { options, root } = setup(t)
  for (const extra of [{ apiKey: 'fixture-only-secret' }, { version: 3 }, { version: 2, protection: 'unknown' }]) {
    fs.writeFileSync(path.join(root, CONFIG_FILE), JSON.stringify({ version: 1, profile, encryptedApiKey: 'Zml4dHVyZQ==', ...extra }))
    assert.equal(applyLocalModelConfig(options).status, 'error')
    assert.equal(options.registry.store.modelProfile(profile.id), undefined)
  }
})
