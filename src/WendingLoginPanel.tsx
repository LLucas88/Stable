import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, ShieldCheck, X } from 'lucide-react'
import type { WendingLoginState } from './types'

export function WendingLoginPanel({ state, onState, onReady, onClose, conversationId }: {
  conversationId?: string
  state: WendingLoginState
  onState: (value: WendingLoginState) => void
  onReady: () => Promise<void>
  onClose: () => void
}) {
  // Private, short-lived form state: never put these values in composer/persistence.
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [channel, setChannel] = useState<'0' | '1'>(state.channel)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(state.error?.message || '')
  const [remaining, setRemaining] = useState(state.retryAfter || 0)
  const generation = useRef(0)
  const locked = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const id = useId()
  const selecting = state.phase === 'choose_account' || state.phase === 'choose_brand'
  const options = state.phase === 'choose_account' ? state.accounts : state.brands

  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => {
    setChoice('')
    setError(state.error?.message || '')
    setRemaining(state.retryAfter || 0)
    heading.current?.focus()
  }, [state])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    if (!remaining) return
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [remaining])

  async function perform(action: () => Promise<WendingLoginState>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    const current = generation.current
    try {
      const value = await action()
      if (current !== generation.current) return
      onState(value)
      if (value.phase === 'ready' && !value.error) await onReady()
    } catch {
      if (current === generation.current) setError('登录服务连接失败，请重新检查。')
    } finally {
      locked.current = false
      if (current === generation.current) setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (state.phase === 'signed_out') {
      if (!/^1\d{10}$/.test(mobile)) { setError('请输入 11 位手机号。'); return }
      const value = mobile
      setMobile('')
      void perform(() => window.stable.extensions.sendWendingCode(value, channel, conversationId))
    } else if (state.phase === 'code_sent') {
      if (!/^\d{4,8}$/.test(code)) { setError('请输入 4 至 8 位数字验证码。'); return }
      const value = code
      setCode('')
      void perform(() => window.stable.extensions.verifyWendingCode(value, conversationId))
    } else if (selecting) {
      if (!choice) { setError('请先选择一个选项。'); return }
      void perform(() => state.phase === 'choose_account'
        ? window.stable.extensions.selectWendingAccount(choice, conversationId)
        : window.stable.extensions.selectWendingBrand(choice, conversationId))
    }
  }

  async function check() {
    const checked = await window.stable.extensions.prepareWending(conversationId)
    return checked.login || { phase: 'unknown' as const, channel: '0' as const, detail: checked.detail, error: { code: 'UNAVAILABLE', message: checked.detail } }
  }

  const phaseLabel = state.phase === 'signed_out' ? '验证手机号' : state.phase === 'code_sent' ? '输入验证码' : state.phase === 'choose_account' ? '选择账号' : state.phase === 'choose_brand' ? '选择品牌' : state.phase === 'ready' ? '登录完成' : '检查登录态'

  return <section className="wending-login-panel" aria-labelledby={`${id}-title`}>
    <header><div><ShieldCheck size={20} aria-hidden="true" /><h3 id={`${id}-title`} ref={heading} tabIndex={-1}>{phaseLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="关闭登录表单" onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    <p className="wending-login-privacy" id={`${id}-privacy`}>手机号和验证码仅用于问鼎登录，不会进入模型提示词或聊天记录。关闭表单会清除本次未完成的登录上下文，不会退出已有账号。</p>
    <p role="status" aria-live="polite">{busy ? '正在处理，请稍候；不会自动重发短信。' : state.detail}{state.mobileHint && ` ${state.mobileHint}`}</p>
    <form onSubmit={submit} noValidate aria-describedby={`${id}-privacy`} aria-busy={busy}>
      {error && <p className="wending-login-error" ref={errorRef} role="alert" tabIndex={-1} id={`${id}-error`}>{error}{state.error?.code && <small>错误码：{state.error.code}</small>}</p>}
      {state.phase === 'signed_out' && <div className="wending-login-fields">
        <label htmlFor={`${id}-channel`}>登录渠道<select id={`${id}-channel`} value={channel} disabled={busy} onChange={(event) => setChannel(event.target.value as '0' | '1')}><option value="0">悟空</option><option value="1">云claw</option></select></label>
        <label htmlFor={`${id}-mobile`}>手机号<input id={`${id}-mobile`} type="tel" inputMode="tel" autoComplete="off" maxLength={11} value={mobile} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => setMobile(event.target.value)} /></label>
      </div>}
      {state.phase === 'code_sent' && <label htmlFor={`${id}-code`}>短信验证码<input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => setCode(event.target.value)} /></label>}
      {selecting && <label htmlFor={`${id}-choice`}>{state.phase === 'choose_account' ? '登录账号' : '本次使用的品牌'}<select id={`${id}-choice`} value={choice} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => setChoice(event.target.value)}><option value="">请选择</option>{options?.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <div className="wending-login-actions">
        {state.phase === 'unknown' ? <button className="button primary" type="button" disabled={busy} onClick={() => void perform(check)}>重新检查登录态</button>
          : state.phase === 'ready' ? <button className="button primary" type="button" disabled={busy} onClick={() => void perform(check)}>进入对话</button>
            : <button className="button primary" type="submit" disabled={busy || (state.phase === 'signed_out' && remaining > 0) || (selecting && !options?.length)}>
              {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
              {state.phase === 'signed_out' ? remaining > 0 ? `${remaining} 秒后可发送` : '确认发送验证码' : state.phase === 'code_sent' ? '验证并登录' : state.phase === 'choose_account' ? '使用此账号' : '确认品牌并进入对话'}
            </button>}
        {state.phase === 'choose_brand' && <button className="button" type="button" disabled={busy} onClick={() => void perform(() => window.stable.extensions.refreshWendingBrands(conversationId))}>刷新品牌</button>}
        {state.phase !== 'signed_out' && <button className="button" type="button" disabled={busy} onClick={() => { setCode(''); setMobile(''); void perform(() => window.stable.extensions.resetWendingLogin(conversationId)) }}>重新开始登录</button>}
        <button className="button" type="button" onClick={onClose}>取消</button>
      </div>
    </form>
  </section>
}
