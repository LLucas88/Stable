import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Globe2, ListTree, MoreHorizontal, Wrench } from 'lucide-react'
import { ChapterDirectory } from './AnswerTools'
import { ConversationWending } from './ConversationWending'
import type { AnswerChapter } from './types'
import './styles/conversation-tools.css'

export function ConversationTools({ conversationId, running, active, autoOpenWending, chapters, chapterError, onBrowser, onJump, onChange }: {
  conversationId: string; running: boolean; active: boolean; autoOpenWending: boolean
  chapters: AnswerChapter[]; chapterError: string; onBrowser: () => void
  onJump: (chapter: AnswerChapter) => Promise<void>; onChange: (messageId: string, title: string | null) => Promise<void>
}) {
  const [view, setView] = useState<'menu' | 'chapters' | null>(null)
  const [loginRequest, setLoginRequest] = useState(0)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const restoreFocus = () => trigger.current?.focus()
  const close = () => { setView(null); restoreFocus() }
  useEffect(() => { if (!active) setView(null) }, [active])
  useEffect(() => {
    if (!view) return
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setView(null) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [view])
  return <div className="conversation-tools" ref={root} onBlur={event => { if (view && !event.currentTarget.contains(event.relatedTarget as Node)) setView(null) }} onKeyDown={event => {
    if (!view) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (view === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
      items[next]?.focus()
    }
  }}>
    <button ref={trigger} type="button" className="conversation-tools-trigger" aria-label="对话功能" title="对话功能" aria-haspopup="menu" aria-expanded={Boolean(view)} aria-controls={id} onClick={() => setView(current => current ? null : 'menu')}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {view && <div ref={panel} id={id} className="conversation-tools-panel" data-view={view} role={view === 'menu' ? 'menu' : 'dialog'} aria-label={view === 'menu' ? '对话功能' : '章节目录'}>
      {view === 'menu' ? <>
        <button type="button" role="menuitem" onClick={() => { close(); onBrowser() }}><Globe2 size={16} aria-hidden="true" /><span>浏览器</span></button>
        <button type="button" role="menuitem" onClick={() => setView('chapters')}><ListTree size={16} aria-hidden="true" /><span>章节{chapters.length ? ` ${chapters.length}` : ''}</span></button>
        <button type="button" role="menuitem" disabled={running} title={running ? '停止此任务后可修改登录绑定' : '登录状态全局共用，品牌按对话保存'} onClick={() => { setView(null); setLoginRequest(value => value + 1) }}><Wrench size={16} aria-hidden="true" /><span>问鼎</span></button>
      </> : <>
        <button type="button" className="conversation-tools-back" aria-label="返回对话功能" onClick={() => setView('menu')}><ArrowLeft size={15} aria-hidden="true" /><span>返回</span></button>
        <ChapterDirectory embedded onDismiss={close} chapters={chapters} error={chapterError} onChange={onChange} onJump={onJump} />
      </>}
    </div>}
    <ConversationWending conversationId={conversationId} running={running} active={active} autoOpen={autoOpenWending} hideTrigger openRequest={loginRequest} onClose={restoreFocus} />
  </div>
}
