'use strict'
const { pendingClarification } = require('./clarification.cjs')
const COUNTDOWN_MS = 20_000
function currentCard(store, conversationId, id) {
  const card = pendingClarification(store.listMessages(conversationId))
  if (!card || !id || card.id !== id) throw new Error('这个问题已经结束，请刷新对话。')
  return card
}
function timerState(store, conversationId, id, action, now = Date.now()) {
  currentCard(store, conversationId, id)
  if (!['start', 'interact'].includes(action)) throw new Error('无效的提问交互。')
  const key = `clarification-timer:${conversationId}`
  const saved = store.getSetting(key)
  const state = saved?.id === id ? saved : { id, deadline: now + COUNTDOWN_MS, interacted: false }
  if (action === 'interact') state.interacted = true
  store.setSetting(key, state)
  return state
}
function resolveResponse(store, conversationId, response, now = Date.now()) {
  const card = currentCard(store, conversationId, response?.id)
  const source = response.source
  if (!['choice', 'custom', 'timeout', 'skip', 'close'].includes(source)) throw new Error('无效的回答方式。')
  if (source === 'timeout') {
    const timer = store.getSetting(`clarification-timer:${conversationId}`)
    if (timer?.id !== card.id || timer.interacted || !Number.isFinite(timer.deadline) || now < timer.deadline) throw new Error('倒计时已取消或尚未结束，请手动发送。')
  }
  let prompt
  if (source === 'custom') {
    const text = typeof response.text === 'string' ? response.text.trim() : ''
    if (!text || text.length > 10000) throw new Error('请填写回答（最多 10000 字）。')
    prompt = `针对“${card.question}”的补充：\n${text}`
  } else {
    const index = source === 'choice' ? response.option : 0
    if (!Number.isInteger(index) || index < 0 || index > 1 || !card.options?.[index]) throw new Error('请选择有效的回答。')
    const option = card.options[index]
    const label = source === 'choice' ? '用户选择' : source === 'timeout' ? '20 秒未操作，模型自主选择推荐路线' : '用户委托模型选择推荐路线'
    prompt = `【${label}】\n问题：${card.question}\n路线：${option.label}\n处理提示：${option.description}`
    if (source !== 'choice') prompt += '\n这是模型的默认假设，不代表用户确认事实或授予操作权限。按现有证据推进，缺失信息不得编造。'
  }
  // A failed dispatch must never restart an automatic submission on remount.
  timerState(store, conversationId, card.id, 'interact', now)
  return prompt
}
module.exports = { COUNTDOWN_MS, timerState, resolveResponse }
