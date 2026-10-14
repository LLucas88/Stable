import type { AgentTraceItem, AgentTraceStatus } from './types'

export function savedTraceStatus(items: AgentTraceItem[]): AgentTraceStatus {
  const terminal = [...items].reverse().find((item) => (item.id === 'complete' || item.id === 'runtime') && item.status !== 'running')
  return terminal?.status || 'completed'
}

export function traceItemStatus(item: AgentTraceItem, runStatus: AgentTraceStatus): AgentTraceStatus {
  return item.status === 'running' && runStatus !== 'running' ? runStatus : item.status
}

// UI filtering only: this is not an authorization or shell-safety decision.
function toolName(item: AgentTraceItem) {
  return (item.toolName || item.title.replace(/^使用工具\s*/, '')).replace(/^mcp__.*__/, '')
}
function toolArgs(item: AgentTraceItem): Record<string, unknown> {
  const input = item.inputDetail || item.detail || ''
  try { const value = JSON.parse(input); return value && typeof value === 'object' ? value : {} } catch {
    // Old traces may contain truncated JSON; retain a complete path field if present.
    const match = input.match(/"(file_path|notebook_path|path)"\s*:\s*("(?:\\.|[^"\\])*")/)
    try { return match ? { [match[1]]: JSON.parse(match[2]) } : {} } catch { return {} }
  }
}
export function traceCommand(item: AgentTraceItem): string {
  if (item.kind !== 'tool') return item.reason || item.title
  const name = toolName(item), args = toolArgs(item)
  if (typeof args.command === 'string') return args.command
  if (/^(bash|pwsh|powershell|shell|exec_command|stable_exec)$/i.test(name)) return item.inputDetail || item.detail || name
  const target = args.file_path || args.notebook_path || args.path || args.output_path || args.outputPath
  return [name, args.action, typeof target === 'string' ? target : ''].filter(Boolean).join(' ')
}

export function commandChangesFiles(command: string): boolean {
  // Keep quoted strings out of shell syntax checks, including examples printed by echo.
  const shell = command.replace(/'(?:[^']*)'|"(?:\\.|[^"\\])*"/g, 'FILE')
  if (/(^|[\s;|&])(?:\d*)>{1,2}\s*(?![&]|\/dev\/null(?:\s|$)|NUL(?:\s|$))[^\s>]/i.test(shell)) return true
  if (/(?:^|[;&|\n])\s*(?:sudo\s+)?(?:[\w./-]*\/)?(?:rm|mv|cp|touch|mkdir|rmdir|truncate|install|tee|unlink|Remove-Item|Move-Item|Copy-Item|New-Item|Set-Content|Add-Content|Out-File)\b/i.test(shell)) return true
  if (/(?:^|[;&|\n])\s*(?:sed|perl)\b[^;\n]*\s-[a-z]*i\b/.test(shell)) return true
  if (/(?:^|[;&|\n])\s*curl\b[^;\n]*\s(?:-o|-O|--output)\b/.test(shell)) return true
  if (/(?:^|[;&|\n])\s*(?:python[\d.]*|node)\b/.test(shell)) {
    return /\.(?:write_text|write_bytes|to_csv|to_excel|to_html|savefig|writeFileSync|writeFile|appendFileSync|appendFile|unlinkSync|unlink|renameSync|rename)\s*\(|\bopen\s*\([^\n]*?,\s*(?:mode\s*=\s*)?['"][wax][^'"]*['"]|\bshutil\.(?:copy|copy2|move|rmtree)\s*\(/.test(command)
  }
  return false
}
export function changesFiles(item: AgentTraceItem): boolean {
  if (item.kind !== 'tool') return false
  const name = toolName(item), args = toolArgs(item)
  if (/^(write|edit|notebookedit|write_file|edit_file|apply_patch|delete_file|move_file|rename_file|create_file|stable_skill_install)$/i.test(name)) return true
  if (name === 'stable_excel') return ['create', 'update'].includes(String(args.action))
  return /^(bash|pwsh|powershell|shell|exec_command|stable_exec)$/i.test(name) && commandChangesFiles(traceCommand(item))
}

export function buildTraceTimeline(items: AgentTraceItem[], finalContent = ''): AgentTraceItem[] {
  const finalText = finalContent.trim()
  return items.filter(item => {
    if (item.eventType === 'agent/answer') return Boolean(item.content?.trim()) && item.content!.trim() !== finalText
    if (item.status === 'failed' && item.kind !== 'tool') return true
    if (item.kind === 'approval') return item.status === 'running' && !item.automaticApproval
    if (item.kind === 'tool') return changesFiles(item)
    return item.id === 'runtime' && item.status === 'cancelled'
  }).sort((a, b) => (a.startedAt ?? a.time) - (b.startedAt ?? b.time)
    || Number(a.id === 'runtime') - Number(b.id === 'runtime'))
}

export type TraceTimelineEntry =
  | { kind: 'item'; id: string; item: AgentTraceItem }
  | { kind: 'group'; id: string; label: string; items: AgentTraceItem[] }

function toolCategory(item: AgentTraceItem): string {
  const name = toolName(item).toLowerCase()
  if (/^(edit|edit_file|apply_patch|notebookedit)$/.test(name)) return '编辑文件'
  if (/^(write|write_file|create_file)$/.test(name)) return '写入文件'
  if (/^(move_file|rename_file)$/.test(name)) return '移动文件'
  if (name === 'delete_file') return '删除文件'
  if (/^(bash|pwsh|powershell|shell|exec_command|stable_exec)$/.test(name)) return '运行命令'
  if (name === 'stable_excel') return '修改表格'
  return toolName(item)
}

// Public text and approvals/errors are boundaries; never hide them in tool groups.
export function groupTraceTimeline(items: AgentTraceItem[]): TraceTimelineEntry[] {
  const entries: TraceTimelineEntry[] = []
  const groups = new Map<string, Extract<TraceTimelineEntry, { kind: 'group' }>>()
  for (const item of items) {
    if (item.kind !== 'tool' || item.eventType === 'agent/answer') {
      groups.clear()
      entries.push({ kind: 'item', id: item.id, item })
      continue
    }
    const label = toolCategory(item)
    let group = groups.get(label)
    if (!group) {
      group = { kind: 'group', id: `tools:${item.id}`, label, items: [] }
      groups.set(label, group)
      entries.push(group)
    }
    group.items.push(item)
  }
  return entries
}
