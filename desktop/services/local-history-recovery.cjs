'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { DatabaseSync, backup } = require('node:sqlite')

const MANIFEST = '.stable-history-recovery.json'
const SOURCE = '.stable-history-recovery.db'
const STATUS = '.stable-history-recovery-status.json'
const quote = name => '"' + name.replaceAll('"', '""') + '"'
const healthy = db => {
  try { const rows = db.prepare('PRAGMA integrity_check').all(); return rows.length === 1 && rows[0].integrity_check === 'ok' } catch { return false }
}
function rowsFrom(db, table) {
  const rows = []
  try { for (const row of db.prepare(`SELECT * FROM ${quote(table)} NOT INDEXED`).iterate()) rows.push(row) }
  catch { return { rows, incomplete: true } }
  return { rows, incomplete: false }
}
function insertMissing(db, table, rows) {
  const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(row => row.name)
  const insert = db.prepare(`INSERT OR IGNORE INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
  for (const row of rows) {
    if (!row.id || (table === 'messages' && !db.prepare('SELECT 1 FROM conversations WHERE id=?').get(row.conversation_id))) throw new Error('恢复记录缺少有效对话关联。')
    const existing = db.prepare(`SELECT * FROM ${quote(table)} WHERE id=?`).get(row.id)
    if (table === 'messages' && existing && (existing.content !== row.content || existing.conversation_id !== row.conversation_id || existing.role !== row.role)) throw new Error('发现同一消息 ID 的不同内容，已保留副本并停止自动合并。')
    insert.run(...columns.map(column => row[column] ?? null))
  }
}

// An explicit, ignored local recovery package is consumed by the real app before
// StableStore opens SQLite. Never install a database under a running connection.
async function prepareLocalHistoryRecovery({ appPath, userData, isPackaged }) {
  const manifestPath = path.join(appPath, MANIFEST)
  if (isPackaged || !fs.existsSync(manifestPath)) return null
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const sourcePath = path.join(appPath, SOURCE)
  if (manifest.version !== 1 || manifest.sha256 !== createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')) throw new Error('历史恢复副本校验失败，未修改原数据库。')
  const source = new DatabaseSync(sourcePath, { readOnly: true })
  let sourceConversations, sourceMessages
  try {
    if (!healthy(source)) throw new Error('历史恢复副本不完整，未修改原数据库。')
    sourceConversations = rowsFrom(source, 'conversations').rows
    sourceMessages = rowsFrom(source, 'messages').rows
  } finally { source.close() }
  if (!sourceConversations.length || !sourceMessages.length) throw new Error('恢复副本没有可用历史记录。')

  fs.mkdirSync(userData, { recursive: true })
  const databasePath = path.join(userData, 'stable.db')
  const recoveryId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
  const backupDirectory = path.join(userData, 'history-recovery-backups', recoveryId)
  fs.mkdirSync(backupDirectory, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(databasePath + suffix)) fs.copyFileSync(databasePath + suffix, path.join(backupDirectory, 'before.db' + suffix))
  }
  const stagedPath = path.join(userData, 'stable-history-' + recoveryId + '.db')
  let current, currentHealthy = false, salvagedConversations = [], salvagedMessages = [], incomplete = false
  try {
    if (fs.existsSync(databasePath)) {
      current = new DatabaseSync(databasePath, { readOnly: true })
      currentHealthy = healthy(current)
      if (currentHealthy) await backup(current, stagedPath)
      else {
        const conversations = rowsFrom(current, 'conversations'), messages = rowsFrom(current, 'messages')
        salvagedConversations = conversations.rows; salvagedMessages = messages.rows
        incomplete = conversations.incomplete || messages.incomplete
      }
    }
  } finally { current?.close() }
  if (!currentHealthy) fs.copyFileSync(sourcePath, stagedPath)

  const staged = new DatabaseSync(stagedPath)
  try {
    staged.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE')
    insertMissing(staged, 'conversations', currentHealthy ? sourceConversations : salvagedConversations)
    insertMissing(staged, 'messages', currentHealthy ? sourceMessages : salvagedMessages)
    const selected = sourceConversations.find(row => row.id === manifest.preferredConversationId)
    if (selected) staged.prepare('INSERT OR REPLACE INTO settings(key,value_json) VALUES(?,?)').run('activeConversationId', JSON.stringify(selected.id))
    staged.exec('COMMIT')
    if (!healthy(staged) || staged.prepare('PRAGMA foreign_key_check').all().length) throw new Error('合并后的历史数据库校验失败。')
    for (const message of sourceMessages) {
      const saved = staged.prepare('SELECT * FROM messages WHERE id=?').get(message.id)
      if (!saved || saved.content !== message.content || saved.trace_json !== message.trace_json || saved.attachments_json !== message.attachments_json) throw new Error('恢复消息核对失败，未替换原数据库。')
    }
  } finally { staged.close() }

  // Move the old database and its sidecars together; retain both pre-open copies
  // and the final originals. Roll back the moves if replacement cannot finish.
  const moved = []
  try {
    for (const suffix of ['-wal', '-shm', '']) {
      const from = databasePath + suffix, to = path.join(backupDirectory, 'original.db' + suffix)
      if (fs.existsSync(from)) { fs.renameSync(from, to); moved.push({ from, to }) }
    }
    fs.renameSync(stagedPath, databasePath)
  } catch (error) {
    for (const item of moved.reverse()) if (!fs.existsSync(item.from)) fs.renameSync(item.to, item.from)
    throw error
  }
  return { manifestPath, appPath, userData, backupDirectory, sourceConversationIds: sourceConversations.map(row => row.id), sourceMessageIds: sourceMessages.map(row => row.id), currentHealthy, incomplete }
}

function finishLocalHistoryRecovery(recovery, store) {
  if (!recovery) return null
  const conversations = store.listConversations()
  if (!healthy(store.db) || recovery.sourceConversationIds.some(id => !conversations.some(row => row.id === id)) || recovery.sourceMessageIds.some(id => !store.db.prepare('SELECT 1 FROM messages WHERE id=?').get(id))) throw new Error('客户端启动后的历史记录核验未通过，恢复包已保留。')
  const report = {
    status: 'loaded-by-client', loadedAt: new Date().toISOString(), pid: process.pid,
    userData: recovery.userData, backupDirectory: recovery.backupDirectory,
    currentWasHealthy: recovery.currentHealthy, incompleteOldDatabase: recovery.incomplete,
    conversations: conversations.map(row => ({ id: row.id, title: row.title, messageCount: row.messageCount })),
    recoveredMessages: recovery.sourceMessageIds.length,
  }
  fs.writeFileSync(path.join(recovery.appPath, STATUS), JSON.stringify(report, null, 2), 'utf8')
  fs.renameSync(recovery.manifestPath, path.join(recovery.appPath, '.stable-history-recovery.applied.json'))
  console.info(`历史记录已在当前客户端核验：${conversations.length} 个对话，恢复消息 ${report.recoveredMessages} 条。`)
  return report
}

module.exports = { prepareLocalHistoryRecovery, finishLocalHistoryRecovery, MANIFEST, SOURCE, STATUS }