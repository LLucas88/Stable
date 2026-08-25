'use strict'

const MAX_MESSAGES = 200
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024

function cleanAttachment(item = {}) {
  const allowedKinds = new Set(['data', 'skill', 'script', 'knowledge'])
  return {
    kind: allowedKinds.has(item.kind) ? item.kind : 'attachment',
    name: String(item.name || '').slice(0, 260),
    size: Math.max(0, Number(item.size) || 0),
    type: String(item.type || '').slice(0, 80),
  }
}

function cleanMessage(item = {}) {
  if (!['user', 'assistant'].includes(item.role)) return undefined
  const attachments = Array.isArray(item.attachments) ? item.attachments.slice(0, 24).map(cleanAttachment) : []
  return {
    role: item.role,
    content: String(item.content || '').slice(0, 500_000),
    createdAt: String(item.createdAt || new Date().toISOString()),
    ...(attachments.length ? { attachments } : {}),
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot.messages.length) throw new Error('当前对话还没有可发送的问题或回答。')
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES) throw new Error('对话快照超过 10 MB，请精简后再发送。')
  return snapshot
}

function buildConversationSnapshot(conversation, messages) {
  if (!conversation?.id) throw new Error('找不到当前对话。')
  return validateSnapshot({
    title: String(conversation.title || 'Team 对话').trim().slice(0, 80) || 'Team 对话',
    messages: (Array.isArray(messages) ? messages : []).slice(-MAX_MESSAGES).map(cleanMessage).filter(Boolean),
  })
}

function normalizeConversationOffer(payload, sourceDeviceId, sourceDeviceName) {
  if (!payload?.offerId) throw new Error('收到的对话快照缺少标识。')
  const snapshot = validateSnapshot({
    title: String(payload.title || 'Team 对话').trim().slice(0, 80) || 'Team 对话',
    messages: (Array.isArray(payload.messages) ? payload.messages : []).slice(-MAX_MESSAGES).map(cleanMessage).filter(Boolean),
  })
  return {
    id: String(payload.offerId),
    sourceDeviceId: String(sourceDeviceId || ''),
    sourceDeviceName: String(sourceDeviceName || 'Team 设备').slice(0, 80),
    title: snapshot.title,
    messages: snapshot.messages,
    createdAt: String(payload.createdAt || new Date().toISOString()),
  }
}

module.exports = { MAX_MESSAGES, MAX_SNAPSHOT_BYTES, buildConversationSnapshot, normalizeConversationOffer }
