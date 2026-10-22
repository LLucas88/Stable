'use strict'
const { readSource } = require('./helpers/read-source.cjs')
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm')
const { StableStore } = require('../desktop/services/store.cjs')
const { MessagePredictions } = require('../desktop/services/message-predictions.cjs')
const source = readSource(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-prediction-ipc-'))
  const store = new StableStore(root), id = store.activeConversationId(), calls = [], handlers = new Map()
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  store.addMessage(id, 'user', '修复问题，先不发布。')
  const { id: messageId } = store.addMessage(id, 'assistant', '已完成修复。', [{ id: 'complete', kind: 'status', status: 'completed', time: 1 }])
  const context = vm.createContext({
    MessagePredictions, store, AbortController, process, chatgptAccount: null, paths: { userData: root, workspace: root }, app: { isPackaged: false },
    modelRegistry: { resolve: () => ({ model: { model: 'mock', baseURL: 'http://local.invalid' }, apiKey: 'fixture' }) },
    conversationPaths: () => ({ workspace: root }), conversationLifecycle: { locks: new Map() },
    agentRunners: new Map(), automationRunners: new Map(), teamTaskRunners: new Map(), collaborationRunners: new Map(), runner: null, activeWorkflowRun: null,
    reasoningOptions: () => [{ id: 'none' }],
    HarnessRunner: class { supportsTextOnly = true; async run(...args) { calls.push(args); return '{"suggestion":"继续运行测试。"}' } cancel() {} },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    requireText: value => { if (typeof value !== 'string' || !value.trim()) throw Error('Invalid ID'); return value },
  })
  vm.runInContext(source.slice(source.indexOf('const messagePredictions ='), source.indexOf('const automationRunners =')), context)
  vm.runInContext(source.slice(source.indexOf("  ipcMain.handle('stable:agent:prediction'"), source.indexOf("  ipcMain.handle('stable:settings:saveGlobalInstructions'")), context)
  const invoke = (name, payload) => handlers.get(name)(null, payload)
  const request = () => invoke('stable:agent:prediction', { conversationId: id, messageId, requestId: 'request' })
  return { root, store, id, calls, context, invoke, request }
}
test('real prediction IPC reads persisted source, uses isolated runner and keeps conversation history untouched', async t => {
  const { store, id, calls, request } = fixture(t)
  const before = JSON.stringify(store.listMessages(id))
  assert.equal((await request()).suggestion, '继续运行测试。')
  assert.equal(calls.length, 1)
  const [prompt, model, , timeout, , permission, images, session] = calls[0]
  assert.equal(JSON.parse(prompt).originalGoal, '修复问题，先不发布。')
  assert.equal(model.reasoningSelection, 'none'); assert.equal(timeout, 20000); assert.equal(permission, 'read-only')
  assert.equal(images.length, 0); assert.equal(session.purpose, 'message-prediction'); assert.equal(session.key, undefined)
  await request(); assert.equal(calls.length, 1); assert.equal(JSON.stringify(store.listMessages(id)), before)
})
test('real IPC blocks formal-task overlap and persists the global off switch', async t => {
  const { root, calls, context, invoke, request } = fixture(t)
  context.agentRunners.set('other', {})
  assert.equal(await request(), null); assert.equal(calls.length, 0)
  context.agentRunners.clear()
  assert.throws(() => invoke('stable:settings:messagePredictions', { enabled: 'false' }), /设置无效/)
  assert.equal(invoke('stable:settings:messagePredictions', { enabled: false }), false)
  const reopened = new StableStore(root)
  try { assert.equal(reopened.getSetting('messagePredictionsEnabled'), false) } finally { reopened.close() }
  assert.equal(await request(), null); assert.equal(calls.length, 0)
  invoke('stable:settings:messagePredictions', { enabled: true })
  assert.equal((await request()).suggestion, '继续运行测试。')
})
