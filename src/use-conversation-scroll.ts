import { useCallback, useLayoutEffect, useRef, useState } from 'react'

type Position = { top: number; following: boolean; anchor?: string; seq?: number; offset?: number }
export function useConversationScroll(conversationId: string, revision: unknown, active: boolean, loadAnchor?: (seq: number) => Promise<void>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true), restoring = useRef(false)
  const positions = useRef(new Map<string, Position>())
  const loader = useRef(loadAnchor); loader.current = loadAnchor
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    following.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: 'auto' })
    setAwayFromBottom(false)
  }, [])
  useLayoutEffect(() => {
    let cancelled = false
    restoring.current = true
    void (async () => {
      const saved = positions.current.get(conversationId) || await window.stable.agent.viewState?.(conversationId).catch(() => undefined)
      if (cancelled) return
      following.current = saved?.following !== false
      if (saved?.following === false) {
        if (saved.seq) await loader.current?.(saved.seq)
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        if (cancelled) return
        const element = scrollRef.current
        if (element) {
          const anchor = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.dataset.messageId === saved.anchor)
          if (anchor) {
            let previous = Number.NaN, stableFrames = 0
            for (let frame = 0; frame < 45 && stableFrames < 4; frame++) {
              if (cancelled || !anchor.isConnected) return
              const position = element.scrollTop + anchor.getBoundingClientRect().top - element.getBoundingClientRect().top
              element.scrollTop = position - (saved.offset || 0)
              stableFrames = Math.abs(position - previous) < .5 ? stableFrames + 1 : 0
              previous = position
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            }
          } else element.scrollTop = saved.top || 0
          if (cancelled) return
          positions.current.set(conversationId, { ...saved, top: element.scrollTop, following: false })
          setAwayFromBottom(element.scrollHeight - element.scrollTop - element.clientHeight > 64)
        }
      } else scrollToBottom()
    })().catch(() => { if (!cancelled) scrollToBottom() }).finally(() => { if (!cancelled) restoring.current = false })
    return () => { cancelled = true }
  }, [conversationId, active, scrollToBottom])
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => { const value = positions.current.get(conversationId); if (value) void window.stable.agent.viewState?.(conversationId, value).catch(() => {}) }
    const measure = () => {
      if (restoring.current) return
      const away = element.scrollHeight - element.scrollTop - element.clientHeight > 64
      following.current = !away; setAwayFromBottom(away)
      const top = element.getBoundingClientRect().top
      const anchor = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.getBoundingClientRect().bottom > top)
      positions.current.set(conversationId, { top: element.scrollTop, following: !away, anchor: anchor?.dataset.messageId, seq: Number(anchor?.dataset.messageSeq) || undefined, offset: anchor ? anchor.getBoundingClientRect().top - top : 0 })
      clearTimeout(timer); timer = setTimeout(save, 250)
    }
    const resize = () => {
      if (restoring.current) return
      if (following.current) scrollToBottom()
      else {
        const saved = positions.current.get(conversationId)
        const anchor = saved?.anchor && [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.dataset.messageId === saved.anchor)
        if (anchor) element.scrollTop += anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - (saved.offset || 0)
        setAwayFromBottom(element.scrollHeight - element.scrollTop - element.clientHeight > 64)
      }
    }
    element.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => { clearTimeout(timer); save(); element.removeEventListener('scroll', measure); observer.disconnect() }
  }, [conversationId, scrollToBottom])
  useLayoutEffect(() => { if (active && following.current && !restoring.current) scrollToBottom() }, [revision, active, scrollToBottom])
  return { scrollRef, awayFromBottom, scrollToBottom }
}
