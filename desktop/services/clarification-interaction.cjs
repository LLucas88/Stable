'use strict'
const { pendingClarification } = require('./clarification.cjs')
function currentCard(store, conversationId, id) {
  const card = pendingClarification(store.listMessages(conversationId))
  if (!card || !id || card.id !== id) throw new Error('这个问题已经结束，请刷新对话。')
  return card
}
// Compatibility for older renderers: permanently disable their countdown.
function timerState(store, conversationId, id, action) {
  currentCard(store, conversationId, id)
  if (!['start', 'interact'].includes(action)) throw new Error('无效的提问交互。')
  return { id, deadline: null, interacted: true }
}
function resolveResponse(store, conversationId, response) {
  const card = currentCard(store, conversationId, response?.id)
  if (response.source === 'custom') {
    const text = typeof response.text === 'string' ? response.text.trim() : ''
    if (!text || text.length > 10000) throw new Error('请填写回答（最多 10000 字）。')
    return `针对“${card.question}”的补充：\n${text}`
  }
  if (response.source !== 'choice') throw new Error('请提交回答后继续，关闭或等待不会自动执行。')
  const index = response.option
  if (!Number.isInteger(index) || index < 0 || index > 1 || !card.options?.[index]) throw new Error('请选择有效的回答。')
  const option = card.options[index]
  return `【用户选择】\n问题：${card.question}\n路线：${option.label}\n处理提示：${option.description}`
}
module.exports = { timerState, resolveResponse }
