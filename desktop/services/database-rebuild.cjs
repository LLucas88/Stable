'use strict'
const fs = require('node:fs'), path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const { CONFIG } = require('./sqlite-storage.cjs')
const quote = name => '"' + name.replaceAll('"', '""') + '"'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function health(db) {
  const rows = db.prepare('PRAGMA integrity_check').all()
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库完整性校验未通过，未替换原件。')
}
function inventory(db) {
  const tables = db.prepare('PRAGMA table_list').all().filter(t => t.schema === 'main' && t.type === 'table' && !t.name.startsWith('sqlite_')).map(t => t.name).sort()
  return tables.map(name => {
    const rows = db.prepare('SELECT * FROM ' + quote(name) + ' NOT INDEXED').all().map(r => JSON.stringify(r)).sort()
    return { name, count: rows.length, sha256: hash(rows.join('\n')) }
  })
}
// Explicit maintenance only. Call while holding this profile's application lock.
function rebuildHealthyDatabase(userData) {
  const root = fs.realpathSync(userData), database = path.join(root, 'stable.db')
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
  const directory = path.join(root, 'database-rebuilds', id)
  const staged = path.join(root, 'stable-rebuilt-' + id + '.db')
  fs.mkdirSync(directory, { recursive: true })
  const originalFiles = []
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = database + suffix
    if (fs.existsSync(file)) {
      const bytes = fs.readFileSync(file)
      fs.writeFileSync(path.join(directory, 'before.db' + suffix), bytes)
      originalFiles.push({ name: 'stable.db' + suffix, sha256: hash(bytes), bytes: bytes.length })
    }
  }
  const source = new DatabaseSync(database, { readOnly: true })
  let before
  try {
    health(source)
    before = inventory(source)
    source.prepare('VACUUM INTO ?').run(staged)
  } finally { source.close() }
  const target = new DatabaseSync(staged)
  try {
    target.exec('PRAGMA journal_mode=DELETE')
    if (target.prepare("SELECT 1 FROM sqlite_schema WHERE name='message_search'").get()) {
      // VACUUM can renumber rowids: rebuild this derived index from real messages.
      target.exec("INSERT INTO message_search(message_search) VALUES('rebuild')")
      target.exec("INSERT INTO message_search(message_search,rank) VALUES('integrity-check',1)")
    }
    health(target)
    if (JSON.stringify(before) !== JSON.stringify(inventory(target))) throw new Error('重建后业务记录不一致，未替换原件。')
  } finally { target.close() }
  const configPath = path.join(root, CONFIG)
  const oldConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath) : null
  if (oldConfig) fs.writeFileSync(path.join(directory, CONFIG + '.before'), oldConfig)
  const moved = []
  let installed = false
  try {
    for (const suffix of ['-wal', '-shm', '-journal', '']) {
      const from = database + suffix, to = path.join(directory, 'original.db' + suffix)
      // Both endpoints are fixed descendants of the explicit userData directory.
      for (const item of [from, to, staged]) {
        const relative = path.relative(root, path.resolve(item))
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('恢复路径超出数据目录。')
      }
      if (fs.existsSync(from)) { fs.renameSync(from, to); moved.push({ from, to }) }
    }
    fs.renameSync(staged, database); installed = true
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, journalMode: 'DELETE', reason: '重复启动初始化报错后，采用单实例回滚日志模式。', rebuildId: id }, null, 2))
  } catch (error) {
    if (installed && fs.existsSync(database)) fs.renameSync(database, staged)
    for (const item of moved.reverse()) if (!fs.existsSync(item.from)) fs.renameSync(item.to, item.from)
    if (oldConfig) fs.writeFileSync(configPath, oldConfig)
    else if (fs.existsSync(configPath)) fs.renameSync(configPath, path.join(directory, CONFIG + '.failed'))
    throw error
  }
  const report = { status: 'rebuilt-and-verified', database, backupDirectory: directory, originalFiles, tables: before, journalMode: 'DELETE', rebuiltMessageSearch: true, sqlite: process.versions.sqlite }
  fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2))
  return report
}
module.exports = { rebuildHealthyDatabase, inventory }
