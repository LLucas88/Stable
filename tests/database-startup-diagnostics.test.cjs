'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { recordDatabaseStartupFailure } = require('../desktop/services/database-diagnostics.cjs')
const { StableStore } = require('../desktop/services/store.cjs')

test('startup diagnostics preserve database and sidecars without resetting user data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-db-diagnostics-'))
  for (const suffix of ['', '-wal', '-shm']) fs.writeFileSync(path.join(root, 'stable.db' + suffix), 'original' + suffix)
  const error = Object.assign(new Error('database disk image is malformed'), { code: 'ERR_SQLITE_ERROR' })
  const log = recordDatabaseStartupFailure(root, error, 'open-store')
  const report = JSON.parse(fs.readFileSync(log))
  assert.equal(report.stage, 'open-store'); assert.equal(report.files.length, 3)
  for (const file of report.files) assert.deepEqual(fs.readFileSync(path.join(path.dirname(log), file)), fs.readFileSync(path.join(root, file)))
  assert.equal(report.databasePath, path.join(root, 'stable.db'))
})

test('failed store initialization closes its SQLite handle and leaves the file intact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-db-close-')), file = path.join(root, 'stable.db')
  const seed = new DatabaseSync(file)
  seed.exec('CREATE TABLE conversations(unrelated TEXT)'); seed.close()
  const close = DatabaseSync.prototype.close
  let closes = 0
  DatabaseSync.prototype.close = function () { closes++; return close.call(this) }
  try { assert.throws(() => new StableStore(root)); assert.equal(closes, 1) }
  finally { DatabaseSync.prototype.close = close }
  const check = new DatabaseSync(file)
  assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); check.close()
})
