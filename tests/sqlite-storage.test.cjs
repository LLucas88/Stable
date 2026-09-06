'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { openConfiguredDatabase } = require('../desktop/services/sqlite-storage.cjs')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-open-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'sqlite-storage.json'), JSON.stringify({ version: 1, journalMode: 'DELETE' }))
  const db = new DatabaseSync(path.join(root, 'stable.db'))
  db.exec("CREATE TABLE retained(id TEXT PRIMARY KEY, content TEXT); INSERT INTO retained VALUES('one','用户原文');")
  db.close()
  return root
}
function trackedDatabase(fail) {
  const events = [], connections = []
  class TrackedDatabase {
    constructor(file, options = {}) {
      this.readOnly = !!options.readOnly
      this.index = connections.length
      this.db = new DatabaseSync(file, options)
      connections.push(this)
      events.push({ op: 'open', readOnly: this.readOnly })
    }
    prepare(sql) {
      events.push({ op: 'prepare', sql, readOnly: this.readOnly })
      fail?.(this, sql)
      return this.db.prepare(sql)
    }
    exec(sql) { events.push({ op: 'exec', sql }); return this.db.exec(sql) }
    close() { this.closed = true; this.db.close() }
  }
  return { Database: TrackedDatabase, events, connections }
}
const malformed = () => Object.assign(new Error('database disk image is malformed'), { code: 'ERR_SQLITE_ERROR', errcode: 11 })

test('existing journal mode is read without issuing a redundant assignment', t => {
  const root = fixture(t), tracked = trackedDatabase()
  const db = openConfiguredDatabase(root, tracked.Database)
  try {
    assert.equal(db.prepare('SELECT content FROM retained').get().content, '用户原文')
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
    assert(!tracked.events.some(e => /journal_mode\s*=/i.test(e.sql || '')))
    assert.equal(tracked.connections.length, 1)
  } finally { db.close() }
})

test('a transient malformed connection reopens once after an independent read-only integrity check', t => {
  const root = fixture(t), before = fs.readFileSync(path.join(root, 'stable.db'))
  const tracked = trackedDatabase((db, sql) => { if (db.index === 0 && sql === 'PRAGMA journal_mode') throw malformed() })
  const db = openConfiguredDatabase(root, tracked.Database)
  try {
    assert.deepEqual(tracked.events.filter(e => e.op === 'open').map(e => e.readOnly), [false, true, false])
    assert(tracked.connections[0].closed && tracked.connections[1].closed)
    assert.equal(db.prepare('SELECT content FROM retained').get().content, '用户原文')
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.deepEqual(fs.readFileSync(path.join(root, 'stable.db')), before)
  } finally { db.close() }
})

test('repeated malformed connections stop after one retry and close all handles', t => {
  const root = fixture(t), tracked = trackedDatabase((db, sql) => { if (!db.readOnly && sql === 'PRAGMA journal_mode') throw malformed() })
  assert.throws(() => openConfiguredDatabase(root, tracked.Database), e => e.startupReopenAttempted === true && e.readOnlyIntegrity === 'ok')
  assert.equal(tracked.connections.length, 3)
  assert(tracked.connections.every(db => db.closed))
})

test('actual corrupt data pages fail the independent check and remain untouched', t => {
  const root = fixture(t), file = path.join(root, 'stable.db')
  const db = new DatabaseSync(file)
  const page = db.prepare("SELECT rootpage FROM sqlite_schema WHERE name='retained'").get().rootpage
  const size = db.prepare('PRAGMA page_size').get().page_size
  db.close()
  const bytes = fs.readFileSync(file); bytes[(page - 1) * size] = 0; fs.writeFileSync(file, bytes)
  const tracked = trackedDatabase((db, sql) => { if (!db.readOnly && sql === 'PRAGMA journal_mode') throw malformed() })
  assert.throws(() => openConfiguredDatabase(root, tracked.Database), e => !!e.readOnlyIntegrity && e.readOnlyIntegrity !== 'ok')
  assert.equal(tracked.connections.length, 2)
  assert(tracked.connections.every(db => db.closed))
  assert.deepEqual(fs.readFileSync(file), bytes)
})

test('busy errors are propagated without integrity probes or retries', t => {
  const root = fixture(t), tracked = trackedDatabase(() => { throw new Error('database is locked') })
  assert.throws(() => openConfiguredDatabase(root, tracked.Database), /database is locked/)
  assert.equal(tracked.connections.length, 1)
  assert(tracked.connections[0].closed)
})

test('requested journal mode changes are applied and invalid settings are rejected', t => {
  const root = fixture(t)
  fs.writeFileSync(path.join(root, 'sqlite-storage.json'), JSON.stringify({ version: 1, journalMode: 'WAL' }))
  const db = openConfiguredDatabase(root)
  try { assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal') } finally { db.close() }
  fs.writeFileSync(path.join(root, 'sqlite-storage.json'), JSON.stringify({ version: 1, journalMode: 'DELETE; DROP TABLE retained' }))
  const tracked = trackedDatabase()
  assert.throws(() => openConfiguredDatabase(root, tracked.Database), /配置无效/)
  assert.equal(tracked.connections.length, 1)
  assert(tracked.connections[0].closed)
})
