'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { ModelRegistry, modelSecretKey } = require('../desktop/services/model-registry.cjs')
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
