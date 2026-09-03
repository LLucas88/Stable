import { useEffect, useRef, useState } from 'react'

// Like the running tasks/outbox, unread completion markers belong to this app session.
export function useConversationUnread(conversationId: string, active: boolean) {
  const [unread, setUnread] = useState<ReadonlySet<string>>(() => new Set())
  const viewed = useRef({ conversationId, active })
  viewed.current = { conversationId, active }

  function isViewing(id: string) {
    return viewed.current.active && viewed.current.conversationId === id
      && document.visibilityState === 'visible' && document.hasFocus()
  }

  function markRead(id: string) {
    setUnread(current => {
      if (!current.has(id)) return current
      const next = new Set(current); next.delete(id); return next
    })
  }

  function markCompleted(id: string) {
    if (isViewing(id)) { markRead(id); return }
    setUnread(current => new Set(current).add(id))
  }

  useEffect(() => {
    const readVisible = () => { if (isViewing(conversationId)) markRead(conversationId) }
    readVisible()
    window.addEventListener('focus', readVisible)
    document.addEventListener('visibilitychange', readVisible)
    return () => {
      window.removeEventListener('focus', readVisible)
      document.removeEventListener('visibilitychange', readVisible)
    }
  }, [conversationId, active])

  return { unread, markRead, markCompleted }
}
