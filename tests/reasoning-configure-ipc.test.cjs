'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
const { reasoningOptions, reasoningParameters } = require('../desktop/services/model-reasoning.cjs')

// Execute the real IPC handler without starting Electron or touching a user profile.
const source = fs.readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
const start = source.indexOf("  ipcMain.handle('stable:agent:configure',")
const end = source.indexOf("  ipcMain.handle('stable:agent:configurePermission',", start)
function setup(modelId) {
  const conversation = { id: 'test-conversation', modelId, capability: 'auto' }
  const registry = new ModelRegistry({}, {}, {
    baseURL: 'http://127.0.0.1:1234/v1',
    account: { publicState: () => ({ status: 'authenticated', models: [{ id: 'deepseek-flash', provider: 'deepseek' }] }) },
    modelRoute: id => ({ model: { id, model: id, cloudReasoning: true, providerId: 'stable-cloud', baseURL: 'http://127.0.0.1:1234/v1' } }),
  })
  let handler
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle: (_name, callback) => { handler = callback } },
    requireText: value => value,
    store: {
      conversation: () => conversation,
      listData: () => [],
      updateConversationContext: (_id, capability) => { conversation.capability = capability },
    },
    modelRegistry: registry,
    reasoningOptions,
    AGENT_CAPABILITIES: new Set(['auto', 'none', 'enabled', 'low', 'high', 'max']),
    agentState: () => conversation,
  })
  return { handler, conversation, registry }
}

for (const modelId of ['legacy-default-model', 'old-local-profile-id', 'deepseek-v4-pro', 'deepseek-flash', '']) {
  test(`cloud DeepSeek reasoning can be configured for stored model ID: ${modelId || '(empty)'}`, () => {
    const { handler, conversation, registry } = setup(modelId)
    for (const effort of ['low', 'high', 'max', 'auto']) {
      handler(null, { id: conversation.id, capability: effort })
      assert.equal(conversation.capability, effort)
      const route = registry.resolve(conversation.modelId)
      assert.equal(route.model.id, 'deepseek-flash')
      assert.deepEqual(reasoningParameters(route.model, conversation.capability), effort === 'auto' ? {} : { reasoning_effort: effort })
    }
    assert.equal(conversation.modelId, modelId)
    assert.throws(() => handler(null, { id: conversation.id, capability: 'medium' }), /不支持此思考强度/)
    // Cloud gateway does not forward thinking.type, so do not offer a nonfunctional off switch.
    assert.throws(() => handler(null, { id: conversation.id, capability: 'none' }), /不支持此思考强度/)
  })
}
