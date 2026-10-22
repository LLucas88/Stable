'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { Worker } = require('node:worker_threads')
const { registerCloudIpc } = require('../desktop/ipc/cloud.cjs')
const { registerAutomationIpc } = require('../desktop/ipc/automations.cjs')
const { registerResourceIpc } = require('../desktop/ipc/resources.cjs')

function registry() {
  const handlers = new Map()
  return { ipcMain: { handle(channel, handler) { assert(!handlers.has(channel), channel); handlers.set(channel, handler) } },
    call(channel, payload) { assert(handlers.has(channel), channel); return handlers.get(channel)({}, payload) } }
}
function requireText(value) { if (typeof value !== 'string' || !value.trim()) throw Error('invalid text'); return value.trim() }

test('cloud startup reads the live promise assigned after IPC registration', async () => {
  const ipc = registry()
  let startup = Promise.resolve(), release, finished = false
  registerCloudIpc({ ...ipc, getCloudStartup: () => startup, cloudAccount: null, bootstrap: () => 'ready', requireText })
  startup = new Promise(resolve => { release = resolve })
  const request = ipc.call('stable:cloud:startup').then(value => { finished = true; return value })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(finished, false)
  release()
  assert.equal(await request, 'ready')
  await assert.rejects(ipc.call('stable:cloud:login', { username: 'name', password: 'password' }), /未启用/)
})

test('cloud password validation still rejects mismatched confirmation before account mutation', async () => {
  const ipc = registry(), calls = []
  registerCloudIpc({ ...ipc, getCloudStartup: () => Promise.resolve(), cloudAccount: { changePassword: (...args) => calls.push(args) }, bootstrap: () => 'saved', requireText })
  await assert.rejects(ipc.call('stable:cloud:changePassword', { currentPassword: 'old', newPassword: 'long-enough-password', confirmPassword: 'different' }), /不一致/)
  assert.equal(calls.length, 0)
  assert.equal(await ipc.call('stable:cloud:changePassword', { currentPassword: 'old', newPassword: 'long-enough-password', confirmPassword: 'long-enough-password' }), 'saved')
  assert.deepEqual(calls, [['old', 'long-enough-password']])
})

test('automation handlers preserve running-task protection and one-time proposal acceptance', () => {
  const ipc = registry(), running = new Map([['task', true]]), updates = [], created = []
  const message = { id: 'message', automationProposal: { status: 'pending', title: 'Daily report' } }
  const store = { removeAutomation: id => updates.push(id), listMessages: () => [message],
    createAutomation: (proposal, source) => { created.push({ ...proposal, source }); return { id: 'created' } },
    updateAutomationProposal: (_id, status) => { message.automationProposal.status = status } }
  registerAutomationIpc({ ...ipc, store, automationRunners: running, requireText, publishAutomationState: () => 'tasks', publishAgentState: id => updates.push(id), agentState: id => id })
  assert.throws(() => ipc.call('stable:automations:remove', { id: 'task' }), /正在运行/)
  assert.equal(updates.length, 0)
  running.clear(); assert.equal(ipc.call('stable:automations:remove', { id: 'task' }), 'tasks')
  const payload = { conversationId: 'chat', messageId: 'message', accepted: true }
  assert.deepEqual(ipc.call('stable:automations:proposal', payload), { agent: 'chat', automations: 'tasks' })
  assert.equal(created.length, 1); assert.equal(created[0].source, 'chat')
  assert.throws(() => ipc.call('stable:automations:proposal', payload), /已经处理/)
})

test('resource handlers preserve cancellation, current window and asset write boundaries', async () => {
  const ipc = registry(), windows = [], writes = []
  let activeWindow = 'first'
  const store = { listData: () => ['existing'], libraryItem: () => ({ kind: 'markdown', category: 'processing', path: 'outside.md' }), saveMarkdown: () => writes.push('write') }
  registerResourceIpc({ ...ipc, store, requireText, getWindow: () => activeWindow,
    dialog: { showOpenDialog: async window => { windows.push(window); return { canceled: true } } },
    libraryRoot: () => 'private', isInside: () => false })
  activeWindow = 'replacement'
  assert.deepEqual(await ipc.call('stable:data:import'), { added: 0, items: ['existing'] })
  assert.deepEqual(windows, ['replacement'])
  assert.throws(() => ipc.call('stable:library:saveMarkdown', { id: 'asset', content: 'new content' }), /私有目录/)
  assert.throws(() => ipc.call('stable:library:saveMarkdown', { id: 'asset', content: 'x'.repeat(2_000_001) }), /2 MB/)
  assert.equal(writes.length, 0)
})

test('preload provides the same validated import operations through new and legacy names', async () => {
  let exposed
  const calls = []
  const electron = { contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value } }, ipcRenderer: { on() {}, invoke: (...args) => { calls.push(args); return Promise.resolve(null) } }, webUtils: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop/preload.cjs'), 'utf8'), { require: name => { assert.equal(name, 'electron'); return electron }, window: { addEventListener() {} } })
  assert.equal(exposed.dataImport, exposed.workbuddy)
  await exposed.dataImport.scan(true, 'codex')
  await exposed.workbuddy.scan()
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['stable:workbuddy:scan', { chooseDirectory: true, provider: 'codex' }],
    ['stable:workbuddy:scan', { chooseDirectory: false, provider: 'workbuddy' }],
  ])
  const current = require('../desktop/services/data-import/service.cjs')
  assert.equal(require('../desktop/services/workbuddy-import.cjs').WorkBuddyImportService, current.DataImportService)
  for (const provider of ['workbuddy', 'codex', 'chatgpt']) assert.equal(require(`../desktop/services/${provider}-reader.cjs`), require(`../desktop/services/data-import/${provider}-reader.cjs`))
})

test('the legacy Codex reader path remains a working Worker entry point', { timeout: 10000 }, async t => {
  const parent = path.resolve(__dirname, '../qa-artifacts/structure-boundaries')
  fs.mkdirSync(parent, { recursive: true })
  const root = fs.mkdtempSync(path.join(parent, 'worker-'))
  fs.mkdirSync(path.join(root, 'sessions'))
  const worker = new Worker(require.resolve('../desktop/services/codex-reader.cjs'), { workerData: { root, staging: path.join(root, 'staging') } })
  t.after(async () => {
    await worker.terminate()
    assert.equal(path.dirname(root), parent)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const message = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); worker.once('exit', code => { if (code) reject(Error(`Worker exited ${code}`)) }) })
  assert.equal(message.error, undefined)
  assert.equal(message.result.provider, 'codex')
  assert(Array.isArray(message.result.items))
})
