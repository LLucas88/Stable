'use strict'

const { redact } = require('./approval-ledger.cjs')

function failedTurn({ id, trace = [], items = [], error = '', state = 'failed', time = Date.now() }) {
  const status = state === 'failed' ? 'failed' : 'cancelled'
  const detail = redact(String(error || (status === 'failed' ? '执行未完成。' : '任务已停止。')))
  const title = state === 'unknown' ? '执行已中断，结果未确认' : status === 'failed' ? '本轮执行失败' : '本轮已停止'
  const content = status === 'failed' ? `${title}：${detail.replace(/\s+/g, ' ').slice(0, 240)}${detail.replace(/\s+/g, ' ').length > 240 ? '…' : ''}` : `${title}。`
  const history = trace.filter(item => item.id !== 'runtime' && item.id !== 'complete').map(item => ({ ...item,
    // Pending tool results are not success or proven tool failures.
    ...(item.status === 'running' ? { status: 'cancelled' } : {}),
  }))
  const texts = new Set(history.filter(item => item.eventType === 'agent/answer').map(item => item.content?.trim()))
  for (const item of items) {
    if (item.type !== 'agentMessage' || !item.text?.trim() || texts.has(item.text.trim())) continue
    texts.add(item.text.trim())
    history.push({ id: `recovered:${item.id}`, runId: id, kind: 'reasoning', eventType: 'agent/answer', title: '已收到的回复', content: item.text, status: 'completed', time: time - 1 })
  }
  history.push({ id: 'runtime', runId: id, kind: 'status', title, detail: detail.slice(0, 8000), status, time })
  return { content, trace: history }
}

module.exports = { failedTurn }
