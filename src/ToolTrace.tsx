import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ListChecks, X } from 'lucide-react'
import type { AgentTraceItem, AgentTraceStatus } from './types'
import { savedTraceStatus } from './trace-timeline'
import './styles/tool-trace.css'

export function ToolTrace({ items, status = savedTraceStatus(items) }: { items: AgentTraceItem[]; status?: AgentTraceStatus }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const tools = items.filter(item => item.kind === 'tool').sort((a, b) => (a.startedAt ?? a.time) - (b.startedAt ?? b.time))
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    const timer = status === 'running' ? setInterval(() => setNow(Date.now()), 250) : undefined
    return () => clearInterval(timer)
  }, [open, status])
  function close() { setOpen(false); trigger.current?.focus() }
  return <>
    <button ref={trigger} className="tool-trace-button" type="button" aria-label="Trace：工具调用记录" title="Trace：工具调用记录" aria-haspopup="dialog" onClick={() => { setNow(Date.now()); setOpen(true) }}><ListChecks size={16} aria-hidden="true" /></button>
    {open && createPortal(<dialog ref={dialog} className="tool-trace-dialog" aria-label="工具调用 Trace" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section><header><strong>Trace</strong><span>{tools.length} 次调用 · {tools.filter(item => item.status === 'failed').length} 次工具失败 · {status === 'completed' ? '任务已完成' : status === 'running' ? '任务进行中' : status === 'cancelled' ? '任务已取消' : '任务未完成'}</span><button type="button" aria-label="关闭 Trace" onClick={close}><X size={18} /></button></header>
        {tools.some(item => item.status === 'failed') && <p className="tool-trace-note">以下保留每次调用的原始结果。后续修复成功不会抹去失败记录；任务完成也不代表每个失败步骤都已恢复。展开记录可查看输入和错误。</p>}
        <div className="tool-trace-list">
          {!tools.length && <p>本轮没有工具调用记录。</p>}
          {tools.map((item, index) => {
            const running = item.status === 'running' && status === 'running'
            const label = running ? '运行中' : item.status === 'completed' ? '执行成功' : item.status === 'failed' ? '执行失败' : item.status === 'cancelled' || status === 'cancelled' ? '已取消' : '已结束'
            const duration = item.startedAt === undefined || item.status === 'running' && !running ? '耗时未记录' : `${(Math.max(0, (running ? now : item.time) - item.startedAt) / 1000).toFixed(1)} 秒`
            const result = item.status !== 'running' && item.detail && item.detail !== item.inputDetail ? item.detail : running ? '等待执行结果…' : '没有返回结果内容。'
            return <details key={item.id} className="tool-trace-row" data-status={item.status}>
              <summary><span>{index + 1}. {item.toolName || item.title}</span><time>{duration}</time><span>{label}</span><ChevronRight className="tool-trace-chevron" size={14} /></summary>
              {item.inputDetail && <><strong>调用输入</strong><pre>{item.inputDetail}</pre></>}
              <strong>执行结果</strong><pre>{result}</pre>
            </details>
          })}
        </div>
      </section>
    </dialog>, document.body)}
  </>
}
