import { useEffect, useRef, useState } from 'react'
import type { AgentTraceItem } from './types'

export function ApprovalComposer({ item, onDecision }: { item: AgentTraceItem; onDecision: (decision: 'deny' | 'once' | 'conversation') => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const firstButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstButton.current?.focus() }, [item.id])
  async function decide(decision: 'deny' | 'once' | 'conversation') {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try { await onDecision(decision) } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="composer-box composer-approval" role="group" aria-label={`权限审批：${item.toolName || item.title}`} aria-busy={busy}>
    <div className="approval-purpose"><strong>此次申请权限用于</strong><p>{item.reason || item.detail || item.title}</p><details><summary>查看具体操作与范围</summary><pre>{item.toolName || item.detail || '未提供具体操作'}</pre><p>{item.approvalCategory || '仅此请求'}</p></details></div>
    <button ref={firstButton} type="button" disabled={busy} onClick={() => void decide('deny')} title={item.reason || item.detail}>不允许</button>
    <button type="button" disabled={busy} onClick={() => void decide('once')} title={item.toolName || item.title}>允许一次</button>
    <button type="button" disabled={busy} onClick={() => void decide('conversation')} title={`仅本对话有效30天，参数或文件变化后重新确认：${item.approvalCategory || '相同命令、参数和访问范围'}`}>在此对话记住此操作</button>
  </div>
}
