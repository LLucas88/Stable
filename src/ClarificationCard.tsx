import { useEffect, useId, useRef, useState } from 'react'
import { MessageCircleQuestion, X } from 'lucide-react'
import type { ClarificationQuestion, ClarificationResponse } from './types'

export function ClarificationCard({ question, conversationId, onSend }: {
  question: ClarificationQuestion
  conversationId: string
  onSend: (response: ClarificationResponse) => Promise<void>
}) {
  const titleId = useId(), hintId = useId()
  const [selected, setSelected] = useState(0)
  const [custom, setCustom] = useState('')
  const [seconds, setSeconds] = useState<number | null>(20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const touched = useRef(false), submitting = useRef(false)
  const sendRef = useRef(onSend)
  sendRef.current = onSend
  const submitRef = useRef<(source: ClarificationResponse['source']) => void>(() => {})

  function interact() {
    if (touched.current || submitting.current) return
    touched.current = true
    setSeconds(null)
    void window.stable.agent.clarificationTimer(conversationId, question.id, 'interact').catch(err => setError(String(err.message || err)))
  }
  async function submit(source: ClarificationResponse['source']) {
    if (submitting.current || (source === 'timeout' && touched.current)) return
    if (source === 'custom' && !custom.trim()) return
    submitting.current = true
    touched.current = true
    setBusy(true); setSeconds(null); setError('')
    try {
      if (source !== 'timeout') await window.stable.agent.clarificationTimer(conversationId, question.id, 'interact')
      await sendRef.current({ id: question.id, source, ...(source === 'choice' ? { option: selected } : source === 'custom' ? { text: custom.trim() } : {}) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      submitting.current = false
      setBusy(false)
    }
  }
  submitRef.current = source => { void submit(source) }
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined
    void window.stable.agent.clarificationTimer(conversationId, question.id, 'start').then(state => {
      if (disposed) return
      if (state.interacted || touched.current) { touched.current = true; setSeconds(null); return }
      const tick = () => {
        if (disposed || touched.current || submitting.current) return
        const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000))
        setSeconds(remaining)
        if (!remaining) submitRef.current('timeout')
      }
      tick(); timer = setInterval(tick, 200)
    }).catch(err => { if (!disposed) { touched.current = true; setSeconds(null); setError(String(err.message || err)) } })
    return () => { disposed = true; clearInterval(timer) }
  }, [conversationId, question.id])

  return <section className="clarification-card" aria-labelledby={titleId} aria-describedby={hintId}
    onPointerDownCapture={interact} onClickCapture={interact} onFocusCapture={interact} onKeyDownCapture={interact}>
    <div className="clarification-card-heading"><span><MessageCircleQuestion size={18} aria-hidden="true" />问题</span><button type="button" aria-label="关闭问题并由模型继续" disabled={busy} onClick={() => void submit('close')}><X size={17} /></button></div>
    <h3 id={titleId}>{question.question}</h3>
    {question.hint && <p id={hintId} className="clarification-hint">{question.hint}</p>}
    <div className="clarification-options" role="radiogroup" aria-label="选择回答">
      {question.options.slice(0, 2).map((option, index) => <label className="clarification-option" data-selected={selected === index || undefined} key={index}>
        <input type="radio" name={titleId} checked={selected === index} disabled={busy} onChange={() => { interact(); setSelected(index) }} />
        <span className="clarification-number" aria-hidden="true">{index + 1}</span><span><strong>{option.label}{index === 0 && <em>推荐</em>}</strong><small>{option.description}</small></span>
      </label>)}
      <label className="clarification-option clarification-custom" data-selected={selected === 2 || undefined}>
        <input type="radio" name={titleId} checked={selected === 2} disabled={busy} onChange={() => { interact(); setSelected(2) }} />
        <span className="clarification-number" aria-hidden="true">3</span><span><strong>我来补充</strong><small>用自己的话说明需求或调整上面的路线</small></span>
      </label>
    </div>
    <div className="clarification-response">
      <textarea aria-label="自定义回答" placeholder="也可以写下你的回答…" maxLength={10000} rows={1} value={custom} disabled={busy}
        onFocus={() => setSelected(2)} onChange={event => { interact(); setSelected(2); setCustom(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit('custom') } }} />
      <div className="clarification-buttons"><button type="button" disabled={busy} onClick={() => void submit('skip')}>跳过</button>
        <button className="clarification-send" type="button" disabled={busy || (selected === 2 && !custom.trim())} onClick={() => void submit(selected === 2 ? 'custom' : 'choice')}>{busy ? '发送中…' : seconds === null ? '发送' : `发送 (${seconds}s)`}</button></div>
    </div>
    <p className="clarification-timer-hint" role="status">{seconds === null ? '已取消倒计时，等待你发送；跳过或关闭将由模型选择推荐路线。' : '20 秒未操作将由模型选择推荐路线；点击卡片即可取消倒计时。'}</p>
    {error && <p className="clarification-error" role="alert">{error}</p>}
  </section>
}
