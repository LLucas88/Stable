const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { MODEL_PRESETS, modelConnectionChoices } = require('../src/model-presets.ts')
const { StableStore } = require('../desktop/services/store.cjs')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
const { chatURL } = require('../desktop/services/model-provider.cjs')

test('fresh and existing installations offer both official providers without losing saved profiles', () => {
  const fresh = modelConnectionChoices([])
  assert.deepEqual(fresh.map(item => item.providerId), ['deepseek', 'zhipu'])
  assert.deepEqual(fresh.map(item => chatURL(item.baseURL)), [
    'https://api.deepseek.com/chat/completions',
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  ])
  assert.deepEqual(fresh.map(item => item.model), ['deepseek-flash', 'glm-5.3-flash'])
  assert.equal(fresh[0].displayName, 'DeepSeek-V4.1-Flash-1017')
  assert.ok(fresh.every(item => !item.hasApiKey))
  const saved = { ...fresh[1], id: 'existing-glm', baseURL: fresh[1].baseURL+'/', hasApiKey: true }
  const custom = { ...fresh[0], id: 'custom-model', providerId: 'custom', model: 'custom' }
  const before = JSON.stringify([saved, custom])
  const choices = modelConnectionChoices([saved, custom])
  assert.equal(choices.length, 3)
  assert.equal(choices[1], saved)
  assert.equal(choices[2], custom)
  assert.equal(JSON.stringify([saved, custom]), before)
})

test('preset profiles save, resolve separately and survive a store restart; explicit dark choice survives', () => {
  const root = fs.mkdtempSync(path.resolve(__dirname, '../.local/preset-check-'))
  let store = new StableStore(root)
  // Fixture secrets only; never inspect or use a real account key.
  const values = new Map(), secrets = { has: key => values.has(key), get: key => values.get(key), set: (key, value) => values.set(key, value) }
  try {
    assert.equal(store.getSetting('theme'), 'light')
    store.close(); store = new StableStore(root)
    assert.equal(store.getSetting('theme'), 'light')
    let registry = new ModelRegistry(store, secrets)
    for (const preset of modelConnectionChoices(registry.publicCatalog().items)) {
      registry.save({ ...preset, apiKey: 'fixture-'+preset.providerId })
      registry.setDefault(preset.id)
      assert.equal(registry.resolve(preset.id).apiKey, 'fixture-'+preset.providerId)
    }
    store.setSetting('theme', 'dark')
    store.close(); store = new StableStore(root)
    registry = new ModelRegistry(store, secrets)
    assert.equal(store.getSetting('theme'), 'dark')
    const choices = modelConnectionChoices(registry.publicCatalog().items)
    assert.equal(choices.length, MODEL_PRESETS.length)
    assert.ok(choices.every(item => item.hasApiKey))
    assert.equal(registry.resolve().model.model, 'glm-5.3-flash')
    for (const item of choices) assert.equal(registry.resolve(item.id).apiKey, 'fixture-'+item.providerId)
  } finally { store.close() }
})
