'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { ModelRegistry, modelSecretKey } = require('../desktop/services/model-registry.cjs')
const { reasoningParameters } = require('../desktop/services/model-reasoning.cjs')
function setup(t) {
  const parent = path.resolve(__dirname, '../.local/default-model-tests'); fs.mkdirSync(parent, { recursive: true })
  const root = fs.mkdtempSync(path.join(parent, 'case-')), store = new StableStore(root), keys = new Map()
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  const secrets = { has: key => keys.has(key), get: key => keys.get(key), set: (key, value) => keys.set(key, value) }
  return { root, store, keys, secrets, registry: new ModelRegistry(store, secrets) }
}
for (const previouslyMigrated of [false, true]) test(`1017 upgrade changes only future defaults, previous migration=${previouslyMigrated}`, t => {
  const { store, registry, secrets, root } = setup(t), first = store.activeConversationId()
  registry.save({ id: 'glm', providerId: 'glm', displayName: 'GLM', model: 'glm-5.3-flash', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'glm-fixture' })
  store.setDefaultModel('glm'); store.setSetting('defaultReasoning', 'low')
  store.updateConversationModel(first, 'glm'); store.updateConversationContext(first, 'max', [])
  store.updateConversationPermission(first, 'request'); store.addMessage(first, 'user', 'Keep history')
  const flash = store.modelCatalog().items.find(i => i.model === 'deepseek-flash')
  const second = store.createConversation({ modelId: flash.id })
  store.updateConversationContext(second, 'none', [])
  secrets.set(modelSecretKey(flash.id), 'flash-fixture')
  if (previouslyMigrated) store.setSetting('flashHighDefaultV1', { modelId: flash.id })
  const before = store.db.prepare('SELECT * FROM conversations ORDER BY id').all()
  const messages = store.listMessages(first), active = store.activeConversationId()
  const keys = [...secretsKeys(secrets, [flash.id, 'glm'])]
  registry.migrateDeepSeekModels()
  assert.equal(registry.migrateFlash1017Default(), true)
  assert.deepEqual(store.db.prepare('SELECT * FROM conversations ORDER BY id').all(), before)
  assert.deepEqual(store.listMessages(first), messages)
  assert.equal(store.activeConversationId(), active)
  assert.deepEqual(secretsKeys(secrets, [flash.id, 'glm']), keys)
  assert.equal(Boolean(store.getSetting('flashHighDefaultV1')), previouslyMigrated)
  assert.equal(store.getSetting('flash1017DefaultBackupV1').defaultReasoning, 'low')
  const c = store.conversation(store.createConversation())
  assert.equal(c.modelId, flash.id); assert.equal(c.capability, 'high')
  const route = registry.resolve(c.modelId)
  assert.equal(route.model.model, 'deepseek-flash')
  assert.equal(route.apiKey, 'flash-fixture')
  assert.equal(registry.publicCatalog().items.find(i => i.id === flash.id).displayName, 'DeepSeek-V4.1-Flash-1017')
  assert.deepEqual(reasoningParameters(route.model, c.capability), { thinking: { type: 'enabled' }, reasoning_effort: 'high' })
  store.updateConversationContext(c.id, 'low', []); store.setDefaultModel('glm'); store.setSetting('defaultReasoning', 'max')
  assert.equal(registry.migrateFlash1017Default(), false)
  const reopened = new StableStore(root)
  try {
    const next = new ModelRegistry(reopened, secrets); assert.equal(next.migrateFlash1017Default(), false)
    assert.equal(reopened.conversation(first).modelId, 'glm'); assert.equal(reopened.conversation(first).capability, 'max')
    assert.equal(reopened.conversation(second).modelId, flash.id); assert.equal(reopened.conversation(second).capability, 'none')
    assert.equal(reopened.conversation(c.id).capability, 'low')
    const later = reopened.conversation(reopened.createConversation())
    assert.equal(later.modelId, 'glm'); assert.equal(later.capability, 'max')
  } finally { reopened.close() }
})
function secretsKeys(secrets, ids) { return ids.map(id => secrets.get(modelSecretKey(id))) }

test('fresh installation starts with Flash/high, including its initial blank conversation', t => {
  const { store, registry } = setup(t)
  registry.migrateFlash1017Default()
  for (const id of [store.activeConversationId(), store.createConversation()]) {
    const c = store.conversation(id)
    assert.equal(c.capability, 'high')
    assert.equal(store.modelProfile(c.modelId).model, 'deepseek-flash')
  }
})

test('a new conversation sends the official Flash alias and high effort through the SDK bridge', async t => {
  const { ClaudeMessagesBridge } = require('../desktop/services/claude-messages-bridge.cjs')
  const { store, registry, secrets } = setup(t)
  registry.migrateFlash1017Default()
  const conversation = store.conversation(store.createConversation())
  secrets.set(modelSecretKey(conversation.modelId), 'bridge-fixture')
  const route = registry.resolve(conversation.modelId)
  let outgoing
  const bridge = new ClaudeMessagesBridge({ ...route, model: { ...route.model, reasoningSelection: conversation.capability }, fetchImpl: async (url, init) => {
    outgoing = { url, body: JSON.parse(init.body) }
    return new Response('data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  } })
  await bridge.start()
  try {
    const response = await fetch(`${bridge.baseURL}/v1/messages`, { method: 'POST', headers: { 'x-api-key': bridge.token, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-compatibility-name', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'fixture' }] }) })
    assert.equal(response.status, 200)
    await response.text()
    assert.equal(outgoing.url, 'https://api.deepseek.com/chat/completions')
    assert.equal(outgoing.body.model, 'deepseek-flash')
    assert.deepEqual(outgoing.body.thinking, { type: 'enabled' })
    assert.equal(outgoing.body.reasoning_effort, 'high')
  } finally { await bridge.close() }
})

test('failed default migration rolls back and can retry without altering conversations', t => {
  const { store, registry } = setup(t)
  store.setSetting('defaultReasoning', 'low')
  const before = store.db.prepare('SELECT * FROM settings ORDER BY key').all()
  const conversations = store.db.prepare('SELECT * FROM conversations').all()
  const setSetting = store.setSetting.bind(store)
  store.setSetting = (key, value) => { if (key === 'flash1017DefaultV1') throw Error('fixture write failure'); setSetting(key, value) }
  assert.throws(() => registry.migrateFlash1017Default(), /fixture write failure/)
  assert.deepEqual(store.db.prepare('SELECT * FROM settings ORDER BY key').all(), before)
  assert.deepEqual(store.db.prepare('SELECT * FROM conversations').all(), conversations)
  store.setSetting = setSetting
  assert.equal(registry.migrateFlash1017Default(), true)
})
test('without a Flash profile or key, adds a preset and asks for its key instead of using configured GLM', t => {
  const { store, registry, secrets } = setup(t), old = store.modelCatalog().defaultModelId
  registry.save({ id: old, providerId: 'glm', displayName: 'GLM', model: 'glm-5.3-flash', baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'glm-only' })
  registry.migrateFlash1017Default()
  const chosen = store.modelCatalog().defaultModelId
  assert.notEqual(chosen, old); assert.equal(store.modelProfile(chosen).model, 'deepseek-flash')
  assert.equal(secrets.get(modelSecretKey(old)), 'glm-only')
  assert.throws(() => registry.resolve(chosen), /尚未配置 API Key/)
})
test('cloud upgrade routes the default to Flash/high and fails explicitly if Cloud lacks Flash', t => {
  const { store, registry, secrets } = setup(t); registry.migrateFlash1017Default()
  let models = [{ id: 'glm-5.3-flash', provider: 'glm' }]
  const cloud = new ModelRegistry(store, secrets, { baseURL: 'http://127.0.0.1:9876/v1', account: { publicState: () => ({ status: 'authenticated', models }) }, modelRoute: id => ({ model: { model: id } }) })
  assert.equal(cloud.publicCatalog().defaultModelId, 'deepseek-flash')
  assert.throws(() => cloud.resolve(store.modelCatalog().defaultModelId), /尚未提供 DeepSeek-Flash/)
  models.push({ id: 'deepseek-flash', provider: 'deepseek' })
  assert.equal(cloud.resolve(store.modelCatalog().defaultModelId).model.model, 'deepseek-flash')
  assert.equal(cloud.resolve('glm-5.3-flash').model.model, 'glm-5.3-flash')
})

test('existing third-party Flash profiles keep their endpoint/key and do not prevent configuring the new official preset', t => {
  const { store, registry, secrets } = setup(t), old = store.modelCatalog().defaultModelId
  registry.save({ id: old, providerId: 'deepseek', displayName: 'Proxy Flash', model: 'deepseek-flash', baseURL: 'https://example.com/v1', apiKey: 'proxy-only' })
  registry.migrateFlash1017Default()
  const chosen = store.modelProfile(store.modelCatalog().defaultModelId)
  assert.equal(chosen.baseURL, 'https://api.deepseek.com')
  assert.throws(() => registry.resolve(chosen.id), /尚未配置 API Key/)
  registry.save({ ...chosen, apiKey: 'official-fixture' })
  assert.equal(secrets.get(modelSecretKey(old)), 'proxy-only')
  assert.equal(store.modelProfile(old).baseURL, 'https://example.com/v1')
})
