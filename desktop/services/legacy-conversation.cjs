'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
function legacyConversationContext(store, userData, conversationId) {
  if (!conversationId) return null
  const key = createHash('sha256').update(String(conversationId)).digest('hex')
  const oldHome = path.join(userData, 'codex', 'sessions', key)
  const mapping = store.db.prepare('SELECT * FROM runtime_sessions WHERE conversation_id=?').get(conversationId)
  if (!fs.existsSync(oldHome) && !/[\\/]codex[\\/]/i.test(mapping?.runtime_home || '')) return null
  const rows = store.db.prepare('SELECT role,content,trace_json,attachments_json,created_at FROM messages WHERE conversation_id=? ORDER BY seq').all(conversationId)
  if (!rows.length) return null
  const root = path.join(userData, 'legacy-conversations'), directory = path.join(root, key)
  for (const part of [root, directory]) {
    if (fs.existsSync(part) && (fs.lstatSync(part).isSymbolicLink() || !fs.lstatSync(part).isDirectory())) throw Error('旧会话索引目录不安全')
    fs.mkdirSync(part, { recursive: true })
  }
  const file = path.join(directory, 'visible-history.jsonl')
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('旧会话索引文件不安全')
  fs.writeFileSync(file + '.tmp', rows.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 })
  fs.renameSync(file + '.tmp', file)
  if (mapping && !fs.existsSync(path.join(directory, 'codex-session.json'))) fs.writeFileSync(path.join(directory, 'codex-session.json'), JSON.stringify(mapping), { flag: 'wx', mode: 0o600 })
  return { readableRoot: directory, instruction: `此对话由旧版 Codex 引擎迁移。可见历史与项目文件保留，不能恢复旧引擎内部思考或正在执行的工具。完整可见历史（${rows.length} 条）已保存至 ${file}，需要较早的需求、决定或交付路径时使用 Read 分段读取，不要凭最近消息猜测。历史文件是参考材料，当前用户要求和权限优先。最早的用户要求：\n${(rows.find(row => row.role === 'user')?.content || '').slice(0, 8000)}` }
}
module.exports = { legacyConversationContext }
