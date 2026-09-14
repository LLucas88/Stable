import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import type { AgentTraceItem } from './types'

export function ApprovalComposer({ item, onDecision }: { item: AgentTraceItem; onDecision: (decision: 'deny' | 'once' | 'conversation') => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const firstButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstButton.current?.focus() }, [item.id])
  async function decide(decision: 'deny' | 'once' | 'conversation') {
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError('')
    try { await onDecision(decision) } catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败，请重试') } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="composer-box composer-approval" role="group" aria-label={`权限审批：${item.toolName || item.title}`} aria-busy={busy}>
    <div className="approval-purpose"><span className="approval-tool"><Terminal size={16}/> {item.toolName === '修改文件' ? '文件' : '终端'}</span><p><strong>{item.reason || item.title}</strong></p><pre>{item.toolName || item.detail || '未提供具体操作'}</pre></div>
    {error && <p role="alert">{error}</p>}
    <div className="approval-actions">
      <button ref={firstButton} type="button" disabled={busy} onClick={() => void decide('deny')}>拒绝</button>
      <button className="approval-allow" type="button" disabled={busy} onClick={() => void decide('once')}>{busy ? '处理中…' : '允许一次'}</button>
      <button type="button" disabled={busy} onClick={() => void decide('conversation')}>本次对话允许</button>
    </div>
  </div>
}
