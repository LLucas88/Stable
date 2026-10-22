import type { AgentTraceItem, AgentTraceStatus, MessageItem } from './types'

export interface LiveConversationTurn {
  runId: string
  deliveryId?: string
  continuationOf?: string
  items: AgentTraceItem[]
  status: AgentTraceStatus
  startedAt: number
  endedAt?: number
  streaming?: { id: string; time: number; content: string }
}
export interface ConversationTurn {
  key: string
  messages: MessageItem[]
  live?: LiveConversationTurn
  waiting?: boolean
}

export function clarificationContinuation(messages: MessageItem[], questionId?: string) {
  const previous = messages.at(-1)
  const card = previous?.role === 'assistant' && [...(previous.trace || [])].reverse().find(item => item.clarification?.status === 'waiting')?.clarification
  if (!card || card.id !== questionId) return undefined
  const times = (previous!.trace || []).map(item => item.startedAt ?? item.time).filter(Number.isFinite)
  return { continuationOf: previous!.id, startedAt: times.length ? Math.min(...times) : Date.parse(previous!.createdAt) }
}

// Raw history stays intact for model context, pagination, copying and recovery.
// Only an explicit server link (or the currently submitted card) joins messages.
export function groupConversationTurns(messages: MessageItem[], live?: LiveConversationTurn): ConversationTurn[] {
  const groups: ConversationTurn[] = []
  const join = (continuationOf: string | undefined, next: ConversationTurn) => {
    const last = groups.at(-1)
    const preceding = last?.messages.at(-1)?.role === 'user' ? groups.at(-2) : last
    if (continuationOf && preceding?.messages.at(-1)?.id === continuationOf && preceding.messages.at(-1)?.role === 'assistant') {
      if (last !== preceding) { preceding.messages.push(...groups.pop()!.messages) }
      preceding.messages.push(...next.messages)
      preceding.live = next.live
    } else groups.push(next)
  }
  for (const message of messages) {
    const continuationOf = message.role === 'assistant' ? message.trace?.find(item => item.id === 'task-continuity')?.continuationOf : undefined
    join(continuationOf, { key: message.id, messages: [message] })
  }
  const alreadySaved = live?.deliveryId && messages.some(message => message.trace?.some(item => item.id === 'task-continuity' && item.runId === live.deliveryId))
  if (live && !alreadySaved) join(live.continuationOf, { key: `live:${live.deliveryId || live.runId}`, messages: [], live })
  const last = groups.at(-1)
  const message = last?.messages.at(-1)
  if (last && !last.live && message?.role === 'assistant') last.waiting = !!message.trace?.some(item => item.clarification?.status === 'waiting')
  return groups
}

export function conversationTurnTrace(messages: MessageItem[], live?: LiveConversationTurn): AgentTraceItem[] {
  const trace: AgentTraceItem[] = []
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      trace.push({ id: message.id, runId: '', kind: 'status', title: '', status: 'completed', time: Date.parse(message.createdAt), clarificationReply: message })
      continue
    }
    const last = index === messages.length - 1 && !live
    const question = [...(message.trace || [])].reverse().find(item => item.clarification)?.clarification?.question
    const terminal = [...(message.trace || [])].reverse().find(item => (item.id === 'complete' || item.id === 'runtime') && item.status !== 'running')?.status || 'completed'
    for (const item of message.trace || []) {
      if (item.eventType === 'agent/answer' && item.content?.trim() === question?.trim()) continue
      // Runs reuse tool/status IDs. Namespace display entries, never stored IDs.
      trace.push({ ...item, status: item.status === 'running' ? terminal : item.status, id: `${message.id}:${item.id}` })
    }
    if (!last && message.content.trim() && message.content.trim() !== question?.trim()
      && !message.trace?.some(item => item.eventType === 'agent/answer' && item.content?.trim() === message.content.trim())) {
      trace.push({ id: `${message.id}:answer`, runId: '', kind: 'reasoning', eventType: 'agent/answer', title: '', status: 'completed', content: message.content, time: Date.parse(message.createdAt) })
    }
  }
  if (live) {
    trace.push(...live.items)
    if (live.streaming?.content && !live.items.some(item => item.id === live.streaming!.id)) {
      trace.push({ ...live.streaming, runId: live.runId, kind: 'reasoning', eventType: 'agent/answer', title: '', status: 'running' })
    }
  }
  return trace
}
