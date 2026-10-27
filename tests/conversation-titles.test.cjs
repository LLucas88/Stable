'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { ConversationTitles, localTitle, needsTitleModel, parseTitle, titlePrompt } = require('../desktop/services/conversation-titles.cjs')

const prompt = '根据上传的数据源做一个经营情况的数据分析报告，交付 HTML 格式，并核对所有指标的计算口径'
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-titles-'))
  const store = new StableStore(root)
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  const id = store.activeConversationId()
  return { store, id }
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('local fallback removes courtesy, preserves short tasks and bounds Unicode titles', () => {
  assert.equal(localTitle('帮我修复 SDK 初始化速度'), '修复 SDK 初始化速度')
  assert.equal(localTitle('请问你是什么模型？'), '你是什么模型')
  assert.equal(localTitle(''), '新对话')
  assert.equal(localTitle('', [{ name: '会员数据.xlsx' }]), '查看 会员数据.xlsx')
  assert.equal(localTitle('https://example.com/report?token=secret'), '查看 example.com/report')
  const result = localTitle('😀'.repeat(35))
  assert.equal([...result].length, 24)
  assert(!result.includes('\ufffd'))
  assert(!needsTitleModel('请简单介绍一下什么是数据库事务以及隔离级别'))
  assert(!needsTitleModel('你是什么模型'))
  assert(needsTitleModel(prompt))
})

test('model input is bounded task data, not attachment or code instructions', () => {
  const input = titlePrompt('# Files mentioned by the user:\nprivate.png\n## My request:\n修复 SDK 初始化速度')
  assert.equal(JSON.parse(input).userRequest, '修复 SDK 初始化速度')
  assert(JSON.parse(titlePrompt('头'.repeat(4000) + '最终交付 HTML')).userRequest.endsWith('最终交付 HTML'))
  assert(JSON.parse(titlePrompt('长'.repeat(5000))).userRequest.length < 2500)
})

test('title parser rejects prose, extra fields, multiline and overlong model output', () => {
  assert.equal(parseTitle('{"title":"生成经营分析报告。"}'), '生成经营分析报告')
  for (const raw of ['这是标题', '{}', '[]', '{"title":"报告","tool":"Bash"}', '{"title":"任务处理"}', JSON.stringify({title:'字'.repeat(25)}), JSON.stringify({title:'第一行\n第二行'})]) assert.equal(parseTitle(raw), null)
})

test('first message does not overwrite explicit or manually chosen names', t => {
  const { store, id } = fixture(t)
  store.renameConversation(id, '会员周报')
  store.addMessage(id, 'user', prompt)
  assert.equal(store.conversation(id).title, '会员周报')
  assert.equal(store.claimAutomaticTitle(id), null)
  const explicit = store.createConversation({title:'定时报告'})
  store.addMessage(explicit, 'user', prompt)
  assert.equal(store.conversation(explicit).title, '定时报告')
})

test('background naming runs at most once, changes only title and leaves message history intact', async t => {
  const { store, id } = fixture(t); store.addMessage(id, 'user', prompt)
  const before = JSON.stringify(store.listMessages(id)), timestamp = store.conversation(id).updatedAt
  let calls = 0, changes = 0; const pending = deferred()
  const titles = new ConversationTitles({store, generate: () => { calls++; return pending.promise }, changed: () => changes++})
  const job = titles.request(id, {})
  await titles.request(id, {})
  pending.resolve('{"title":"生成经营分析报告"}'); await job
  await titles.request(id, {})
  assert.equal(calls, 1); assert.equal(changes, 1)
  assert.equal(store.conversation(id).title, '生成经营分析报告')
  assert.equal(store.conversation(id).updatedAt, timestamp)
  assert.equal(JSON.stringify(store.listMessages(id)), before)
})

test('same-text manual rename wins over a late model result', async t => {
  const { store, id } = fixture(t); store.addMessage(id, 'user', prompt)
  const original = store.conversation(id).title, pending = deferred()
  const titles = new ConversationTitles({store, generate: () => pending.promise})
  const job = titles.request(id, {})
  store.renameConversation(id, original)
  pending.resolve('{"title":"不应覆盖"}'); await job
  assert.equal(store.conversation(id).title, original)
})

test('cleared source and switched model reject stale title updates', t => {
  const { store, id } = fixture(t); store.addMessage(id, 'user', prompt)
  const source = store.claimAutomaticTitle(id)
  store.db.prepare('UPDATE conversations SET model_id=? WHERE id=?').run('other-model', id)
  assert.equal(store.completeAutomaticTitle(id, source, '不应覆盖'), false)
  store.db.prepare('UPDATE conversations SET model_id=? WHERE id=?').run(source.modelId, id)
  store.clearMessages(id)
  assert.equal(store.completeAutomaticTitle(id, source, '不应覆盖'), false)
})

test('simple chats make zero metadata calls', async t => {
  const {store, id} = fixture(t); store.addMessage(id, 'user', '你是什么模型？')
  const titles = new ConversationTitles({store, generate: () => { throw Error('must not call') }})
  await titles.request(id, {})
  assert.equal(store.conversation(id).title, '你是什么模型')
  assert.equal(store.db.prepare('SELECT auto_title_state AS state FROM conversations WHERE id=?').get(id).state, 'local')
})

test('provider failure and cancellation keep the fallback without retry', async t => {
  const {store, id} = fixture(t); store.addMessage(id, 'user', prompt)
  let calls = 0; const original = store.conversation(id).title
  const titles = new ConversationTitles({store, generate: async () => { calls++; throw Error('402') }})
  await titles.request(id, {}); await titles.request(id, {})
  assert.equal(calls, 1); assert.equal(store.conversation(id).title, original)
  const second = store.createConversation(); store.addMessage(second, 'user', prompt)
  const pending = deferred(), cancelled = new ConversationTitles({store, generate: () => pending.promise})
  const job = cancelled.request(second, {}); cancelled.interrupt(); pending.resolve('{"title":"不应覆盖"}'); await job
  assert.equal(store.conversation(second).title, original)
})

test('legacy titles remain preserved during migration and on future messages', t => {
  const { store, id } = fixture(t)
  store.renameConversation(id, '老版本手动名称')
  store.db.exec('ALTER TABLE conversations DROP COLUMN auto_title_state')
  // Run the actual migration against this isolated legacy database.
  const legacyRoot = path.dirname(store.db.location())
  const migrated = new StableStore(legacyRoot)
  try {
    migrated.addMessage(id, 'user', prompt)
    assert.equal(migrated.conversation(id).title, '老版本手动名称')
    assert.equal(migrated.claimAutomaticTitle(id), null)
  } finally { migrated.close() }
})
