import { useEffect, useRef, useState } from 'react'

// Like the running tasks/outbox, unread completion markers belong to this app session.
export function useConversationUnread(conversationId: string, active: boolean) {
  const [unread, setUnread] = useState<ReadonlySet<string>>(() => new Set())
  const [approvalUnread, setApprovalUnread] = useState<ReadonlySet<string>>(() => new Set())
  const pendingApprovals = useRef(new Map<string, Set<string>>())
  const viewed = useRef({ conversationId, active })
  viewed.current = { conversationId, active }

  function isViewing(id: string) {
    return viewed.current.active && viewed.current.conversationId === id
      && document.visibilityState === 'visible' && document.hasFocus()
  }

  function markRead(id: string) {
    setApprovalUnread(current => { const next = new Set(current); next.delete(id); return next })
    setUnread(current => {
      if (!current.has(id)) return current
      const next = new Set(current); next.delete(id); return next
    })
  }

  function markApproval(id: string, request: string, waiting: boolean) {
    const pending = pendingApprovals.current.get(id) || new Set<string>()
    const isNew = !pending.has(request)
    if (waiting) pending.add(request); else pending.delete(request)
    pendingApprovals.current.set(id, pending)
    const viewing = viewed.current.active && viewed.current.conversationId === id
    setApprovalUnread(current => {
      const next = new Set(current)
      if (!pending.size || viewing) next.delete(id)
      else if (waiting && isNew) next.add(id)
      return next
    })
  }

  function clearApprovals(id: string) {
    pendingApprovals.current.delete(id)
    setApprovalUnread(current => { const next = new Set(current); next.delete(id); return next })
  }

  function markCompleted(id: string) {
    clearApprovals(id)
    if (isViewing(id)) { markRead(id); return }
    setUnread(current => new Set(current).add(id))
  }

  useEffect(() => {
    if (active) markRead(conversationId)
    const readVisible = () => { if (isViewing(conversationId)) markRead(conversationId) }
    readVisible()
    window.addEventListener('focus', readVisible)
    document.addEventListener('visibilitychange', readVisible)
    return () => {
      window.removeEventListener('focus', readVisible)
      document.removeEventListener('visibilitychange', readVisible)
    }
  }, [conversationId, active])

  return { unread, approvalUnread, markRead, markCompleted, markApproval, clearApprovals }
}
