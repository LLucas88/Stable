'use strict'

// Backups are outside userData: neither startup cleanup nor uninstall removes them.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const MARKER = 'stable-upgrade.json'
const RESTORE_PENDING = 'stable-upgrade-restore-pending.json'
const TRANSIENT = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'logs', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'LOCK'])
function digest(file) {
  const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(file, 'r')
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); return hash.digest('hex') } finally { fs.closeSync(fd) }
}
function snapshotDatabase(source, target) {
  const db = new DatabaseSync(source, { readOnly: true })
  try { db.exec(`PRAGMA busy_timeout=10000; VACUUM INTO '${target.replaceAll("'", "''")}'`) } finally { db.close() }
  const check = new DatabaseSync(target, { readOnly: true })
  try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('数据库备份完整性检查失败') } finally { check.close() }
}
function checkedPath(root, relative) {
  const target = path.resolve(root, relative)
  if (!relative || path.isAbsolute(relative) || !target.startsWith(path.resolve(root) + path.sep)) throw new Error('备份路径不安全')
  return target
}
function historyFingerprint(db, columns) {
  return Object.fromEntries(Object.entries(columns).map(([table, names]) => {
    const hash = crypto.createHash('sha256'); let count = 0
    for (const row of db.prepare(`SELECT ${names.map(name => '"' + name.replaceAll('"', '""') + '"').join(',')} FROM ${table} ORDER BY id`).iterate()) { hash.update(JSON.stringify(row)); count++ }
    return [table, { count, sha256: hash.digest('hex') }]
  }))
}
function createBackup(userData, version, options = {}) {
  userData = path.resolve(userData)
  const root = path.join(path.dirname(userData), path.basename(userData) + '-upgrade-backups')
  fs.mkdirSync(root, { recursive: true })
  const backup = fs.mkdtempSync(path.join(root, new Date().toISOString().replace(/[:.]/g, '-') + '-'))
  const profile = path.join(backup, 'profile'); fs.mkdirSync(profile)
  const manifest = { format: 1, userData, targetVersion: version, engine: 'claude', createdAt: new Date().toISOString(), files: [], skippedLinks: [] }
  function visit(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ((!relative && TRANSIENT.has(entry.name)) || ['stable.db-wal', 'stable.db-shm'].includes(entry.name)) continue
      const rel = path.join(relative, entry.name), source = path.join(dir, entry.name), target = checkedPath(profile, rel)
      const stat = fs.lstatSync(source)
      if (stat.isSymbolicLink()) { manifest.skippedLinks.push({ path: rel, target: fs.readlinkSync(source) }); continue }
      if (stat.isDirectory()) { fs.mkdirSync(target); visit(source, rel) }
      else if (stat.isFile()) {
        if (rel === 'stable.db') snapshotDatabase(source, target)
        else fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
        manifest.files.push({ path: rel, size: fs.statSync(target).size, sha256: digest(target) })
      }
    }
  }
  visit(userData)
  // Prove the new schema can open a clone before touching the real database.
  if (manifest.files.some(file => file.path === 'stable.db')) {
    const rehearsal = path.join(backup, 'migration-check'); fs.mkdirSync(rehearsal)
    fs.copyFileSync(path.join(profile, 'stable.db'), path.join(rehearsal, 'stable.db'))
    const source = new DatabaseSync(path.join(profile, 'stable.db'), { readOnly: true })
    let columns
    try {
      columns = Object.fromEntries(['conversations', 'messages'].map(table => [table, source.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name).filter(name => name !== 'seq' && !(table === 'conversations' && name === 'model_id'))]).filter(([, names]) => names.length))
      manifest.history = historyFingerprint(source, columns)
    } finally { source.close() }
    let store
    try {
      const Store = options.Store || require('./store.cjs').StableStore
      store = new Store(rehearsal)
      if (store.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('新版数据库迁移检查失败')
      if (JSON.stringify(historyFingerprint(store.db, columns)) !== JSON.stringify(manifest.history)) throw new Error('升级会改变原历史内容，已阻止升级')
    } finally { store?.close() }
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
  verifyBackup(backup, userData)
  return backup
}
function verifyBackup(backup, userData) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'))
  if (manifest.format !== 1 || path.resolve(manifest.userData).toLowerCase() !== path.resolve(userData).toLowerCase()) throw new Error('备份不属于当前用户数据目录')
  const profile = path.join(backup, 'profile')
  for (const item of manifest.files) {
    const source = checkedPath(profile, item.path)
    if (fs.lstatSync(source).isSymbolicLink() || digest(source) !== item.sha256) throw new Error('备份校验失败：' + item.path)
  }
  return manifest
}
function prepareUpgrade(userData, version, options = {}) {
  fs.mkdirSync(userData, { recursive: true })
  if (fs.existsSync(path.join(userData, RESTORE_PENDING))) throw new Error('上次数据恢复尚未完成。请退出 Stable 后重新运行回退脚本；已保留原数据和恢复目录，暂不创建新数据库。')
  const markerPath = path.join(userData, MARKER)
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (!options.force && marker.version === version && marker.engine === 'claude' && marker.schema === 1) return null
  } catch {}
  if (!fs.existsSync(path.join(userData, 'stable.db')) && !fs.existsSync(path.join(userData, 'secrets.json'))) return null
  return createBackup(userData, version, options)
}
function commitUpgrade(userData, version, backup) {
  const file = path.join(userData, MARKER), tmp = file + '.tmp'
  let previous; try { previous = JSON.parse(fs.readFileSync(file, 'utf8')).backup } catch {}
  fs.writeFileSync(tmp, JSON.stringify({ version, engine: 'claude', schema: 1, backup: backup || previous || null, completedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, file)
}
function restoreBackup(backup, userData) {
  const manifest = verifyBackup(backup, userData)
  // Restore compatibility-critical state only. Never erase newer reports/workspace files.
  const critical = new Set(['stable.db', 'secrets.json', 'Local State', 'chatgpt-account.enc', 'sqlite-storage.json', MARKER])
  const recovery = path.join(userData, 'upgrade-recovery-' + crypto.randomUUID()); fs.mkdirSync(recovery)
  const staged = []
  for (const item of manifest.files.filter(file => critical.has(file.path))) {
    const target = checkedPath(userData, item.path), temporary = target + '.restore-' + crypto.randomUUID()
    fs.copyFileSync(checkedPath(path.join(backup, 'profile'), item.path), temporary, fs.constants.COPYFILE_EXCL)
    staged.push({ target, temporary })
  }
  const pending = path.join(userData, RESTORE_PENDING)
  fs.writeFileSync(pending, JSON.stringify({ backup, recovery, startedAt: new Date().toISOString() }), { mode: 0o600 })
  try {
    for (const name of [...critical, 'stable.db-wal', 'stable.db-shm']) {
      const current = path.join(userData, name)
      if (fs.existsSync(current)) fs.renameSync(current, path.join(recovery, name))
    }
    for (const item of staged) fs.renameSync(item.temporary, item.target)
    fs.unlinkSync(pending)
  } catch (error) {
    // Retain every version even if antivirus prevents an atomic replacement.
    error.message += '\n恢复未完成，请保留备份及恢复目录：' + recovery
    throw error
  }
  return recovery
}
module.exports = { createBackup, prepareUpgrade, commitUpgrade, restoreBackup, verifyBackup, snapshotDatabase, digest }
