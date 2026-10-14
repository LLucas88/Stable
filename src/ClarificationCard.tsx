import { useId, useRef, useState } from 'react'
import { MessageCircleQuestion, X } from 'lucide-react'
import type { ClarificationQuestion, ClarificationResponse } from './types'

export function ClarificationCard({ question, onSend, onClose }: {
  question: ClarificationQuestion
  onSend: (response: ClarificationResponse) => Promise<void>
  onClose: () => void
}) {
  const titleId = useId()
  const [selected, setSelected] = useState(0)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function submit(source: ClarificationResponse['source']) {
    if (submitting.current || (source === 'custom' && !custom.trim())) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      await onSend({ id: question.id, source, ...(source === 'choice' ? { option: selected } : { text: custom.trim() }) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      submitting.current = false
      setBusy(false)
    }
  }

  return <section className="clarification-card" aria-labelledby={titleId}>
    <div className="clarification-card-heading"><span><MessageCircleQuestion size={16} aria-hidden="true" />问题</span><button type="button" aria-label="收起问题，保持等待" disabled={busy} onClick={onClose}><X size={16} /></button></div>
    <h3 id={titleId}>{question.question}</h3>
    <div className="clarification-options" role="radiogroup" aria-label="选择回答">
      {question.options.slice(0, 2).map((option, index) => <label className="clarification-option" data-selected={selected === index || undefined} key={index}>
        <input type="radio" name={titleId} checked={selected === index} disabled={busy} onChange={() => setSelected(index)} />
        <span className="clarification-number" aria-hidden="true">{index + 1}</span><span><strong>{option.label}{index === 0 && <em>（推荐）</em>}</strong></span>
      </label>)}
    </div>
    <div className="clarification-response">
      <textarea aria-label="自定义回答" placeholder="或自行撰写回复" maxLength={10000} rows={1} value={custom} disabled={busy}
        onFocus={() => setSelected(2)} onChange={event => { setSelected(2); setCustom(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit('custom') } }} />
      <div className="clarification-buttons"><button className="clarification-send" type="button" disabled={busy || (selected === 2 && !custom.trim())} onClick={() => void submit(selected === 2 ? 'custom' : 'choice')}>{busy ? '发送中…' : '发送'}</button></div>
    </div>
    {error && <p className="clarification-error" role="alert">{error}</p>}
  </section>
}
