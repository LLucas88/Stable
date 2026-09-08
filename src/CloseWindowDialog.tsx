import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function CloseWindowDialog() {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  useEffect(() => window.stable.windowClose?.onRequest(() => { setRemember(false); setError(''); setOpen(true) }), [])
  useEffect(() => { if (open) dialog.current?.showModal() }, [open])
  async function decide(choice: 'minimize' | 'quit' | 'cancel') {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try { await window.stable.windowClose.decide(choice, remember); setOpen(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试') }
    finally { submitting.current = false; setBusy(false) }
  }
  if (!open) return null
  return createPortal(<dialog ref={dialog} className="remove-dialog close-window-dialog" aria-labelledby="close-window-title" aria-describedby="close-window-description" onCancel={event => { event.preventDefault(); void decide('cancel') }}>
    <button type="button" className="remove-dialog-close" aria-label="取消关闭窗口" disabled={busy} onClick={() => void decide('cancel')}><X size={18}/></button>
    <h2 id="close-window-title">关闭窗口</h2>
    <p id="close-window-description">最小化到任务栏后，任务继续运行。退出 Stable 将停止正在运行的任务和定时任务。</p>
    <label className="close-window-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={event => setRemember(event.target.checked)}/>记住我的选择</label>
    {error && <p role="alert" className="remove-dialog-error">{error}</p>}
    <footer><button type="button" className="button" autoFocus disabled={busy} onClick={() => void decide('minimize')}>最小化到任务栏</button><button type="button" className="button primary" disabled={busy} onClick={() => void decide('quit')}>退出应用</button></footer>
  </dialog>, document.body)
}
