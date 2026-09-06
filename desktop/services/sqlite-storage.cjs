'use strict'
const fs = require('node:fs'), path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const CONFIG = 'sqlite-storage.json'
function configureDatabase(db, root) {
  const file = path.join(root, CONFIG)
  let mode = 'WAL'
  if (fs.existsSync(file)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (value.version !== 1 || !['WAL', 'DELETE'].includes(value.journalMode)) throw new Error('SQLite 存储配置无效。')
    mode = value.journalMode
  }
  try {
    const current = String(db.prepare('PRAGMA journal_mode').get().journal_mode).toUpperCase()
    if (current !== mode) {
      const actual = String(db.prepare('PRAGMA journal_mode = ' + mode).get().journal_mode).toUpperCase()
      if (actual !== mode) throw new Error('SQLite 未能切换到请求的日志模式。')
    }
  } catch (error) { error.sqliteStage = 'journal-mode-' + mode; throw error }
  db.exec('PRAGMA foreign_keys = ON')
}
// Retry only connection configuration, before migrations or business writes.
// A fresh read-only integrity check must pass; never repair or replace the file.
function openConfiguredDatabase(root, Database = DatabaseSync) {
  const file = path.join(root, 'stable.db')
  const connect = () => {
    const db = new Database(file)
    try { configureDatabase(db, root); return db }
    catch (error) { try { db.close() } catch {} throw error }
  }
  try { return connect() }
  catch (error) {
    if (!error.sqliteStage || !/database disk image is malformed/i.test(error.message)) throw error
    let check
    try {
      check = new Database(file, { readOnly: true })
      const result = check.prepare('PRAGMA integrity_check').all()
      if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('完整性校验未通过')
      error.readOnlyIntegrity = 'ok'
    } catch (checkError) {
      error.readOnlyIntegrity = String(checkError.message)
      throw error
    } finally { try { check?.close() } catch {} }
    try {
      const db = connect()
      console.warn('SQLite 启动连接已重新打开；独立只读完整性检查通过。')
      return db
    } catch (retryError) {
      retryError.startupReopenAttempted = true
      retryError.readOnlyIntegrity = 'ok'
      throw retryError
    }
  }
}
module.exports = { CONFIG, configureDatabase, openConfiguredDatabase }
