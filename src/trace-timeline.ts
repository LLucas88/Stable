import type { AgentTraceItem, AgentTraceStatus } from './types'

export function savedTraceStatus(items: AgentTraceItem[]): AgentTraceStatus {
  const terminal = [...items].reverse().find((item) => (item.id === 'complete' || item.id === 'runtime') && item.status !== 'running')
  return terminal?.status || 'completed'
}

export function traceItemStatus(item: AgentTraceItem, runStatus: AgentTraceStatus): AgentTraceStatus {
  return item.status === 'running' && runStatus !== 'running' ? runStatus : item.status
}

// Only public commentary, real actions and actionable failures belong in the timeline.
// Generic model lifecycle messages are not a thinking summary.
export function buildTraceTimeline(items: AgentTraceItem[], finalContent = ''): AgentTraceItem[] {
  const finalText = finalContent.trim()
  return items.filter((item) => {
    if (item.eventType === 'agent/answer') return Boolean(item.content?.trim()) && item.content!.trim() !== finalText
    if (item.kind === 'tool' || item.kind === 'approval') return true
    if (item.entity === 'agent' && item.parentSessionId && item.eventType !== 'agent/descriptor') return true
    return item.status === 'failed' || item.status === 'cancelled'
  }).sort((a, b) => (a.startedAt ?? a.time) - (b.startedAt ?? b.time)
    || Number(a.id === 'runtime') - Number(b.id === 'runtime'))
}

export function traceActionLabel(item: AgentTraceItem): string {
  if (item.kind !== 'tool') return item.title
  const name = item.toolName || item.title.replace(/^使用工具\s*/, '')
  if (/^(pwsh|powershell|bash|shell|exec_command)$/i.test(name)) return '运行了命令'
  if (/^(read|read_file)$/i.test(name)) return '读取了文件'
  if (/^(glob|grep|rg|search)$/i.test(name)) return '搜索了文件'
  return `调用了 ${name}`
}
