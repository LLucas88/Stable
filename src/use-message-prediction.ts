import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export function useMessagePrediction({ conversationId, messageId, modelId, eligible, onAccept }: {
  conversationId: string; messageId?: string; modelId?: string; eligible: boolean; onAccept: (text: string) => void
}) {
  const key = JSON.stringify([conversationId, messageId, modelId])
  const [result, setResult] = useState<{ key: string; text: string }>()
  const [dismissed, setDismissed] = useState<string>()
  const [composing, setComposing] = useState(false)
  const heldEnter = useRef(false)
  const consumed = useRef(new Set<string>())
  const blocked = dismissed === key || consumed.current.has(key)
  useEffect(() => {
    if (!eligible || !messageId || blocked || !window.stable.agent.prediction) return
    let disposed = false, started = false
    const requestId = crypto.randomUUID()
    // Let the outbox drain and rapid navigation settle before spending a request.
    const timer = window.setTimeout(() => {
      started = true
      void window.stable.agent.prediction(conversationId, messageId, requestId).then(value => {
        if (!disposed && value?.conversationId === conversationId && value.sourceMessageId === messageId) setResult({ key, text: value.suggestion })
      }).catch(() => { /* Optional predictions never block the composer. */ })
    }, 300)
    return () => {
      disposed = true; window.clearTimeout(timer)
      if (started) void window.stable.agent.cancelPrediction?.(requestId).catch(() => {})
    }
  }, [eligible, conversationId, messageId, key, blocked])
  useEffect(() => { setComposing(false); heldEnter.current = false }, [conversationId])
  const text = eligible && !blocked && !composing && result?.key === key ? result.text : ''
  function dismiss() {
    consumed.current.add(key)
    if (consumed.current.size > 128) consumed.current.delete(consumed.current.values().next().value!)
    setDismissed(key)
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.repeat && heldEnter.current) { event.preventDefault(); return true }
    // IME confirmation must not fall through to the composer's send handler.
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing) return event.key === 'Enter'
    if (!text) return false
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); return true }
    if (!['Tab', 'ArrowRight', 'Enter'].includes(event.key) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false
    event.preventDefault()
    heldEnter.current = event.key === 'Enter'
    const input = event.currentTarget
    onAccept(text); dismiss()
    window.requestAnimationFrame(() => input.setSelectionRange(text.length, text.length))
    return true
  }
  return { text, dismiss, handleKeyDown, onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false), onKeyUp: () => { heldEnter.current = false }, onBlur: () => { heldEnter.current = false; setComposing(false) } }
}
