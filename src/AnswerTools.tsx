import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, GitFork, ListTree, Pencil, Pin, PinOff, X } from 'lucide-react'
import type { AnswerChapter, MessageItem } from './types'
import './styles/answer-tools.css'
import { ToolTrace } from './ToolTrace'

function Hint({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  const id = useId()
  return <span className="answer-hint" aria-describedby={id}>{children}<span className="answer-tooltip" role="tooltip" id={id}>{label}{detail && <small>{detail}</small>}</span></span>
}

export function relativeAnswerTime(createdAt: string, now = Date.now()) {
  const time = Date.parse(createdAt)
  if (!Number.isFinite(time)) return '时间未知'
  const seconds = Math.max(0, Math.floor((now - time) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

export function AnswerToolbar({ message, chapter, onFork, onPin }: { message: MessageItem; chapter?: AnswerChapter; onFork: () => Promise<void>; onPin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer) } }, [copied])
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await work() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const time = new Date(message.createdAt)
  const fullTime = Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '时间未知'
  return <>
    <div className="answer-toolbar" role="group" aria-label="回答操作">
      <Hint label={copied ? '已复制' : '复制'}><button type="button" disabled={busy || !message.content} aria-label="复制回答" onClick={() => void run(async () => { await window.stable.clipboard.writeText(message.content); setCopied(true) })}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></Hint>
      <Hint label="从此处分支" detail="复制截至此处的历史到新对话，保留原对话。"><button type="button" disabled={busy} aria-label="从此处分支" onClick={() => void run(onFork)}><GitFork size={16} /></button></Hint>
      <Hint label={chapter ? '取消固定章节' : '固定为章节'}><button type="button" disabled={busy} aria-pressed={Boolean(chapter)} aria-label={chapter ? '取消固定章节' : '固定为章节'} onClick={() => void run(onPin)}>{chapter ? <PinOff size={16} /> : <Pin size={16} />}</button></Hint>
      <ToolTrace items={message.trace || []} />
      <Hint label={fullTime}><time tabIndex={0} dateTime={Number.isFinite(time.getTime()) ? message.createdAt : undefined} aria-label={fullTime}>{relativeAnswerTime(message.createdAt, now)}</time></Hint>
    </div>
    {error && <p className="answer-action-error" role="alert">{error}</p>}
  </>
}

export function ChapterDirectory({ chapters, error, onJump, onChange }: { chapters: AnswerChapter[]; error: string; onJump: (chapter: AnswerChapter) => Promise<void>; onChange: (messageId: string, title: string | null) => Promise<void> }) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(''), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [actionError, setActionError] = useState('')
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setActionError('')
    try { await work() } catch (err) { setActionError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return <div className="chapter-directory" ref={root}>
    <button ref={trigger} type="button" className="chapter-trigger" aria-label="章节目录" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><ListTree size={17} /><span>章节{chapters.length ? ` ${chapters.length}` : ''}</span></button>
    {open && <section className="chapter-panel" id={id} aria-label="章节目录">
      <strong>章节目录</strong>
      {!chapters.length && <p>在回答下方点击图钉，将回答固定为章节。</p>}
      <ol>{chapters.map(chapter => <li key={chapter.messageId}>
        {editing === chapter.messageId ? <form onSubmit={event => { event.preventDefault(); void run(async () => { await onChange(chapter.messageId, title); setEditing('') }) }}>
          <input aria-label="章节名称" autoFocus maxLength={80} required value={title} onChange={event => setTitle(event.target.value)} />
          <button type="submit" aria-label="保存章节名称" disabled={busy || !title.trim()}><Check size={15} /></button><button type="button" aria-label="取消重命名" onClick={() => setEditing('')}><X size={15} /></button>
        </form> : <><button type="button" className="chapter-jump" disabled={busy} onClick={() => void run(async () => { await onJump(chapter); setOpen(false) })}>{chapter.title}</button><button type="button" aria-label={`重命名章节 ${chapter.title}`} disabled={busy} onClick={() => { setEditing(chapter.messageId); setTitle(chapter.title) }}><Pencil size={14} /></button><button type="button" aria-label={`取消固定章节 ${chapter.title}`} disabled={busy} onClick={() => void run(() => onChange(chapter.messageId, null))}><PinOff size={14} /></button></>}
      </li>)}</ol>
      {(error || actionError) && <p role="alert">{actionError || error}</p>}
    </section>}
  </div>
}
