import { useEffect, useRef, useState } from 'react'
import { WendingLoginPanel } from './WendingLoginPanel'
import type { WendingLoginState } from './types'

export function ConversationWending({ conversationId, running, active, autoOpen = false }: { conversationId: string; running: boolean; active: boolean; autoOpen?: boolean }) {
  const [state, setState] = useState<WendingLoginState>({ phase: 'unknown', channel: '0', detail: '此任务尚未检查问鼎登录。' })
  const [binding, setBinding] = useState<Pick<WendingLoginState, 'channel' | 'brandLabel'>>({ channel: '0' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const generation = useRef(0)
  const usedAutoOpen = useRef(false)

  useEffect(() => {
    let alive = true
    const current = generation.current
    void window.stable.extensions?.wendingBinding?.(conversationId).then(value => { if (alive && current === generation.current) { setState(value); setBinding(value) } }).catch(() => {})
    return () => { alive = false; generation.current++; void window.stable.extensions?.cancelWendingLogin?.(conversationId).catch(() => {}) }
  }, [conversationId])
  useEffect(() => { if (open && active) dialog.current?.showModal(); else dialog.current?.close() }, [open, active])
  useEffect(() => { if (!active && open) close() }, [active])
  useEffect(() => { if (autoOpen && !usedAutoOpen.current && active && !running) { usedAutoOpen.current = true; void prepare() } }, [autoOpen, active, running])

  function close() {
    generation.current++
    dialog.current?.close()
    setOpen(false); setBusy(false)
    void window.stable.extensions.cancelWendingLogin(conversationId).catch(() => {})
    button.current?.focus()
  }
  function acceptState(value: WendingLoginState) {
    setState(value)
    if (value.phase === 'ready' && !value.error) setBinding(value)
  }
  async function prepare() {
    if (running || busy) return
    const current = ++generation.current
    setOpen(true); setBusy(true)
    try {
      const checked = await window.stable.extensions.prepareWending(conversationId)
      if (current !== generation.current) return
      acceptState(checked.login || { phase: 'unknown', channel: '0', detail: checked.detail })
    } catch (error) {
      if (current === generation.current) setState({ phase: 'unknown', channel: '0', detail: '登录检查未完成。', error: { code: 'CHECK_FAILED', message: error instanceof Error ? error.message : '请稍后重试。' } })
    } finally { if (current === generation.current) setBusy(false) }
  }
  return <>
    <button ref={button} className="conversation-wending-button" type="button" disabled={running} title={running ? '停止此任务后可修改登录绑定' : '此任务独立使用的账号、渠道和品牌'} onClick={() => void prepare()}>问鼎 CLI · {binding.brandLabel ? `${binding.channel === '1' ? '云claw' : '悟空'} · ${binding.brandLabel}` : '绑定账号与品牌'}</button>
    <dialog ref={dialog} className="conversation-wending-dialog" aria-label="此任务的问鼎 CLI 登录" onCancel={event => { event.preventDefault(); close() }}>
      <p className="conversation-wending-scope">此表单仅保存当前任务的登录配置。{binding.brandLabel && ` 已绑定：${binding.brandLabel}`}</p>
      {busy ? <div className="conversation-wending-loading"><p role="status">正在核验此任务的登录状态…</p><button type="button" className="button" onClick={close}>取消</button></div> : open && <WendingLoginPanel conversationId={conversationId} state={state} onState={acceptState} onReady={async () => close()} onClose={close} />}
    </dialog>
  </>
}
