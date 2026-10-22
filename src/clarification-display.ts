import type { ClarificationResponse, MessageItem } from './types'

// Preserve model-only instructions in stored history, including older conversations.
export function clarificationDisplay(content: string): { question: string; answer: string } | undefined {
  const choice = /^【(?:用户选择|20 秒未操作，模型自主选择推荐路线|用户委托模型选择推荐路线)】\r?\n问题：([\s\S]*?)\r?\n路线：([\s\S]*?)\r?\n处理提示：[\s\S]*$/.exec(content)
  if (choice) return { question: choice[1], answer: choice[2] }
  const custom = /^针对“([\s\S]*?)”的补充：\r?\n([\s\S]+)$/.exec(content)
  if (custom) return { question: custom[1], answer: custom[2] }
}

// Match the main process format so the pending bubble becomes the saved bubble.
export function clarificationPendingContent(prompt: string, response: ClarificationResponse | undefined, messages: MessageItem[]): string {
  const card = [...(messages.at(-1)?.trace || [])].reverse().find(item => item.clarification?.id === response?.id)?.clarification
  if (!response || !card) return prompt
  if (response.source === 'custom') return `针对“${card.question}”的补充：\n${response.text?.trim() || prompt}`
  const option = card.options[response.option ?? -1]
  return option ? `【用户选择】\n问题：${card.question}\n路线：${option.label}\n处理提示：${option.description}` : prompt
}
export function isClarificationQuestion(message: MessageItem): boolean {
  const card = [...(message.trace || [])].reverse().find(item => item.clarification)?.clarification
  return message.role === 'assistant' && !!card && message.content.trim() === card.question.trim()
}
export function isClarificationOnly(message: MessageItem): boolean {
  const card = [...(message.trace || [])].reverse().find(item => item.clarification)?.clarification
  return isClarificationQuestion(message)
    && !message.trace?.some(item => item.kind === 'tool' || item.kind === 'approval' || item.status === 'failed' || (item.eventType === 'agent/answer' && !!item.content?.trim() && item.content.trim() !== card?.question.trim()))
}
