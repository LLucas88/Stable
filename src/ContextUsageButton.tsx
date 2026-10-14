import './styles/context-usage.css'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ContextUsage } from './types'

const number = (value: number) => value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(2))}M` : value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : value.toLocaleString('zh-CN')
const labels: Record<string, string> = {
  messages: '对话消息', 'system tools': '系统工具', 'mcp tools': 'MCP 工具',
  'system prompt': '系统提示词', skills: '技能', 'memory files': '记忆文件',
  'custom agents': '自定义 Agent', agents: 'Agent', 'slash commands': '快捷指令',
}
const categoryLabel = (name: string) => labels[name.toLowerCase()] || name
const colors = ['#2e7be6', '#ef7637', '#18a780', '#e7a400', '#df79a3', '#55a52d', '#9773d2']

export function ContextUsageButton({ conversationId, modelId, running }: { conversationId: string; modelId?: string; running: boolean }) {
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [level, setLevel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const refresh = useRef<() => void>(() => {})
  const tooltipId = useId()
  const panelId = useId()

  useEffect(() => {
    let disposed = false, pending = false
    const update = async () => {
      if (pending || !window.stable.agent.contextUsage) return
      pending = true; setLoading(true)
      try {
        const value = await window.stable.agent.contextUsage(conversationId)
        if (!disposed) { setUsage(value); setFailed(false) }
      } catch { if (!disposed) setFailed(true) }
      finally { pending = false; if (!disposed) setLoading(false) }
    }
    refresh.current = () => { void update() }
    void update()
    const timer = running ? window.setInterval(() => { if (!document.hidden) void update() }, 15000) : undefined
    return () => { disposed = true; window.clearInterval(timer) }
  }, [conversationId, modelId, running])

  useEffect(() => {
    if (!level) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setLevel(0) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [level])

  const known = usage?.usedTokens != null
  const percentage = usage?.percentage ?? 0
  const total = usage?.maxTokens || 0
  const free = known ? Math.max(0, total - usage.usedTokens!) : 0
  const summary = known ? `${number(usage.usedTokens!)} / ${number(total)} (${Math.round(percentage)}%)` : total ? `暂无数据 / ${number(total)}` : '暂无数据'
  const order = Object.keys(labels)
  const rank = (name: string) => { const index = order.indexOf(name.toLowerCase()); return index < 0 ? order.length : index }
  const rows = [...(usage?.categories || [])].sort((a, b) => rank(a.name) - rank(b.name)).map(row => ({ ...row, color: colors[rank(row.name) % colors.length] }))
  const details = usage ? [
    { title: '系统工具', rows: usage.systemTools },
  ].filter(group => group.rows.length) : []

  return <div className="context-usage" ref={root} data-open={level > 0 || undefined} onKeyDown={event => {
    if (event.key === 'Escape' && level) { event.preventDefault(); event.stopPropagation(); setLevel(0); button.current?.focus() }
  }}>
    <button type="button" className="context-usage-button" ref={button} aria-label={`上下文用量：${summary}`} aria-describedby={level ? undefined : tooltipId} aria-expanded={level > 0} aria-controls={panelId} onClick={() => { setLevel(current => current === 2 ? 0 : current + 1); refresh.current() }}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="context-ring-track" cx="12" cy="12" r="8" />
        <circle className="context-ring-value" cx="12" cy="12" r="8" pathLength="100" strokeDasharray={`${Math.min(100, Math.max(0, percentage))} 100`} transform="rotate(-90 12 12)" />
      </svg>
      <span className="context-usage-inline">{summary}</span>
    </button>
    {!level && <span className="context-usage-tooltip" id={tooltipId} role="tooltip">上下文 {summary}{known && ' · 估算'}</span>}
    {level > 0 && <div className="context-usage-panel" id={panelId} role="dialog" aria-label="上下文用量">
      <button className="context-usage-heading" type="button" aria-expanded={level === 2} onClick={() => setLevel(level === 2 ? 1 : 2)}>
        <span>上下文窗口</span><span>{summary}</span>{level === 2 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <div className="context-usage-bar" role="img" aria-label={known ? `已使用 ${Math.round(percentage)}%` : '用量暂无数据'}>
        {known && (rows.length ? rows : [{ name: '已使用', tokens: usage.usedTokens!, color: colors[0] }]).map((row, index) => <span key={`${row.name}-${index}`} style={{ width: `${row.tokens / total * 100}%`, backgroundColor: row.color }} />)}
      </div>
      {level === 2 && <div className="context-usage-details">
        {known && <div className="context-usage-categories">
          {rows.map((row, index) => <div className="context-usage-row" key={`${row.name}-${index}`}><i style={{ backgroundColor: row.color }} aria-hidden="true" /><span>{categoryLabel(row.name)}</span><span title={`${row.tokens.toLocaleString('zh-CN')} Token`}>{number(row.tokens)}</span><span>{(row.tokens / total * 100).toFixed(1)}%</span></div>)}
          <div className="context-usage-row"><i className="context-free" aria-hidden="true" /><span>剩余空间</span><span>{number(free)}</span><span>{(free / total * 100).toFixed(1)}%</span></div>
        </div>}
        {!rows.length && <p className="context-usage-note">分类明细暂无数据。</p>}
        {details.map(group => <details className="context-usage-group" key={group.title}><summary><ChevronRight size={13} /><span>{group.title}</span><span>{group.rows.length} 项</span></summary><ul>{group.rows.map((row, index) => <li key={index}><span title={row.name}>{row.name}</span><span>{number(row.tokens)}</span></li>)}</ul></details>)}
      </div>}
      <p className="context-usage-note" role="status">{loading ? '正在更新…' : failed ? '更新失败，稍后点击重试。' : known ? `SDK 估算 · ${new Date(usage.updatedAt!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新` : '发送消息后显示 SDK 上下文用量。'}</p>
      <div className="context-usage-footer"><button type="button" onClick={() => setLevel(level === 2 ? 1 : 2)}>{level === 2 ? '收起明细' : '查看详细明细'}</button></div>
    </div>}
  </div>
}
