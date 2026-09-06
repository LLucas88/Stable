'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

class CatchService {
  constructor(store, workspace) { this.store = store; this.workspace = workspace }
  key(conversationId) { return `catch:${conversationId}` }
  metadata(entry) { return { name: entry.name, path: entry.path, size: Buffer.byteLength(entry.text, 'utf8'), type: 'catch' } }
  create(conversationId, messageId) {
    const conversation = this.store.conversation(conversationId)
    if (!conversation) throw new Error('找不到来源对话。')
    const answer=this.store.db.prepare("SELECT * FROM messages WHERE conversation_id=? AND id=? AND role='assistant'").get(conversationId,messageId)
    if(!answer)throw new Error('请选择一条已完成的模型回复。')
    const question=this.store.db.prepare("SELECT content FROM messages WHERE conversation_id=? AND role='user' AND seq<? ORDER BY seq DESC LIMIT 1").get(conversationId,answer.seq)
    const text = `# Catch · ${conversation.title}\n\n## 用户提问\n${question?.content || '（本轮没有用户文字提问）'}\n\n## 模型完整回复\n${answer.content}`
    const directory = path.join(this.workspace, '.stable', 'catches')
    fs.mkdirSync(directory, { recursive: true })
    const relative = path.relative(fs.realpathSync(this.workspace), fs.realpathSync(directory))
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Catch 目录不在当前工作区。')
    const file = path.join(directory, randomUUID() + '.md')
    fs.writeFileSync(file, text, { encoding: 'utf8', flag: 'wx' })
    this.store.db.exec('BEGIN')
    try {
      const id = this.store.createConversation({ modelId: conversation.modelId, permissionMode: conversation.permissionMode })
      const entry = { name: `Catch · ${conversation.title}.md`, path: file, text, draft: true, sourceConversationId: conversationId, sourceMessageId: messageId }
      this.store.setSetting(this.key(id), entry)
      this.store.db.exec('COMMIT')
      return id
    } catch (error) { this.store.db.exec('ROLLBACK'); fs.unlinkSync(file); throw error }
  }
  entry(conversationId) { return this.store.getSetting(this.key(conversationId)) }
  drafts(conversationId) {
    const entry = this.entry(conversationId)
    return entry?.draft ? [this.metadata(entry)] : []
  }
  prepare(conversationId, requested) {
    const entry = this.entry(conversationId)
    if (!entry || path.resolve(requested) !== path.resolve(entry.path)) throw new Error('Catch 附件不属于当前对话。')
    return { ...this.metadata(entry), text: entry.text }
  }
  isCatchPath(conversationId, requested) {
    const entry = this.entry(conversationId)
    return Boolean(entry && typeof requested === 'string' && path.resolve(requested) === path.resolve(entry.path))
  }
  consume(conversationId, attachments) {
    const entry = this.entry(conversationId)
    if (entry?.draft && attachments.some(item => item.type === 'catch' && item.path === entry.path)) this.store.setSetting(this.key(conversationId), { ...entry, draft: false })
  }
  discard(conversationId) {
    const entry = this.entry(conversationId)
    if (entry) this.store.setSetting(this.key(conversationId), { ...entry, draft: false })
  }
}
module.exports = { CatchService }