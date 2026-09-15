'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { ModelRegistry, isDeepSeekModel, isZhipuModel, modelSecretKey } = require('../desktop/services/model-registry.cjs')
const { SecretStore } = require('../desktop/services/secrets.cjs')
const { StableStore, LEGACY_MODEL_PROFILE_ID } = require('../desktop/services/store.cjs')

function safeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, ''),
  }
}

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-models-'))
  const store = new StableStore(root)
  const secrets = new SecretStore(root, safeStorage())
  const registry = new ModelRegistry(store, secrets)
  return { root, store, secrets, registry }
}

test('model family detection recognizes provider, model name, display name, and official endpoint', () => {
  assert.equal(isDeepSeekModel({ providerId: 'stable-cloud', model: 'deepseek-v4-flash' }), true)
  assert.equal(isDeepSeekModel({ providerId: 'custom', baseURL: 'https://api.deepseek.com/v1' }), true)
  assert.equal(isZhipuModel({ providerId: 'zhipu' }), true)
  assert.equal(isZhipuModel({ providerId: 'stable-cloud', model: 'glm-5.3-flash' }), true)
  assert.equal(isZhipuModel({ providerId: 'custom', baseURL: 'https://open.bigmodel.cn/api/paas/v4' }), true)
  assert.equal(isZhipuModel({ displayName: '智谱开放平台' }), true)
  assert.equal(isZhipuModel({ providerId: 'openai', model: 'gpt-5' }), false)
})

test('legacy encrypted API key migrates without entering model metadata', () => {
  const context = setup()
  try {
    context.secrets.set('apiKey', 'legacy-secret')
    assert.equal(context.registry.migrateLegacySecret(), true)
    assert.equal(context.registry.migrateLegacySecret(), false)
    assert.equal(context.secrets.get('apiKey'), 'legacy-secret')
    assert.equal(context.secrets.get(modelSecretKey(LEGACY_MODEL_PROFILE_ID)), 'legacy-secret')

    const catalog = context.registry.publicCatalog()
    assert.equal(catalog.items[0].hasApiKey, true)
    assert.equal(JSON.stringify(catalog).includes('legacy-secret'), false)
    assert.equal(readFileSync(path.join(context.root, 'stable.db')).includes('legacy-secret'), false)
  } finally {
    context.store.close()
    rmSync(context.root, { recursive: true, force: true })
  }
})

test('profiles keep separate credentials and execution routes are immutable snapshots', () => {
  const context = setup()
  try {
    context.secrets.set('apiKey', 'deepseek-key')
    context.registry.migrateLegacySecret()
    let catalog = context.registry.save({
      id: 'renderer-created-profile', providerId: 'openai', displayName: 'GPT 5', baseURL: 'https://api.openai.com/v1/', model: 'gpt-5', apiKey: 'openai-key',
    })
    const openai = catalog.items.find((item) => item.providerId === 'openai')
    assert.ok(openai)
    assert.equal(openai.id, 'renderer-created-profile')
    assert.equal(openai.baseURL, 'https://api.openai.com/v1')
    assert.equal(openai.hasApiKey, true)

    const oldRoute = context.registry.resolve(openai.id)
    assert.equal(oldRoute.apiKey, 'openai-key')
    assert.equal(oldRoute.model.model, 'gpt-5')
    assert.equal(context.registry.resolve(LEGACY_MODEL_PROFILE_ID).apiKey, 'deepseek-key')

    catalog = context.registry.save({ ...openai, displayName: 'GPT 5.1', model: 'gpt-5.1', apiKey: 'new-openai-key' })
    const newRoute = context.registry.resolve(openai.id)
    assert.equal(newRoute.apiKey, 'new-openai-key')
    assert.equal(newRoute.model.model, 'gpt-5.1')
    assert.equal(oldRoute.apiKey, 'openai-key')
    assert.equal(oldRoute.model.model, 'gpt-5')
    assert.equal(context.registry.resolve(LEGACY_MODEL_PROFILE_ID).apiKey, 'deepseek-key')
    assert.equal(catalog.items.some((item) => Object.hasOwn(item, 'apiKey')), false)
  } finally {
    context.store.close()
    rmSync(context.root, { recursive: true, force: true })
  }
})

test('profile validation and deletion preserve deterministic routing', () => {
  const context = setup()
  try {
    assert.throws(() => context.registry.save({ providerId: 'x', displayName: 'X', baseURL: 'file:///tmp/model', model: 'x', apiKey: 'x' }), /HTTP/)
    const added = context.registry.save({ providerId: 'local_gateway', displayName: 'Local', baseURL: 'http://127.0.0.1:11434/v1', model: 'local-model', apiKey: 'local-key' })
    const local = added.items.find((item) => item.providerId === 'local_gateway')
    const conversationId = context.store.createConversation({ modelId: local.id })
    assert.equal(context.store.conversation(conversationId).modelId, local.id)

    const afterRemoval = context.registry.remove(local.id)
    assert.equal(afterRemoval.items.some((item) => item.id === local.id), false)
    assert.equal(context.store.conversation(conversationId).modelId, LEGACY_MODEL_PROFILE_ID)
    assert.equal(context.secrets.has(modelSecretKey(local.id)), false)
    assert.throws(() => context.registry.remove(LEGACY_MODEL_PROFILE_ID), /默认模型不能删除/)
  } finally {
    context.store.close()
    rmSync(context.root, { recursive: true, force: true })
  }
})


test('DeepSeek migration preserves profile IDs, conversations and credentials without adding Pro', () => {
  const context=setup()
  try {
    const id=context.store.modelCatalog().defaultModelId
    const old=context.store.modelProfile(id)
    context.store.saveModelProfile({...old,model:'deepseek-v4-flash'})
    context.secrets.set(modelSecretKey(id),'test-key')
    context.registry.migrateDeepSeekModels()
    context.registry.migrateDeepSeekModels()
    const catalog=context.store.modelCatalog()
    assert.equal(catalog.items.length,1)
    assert.equal(catalog.defaultModelId,id)
    assert.equal(context.store.modelProfile(id).model,'deepseek-flash')
    assert.equal(context.store.conversation(context.store.activeConversationId()).modelId,id)
    assert.equal(catalog.items.some(x=>x.model==='deepseek-v4-pro'),false)
    assert.equal(context.registry.resolve(id).apiKey,'test-key')
  } finally {context.store.close();rmSync(context.root,{recursive:true,force:true})}
})

test('retired local Pro is hidden and old selections use Flash without deleting history or credentials', () => {
  const context = setup()
  try {
    const flash = context.store.modelProfile(LEGACY_MODEL_PROFILE_ID)
    context.store.saveModelProfile({ ...flash, model: 'deepseek-flash' })
    const pro = { ...flash, id: 'old-pro', model: 'deepseek-v4-pro' }
    context.store.saveModelProfile(pro)
    context.store.setDefaultModel(pro.id)
    const conversation = context.store.createConversation({ modelId: pro.id })
    context.secrets.set(modelSecretKey(flash.id), 'flash-key')
    context.secrets.set(modelSecretKey(pro.id), 'pro-key')
    assert.equal(context.registry.publicCatalog().items.some(item => item.id === pro.id), false)
    assert.equal(context.registry.publicCatalog().defaultModelId, flash.id)
    assert.equal(context.registry.resolve(pro.id).model.model, 'deepseek-flash')
    assert.equal(context.registry.resolve(pro.id).apiKey, 'flash-key')
    assert.equal(context.store.conversation(conversation).modelId, pro.id)
    assert.equal(context.secrets.get(modelSecretKey(pro.id)), 'pro-key')
    assert.throws(() => context.registry.save(pro), /已下架/)
    assert.throws(() => context.registry.setDefault(pro.id), /已下架/)
    context.store.saveModelProfile({ ...flash, model: 'another-model' })
    assert.throws(() => context.registry.resolve(pro.id), /已下架/)
  } finally { context.store.close(); rmSync(context.root, { recursive: true, force: true }) }
})

test('stale cloud Pro selections fall back to Flash and cannot appear in the catalog', () => {
  const registry = new ModelRegistry(null, null, {
    baseURL: 'http://localhost',
    account: { publicState: () => ({ status: 'authenticated', models: [{ id: 'deepseek-v4-pro' }, { id: 'glm-5.3-flash' }, { id: 'deepseek-flash' }] }) },
    modelRoute: id => ({ id }),
  })
  assert.deepEqual(registry.publicCatalog().items.map(item => item.id), ['glm-5.3-flash', 'deepseek-flash'])
  assert.equal(registry.resolve('deepseek-v4-pro').id, 'deepseek-flash')
  assert.equal(registry.resolve('glm-5.3-flash').id, 'glm-5.3-flash')
})
