'use strict'
const fs = require('node:fs'), path = require('node:path')
const { randomUUID } = require('node:crypto')
function recordDatabaseStartupFailure(userData, error, stage) {
  const directory = path.join(userData, 'database-diagnostics', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8))
  try {
    fs.mkdirSync(directory, { recursive: true })
    const files = [], snapshotErrors = []
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const source = path.join(userData, 'stable.db' + suffix)
      if (!fs.existsSync(source)) continue
      try { fs.copyFileSync(source, path.join(directory, 'stable.db' + suffix)); files.push('stable.db' + suffix) }
      catch (copyError) { snapshotErrors.push({ file: 'stable.db' + suffix, code: copyError.code || 'UNKNOWN' }) }
    }
    const logPath = path.join(directory, 'startup-error.json')
    fs.writeFileSync(logPath, JSON.stringify({ stage, databasePath: path.join(userData, 'stable.db'), error: { message: String(error?.message || error), code: error?.code, sqliteStage: error?.sqliteStage, startupReopenAttempted: error?.startupReopenAttempted, readOnlyIntegrity: error?.readOnlyIntegrity, stack: error?.stack }, versions: { node: process.versions.node, sqlite: process.versions.sqlite, electron: process.versions.electron }, files, snapshotErrors, note: '诊断快照用于保全现场，未自动替换数据库；文件复制本身不代表 SQLite 一致性备份。' }, null, 2))
    return logPath
  } catch { return null }
}
module.exports = { recordDatabaseStartupFailure }
