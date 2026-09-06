'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { StableStore } = require('../desktop/services/store.cjs')
const { prepareLocalHistoryRecovery, finishLocalHistoryRecovery, MANIFEST, SOURCE, STATUS } = require('../desktop/services/local-history-recovery.cjs')

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-history-repair-'))
  const appPath = path.join(root, 'app'), userData = path.join(root, 'user')
  fs.mkdirSync(appPath)
  const seedRoot = path.join(root, 'source')
  const source = new StableStore(seedRoot)
  const id = source.activeConversationId()
  const message = source.addMessage(id, 'assistant', '恢复的 CRM 内容', [{ id: 'test', kind: 'status', title: 'fixture', status: 'completed' }], [{ kind: 'attachment', name: '中文.xlsx', path: 'C:\\workspace\\中文.xlsx', size: 12, type: 'xlsx' }])
  source.close()
  fs.copyFileSync(path.join(seedRoot, 'stable.db'), path.join(appPath, SOURCE))
  const manifest = { version: 1, preferredConversationId: id, sha256: createHash('sha256').update(fs.readFileSync(path.join(appPath, SOURCE))).digest('hex') }
  fs.writeFileSync(path.join(appPath, MANIFEST), JSON.stringify(manifest))
  const current = new StableStore(userData)
  const newId = current.activeConversationId()
  current.addMessage(newId, 'user', '启动后的新消息')
  current.setSetting('theme', 'light')
  current.close()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return { options: { appPath, userData, isPackaged: false }, id, message, newId }
}

test('client-side recovery merges history, preserves new messages/settings, and is consumed once', async t => {
  const { options, id, message, newId } = setup(t)
  const recovery = await prepareLocalHistoryRecovery(options)
  const store = new StableStore(options.userData)
  try {
    const report = finishLocalHistoryRecovery(recovery, store)
    assert.equal(report.status, 'loaded-by-client')
    assert.equal(store.listConversations().length, 2)
    assert.equal(store.listMessages(id)[0].id, message.id)
    assert.equal(store.listMessages(id)[0].content, message.content)
    assert.deepEqual(store.listMessages(id)[0].trace, message.trace)
    assert.deepEqual(store.listMessages(id)[0].attachments, message.attachments)
    assert.equal(store.listMessages(newId)[0].content, '启动后的新消息')
    assert.equal(store.getSetting('theme'), 'light')
    assert.equal(store.activeConversationId(), id)
    assert.ok(fs.existsSync(path.join(recovery.backupDirectory, 'before.db')))
    assert.equal(JSON.parse(fs.readFileSync(path.join(options.appPath, STATUS))).conversations.length, 2)
    store.removeConversation(id)
  } finally { store.close() }
  assert.equal(await prepareLocalHistoryRecovery(options), null)
  const reopened = new StableStore(options.userData)
  try { assert.equal(reopened.listConversations().length, 1) } finally { reopened.close() }
})

test('a corrupt current message page is backed up, while verified history and readable conversation rows survive', async t => {
  const { options, id, newId } = setup(t)
  const { DatabaseSync } = require('node:sqlite')
  const file = path.join(options.userData, 'stable.db')
  const db = new DatabaseSync(file)
  const page = db.prepare("SELECT rootpage FROM sqlite_schema WHERE name='messages'").get().rootpage
  const size = db.prepare('PRAGMA page_size').get().page_size
  db.close()
  const bytes = fs.readFileSync(file); bytes.fill(0, (page - 1) * size, page * size); fs.writeFileSync(file, bytes)
  const recovery = await prepareLocalHistoryRecovery(options)
  assert.equal(recovery.currentHealthy, false)
  assert.equal(recovery.incomplete, true)
  assert.deepEqual(fs.readFileSync(path.join(recovery.backupDirectory, 'before.db')), bytes)
  const store = new StableStore(options.userData)
  try {
    finishLocalHistoryRecovery(recovery, store)
    assert.equal(store.listMessages(id).length, 1)
    assert.ok(store.conversation(newId))
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  } finally { store.close() }
})

test('invalid recovery package cannot change the current database', async t => {
  const { options } = setup(t)
  const before = fs.readFileSync(path.join(options.userData, 'stable.db'))
  fs.appendFileSync(path.join(options.appPath, SOURCE), 'changed')
  await assert.rejects(prepareLocalHistoryRecovery(options), /副本校验失败/)
  assert.deepEqual(fs.readFileSync(path.join(options.userData, 'stable.db')), before)
})

test('message conflicts stop the merge and preserve the live data and pending recovery package', async t => {
  const { options, id, message } = setup(t)
  const store = new StableStore(options.userData)
  store.db.prepare('UPDATE messages SET id=? WHERE conversation_id=?').run(message.id, store.activeConversationId())
  store.close()
  await assert.rejects(prepareLocalHistoryRecovery(options), /同一消息 ID/)
  const reopened = new StableStore(options.userData)
  try {
    assert.equal(reopened.conversation(id), undefined)
    assert.equal(reopened.listMessages()[0].content, '启动后的新消息')
    assert.ok(fs.existsSync(path.join(options.appPath, MANIFEST)))
  } finally { reopened.close() }
})

test('packaged launches never import a developer recovery package', async t => {
  const { options } = setup(t)
  assert.equal(await prepareLocalHistoryRecovery({ ...options, isPackaged: true }), null)
})

test('real Electron startup reads the recovered history and retains it after another launch', { skip: process.platform !== 'win32', timeout: 25000 }, t => {
  const { options, id } = setup(t)
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  for (let pass = 0; pass < 2; pass++) {
    const run = spawnSync(require('electron'), [path.join(__dirname, 'fixtures/local-history-startup.cjs'), options.appPath, options.userData], { env, windowsHide: true, encoding: 'utf8', timeout: 10000 })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    const result = JSON.parse(fs.readFileSync(path.join(options.appPath, 'verification.json'), 'utf8'))
    assert.deepEqual(result, { actualConversations: 2, targetMessages: 1, activeConversation: id, integrity: 'ok', windowCreated: true, recoveryApplied: pass === 0 })
  }
})
