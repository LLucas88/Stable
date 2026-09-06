import { useEffect, useRef, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
export function RenameConversationDialog({ title, suggestion, onSave, onClose }: { title: string; suggestion: string; onSave: (title: string) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(title), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal(); input.current?.select() }, [])
  async function save() {
    if (!value.trim() || busy) return
    setBusy(true); setError('')
    try { await onSave(value.trim()); onClose() } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试'); setBusy(false) }
  }
  return <dialog ref={dialog} className="rename-dialog" aria-labelledby="rename-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <button className="rename-close" type="button" aria-label="关闭重命名" disabled={busy} onClick={onClose}><X size={18}/></button>
      <h2 id="rename-heading">重命名聊天</h2><p>保持简短且易于识别</p>
      <input ref={input} aria-label="对话名称" maxLength={80} value={value} disabled={busy} onChange={event => setValue(event.target.value)}/>
      {suggestion && suggestion !== title && <button className="rename-suggestion" type="button" disabled={busy} onClick={() => setValue(suggestion)}><Lightbulb size={18}/>{suggestion}</button>}
      {error && <p role="alert">{error}</p>}
      <footer><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy || !value.trim()}>{busy ? '保存中…' : '保存'}</button></footer>
    </form>
  </dialog>
}
