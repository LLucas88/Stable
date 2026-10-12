'use strict'
const { randomUUID } = require('node:crypto')

function initializeAnswerTools(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS answer_chapters (
    message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    title TEXT NOT NULL);`)
}
function answer(store, conversationId, messageId) {
  if (!store.conversation(conversationId) || store.conversationContext(conversationId).deletionState !== 'active') throw Error('找不到可用的来源对话。')
  const row = store.db.prepare("SELECT * FROM messages WHERE conversation_id=? AND id=? AND role='assistant'").get(conversationId, messageId)
  if (!row) throw Error('请选择一条已保存的回答。')
  return row
}
const methods = {
  chapters(conversationId) {
    return this.db.prepare(`SELECT m.id AS messageId,m.seq,c.title FROM answer_chapters c
      JOIN messages m ON m.id=c.message_id WHERE m.conversation_id=? ORDER BY m.seq`).all(conversationId)
  },
  setChapter(conversationId, messageId, title) {
    answer(this, conversationId, messageId)
    if (title === null) this.db.prepare('DELETE FROM answer_chapters WHERE message_id=?').run(messageId)
    else {
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) throw Error('章节名称需要 1 至 80 个字符。')
      this.db.prepare('INSERT INTO answer_chapters VALUES(?,?) ON CONFLICT(message_id) DO UPDATE SET title=excluded.title').run(messageId, title.trim())
    }
    return this.chapters(conversationId)
  },
  forkAnswer(conversationId, messageId) {
    const last = answer(this, conversationId, messageId)
    const source = this.conversation(conversationId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const id = this.createConversation({ title: source.title.slice(0, 75) + ' · 分支', modelId: source.modelId, permissionMode: source.permissionMode })
      this.db.prepare(`UPDATE conversations SET capability=(SELECT capability FROM conversations WHERE id=?),
        data_ids_json=(SELECT data_ids_json FROM conversations WHERE id=?) WHERE id=?`).run(conversationId, conversationId, id)
      this.db.prepare(`INSERT INTO conversation_contexts(conversation_id,project_id,cwd,identity)
        SELECT ?,project_id,cwd,identity FROM conversation_contexts WHERE conversation_id=?`).run(id, conversationId)
      // Start a fresh runtime; never inherit approvals, running deliveries or a shared SDK session.
      for (const prefix of ['permission-boundary:', 'conversation-skills:']) {
        const value = this.getSetting(prefix + conversationId)
        if (value !== undefined) this.setSetting(prefix + id, value)
      }
      const insert = this.db.prepare(`INSERT INTO messages(id,conversation_id,role,content,trace_json,attachments_json,automation_json,created_at)
        VALUES(?,?,?,?,?,?,?,?)`)
      for (const row of this.db.prepare('SELECT * FROM messages WHERE conversation_id=? AND seq<=? ORDER BY seq').all(conversationId, last.seq)) {
        const copiedId = randomUUID()
        const trace = row.trace_json ? JSON.parse(row.trace_json).map(item => ({ ...item, ...(item.status === 'running' ? { status: 'cancelled' } : {}), ...(item.clarification?.status === 'waiting' ? { clarification: undefined } : {}) })) : null
        const proposal = row.automation_json ? JSON.parse(row.automation_json) : null
        insert.run(copiedId, id, row.role, row.content, trace ? JSON.stringify(trace) : null, row.attachments_json, proposal?.status === 'pending' ? null : row.automation_json, row.created_at)
        this.db.prepare('INSERT INTO answer_chapters SELECT ?,title FROM answer_chapters WHERE message_id=?').run(copiedId, row.id)
      }
      this.db.exec('COMMIT')
      return id
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  },
}
module.exports = { initializeAnswerTools, methods }
