'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { rebuildHealthyDatabase, inventory } = require('../desktop/services/database-rebuild.cjs')
const { DatabaseSync } = require('node:sqlite')

test('rebuild retains every business record and repairs rowid-based search before switching the file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-rebuild-'))
  const store = new StableStore(root), id = store.activeConversationId()
  const old = store.addMessage(id, 'user', 'temporary entry')
  store.addMessage(id, 'assistant', '会员留存 analysis searchable', [], [{ name: '原件.csv', path: 'E:/data/原件.csv' }])
  store.db.prepare('DELETE FROM messages WHERE id=?').run(old.id)
  store.upsertSkill({ id: 'retained', name: '保留技能', description: '', path: '.', content: 'original content' })
  store.setSkillEnabled('retained', false)
  const before = inventory(store.db); store.close()
  const original = fs.readFileSync(path.join(root, 'stable.db'))
  const result = rebuildHealthyDatabase(root)
  assert.deepEqual(fs.readFileSync(path.join(result.backupDirectory, 'before.db')), original)
  const opened = new StableStore(root)
  try {
    assert.deepEqual(inventory(opened.db), before)
    assert.equal(opened.db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete')
    assert.equal(opened.searchConversations('searchable')[0].id, id)
    assert.equal(opened.listSkills()[0].enabled, false)
    assert.equal(opened.listMessages(id)[0].attachments[0].name, '原件.csv')
  } finally { opened.close() }
})

test('real corruption is preserved and rejected, not replaced with an empty database', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-rebuild-bad-')), file = path.join(root, 'stable.db')
  const bad = Buffer.from('invalid database, preserve me'); fs.writeFileSync(file, bad)
  assert.throws(() => rebuildHealthyDatabase(root))
  assert.deepEqual(fs.readFileSync(file), bad)
  assert(!fs.existsSync(path.join(root, 'sqlite-storage.json')))
})

test('invalid storage configuration is rejected rather than executed as SQL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-storage-mode-'))
  fs.writeFileSync(path.join(root, 'sqlite-storage.json'), JSON.stringify({ version: 1, journalMode: 'DELETE; DROP TABLE messages' }))
  assert.throws(() => new StableStore(root), /配置无效/)
})
