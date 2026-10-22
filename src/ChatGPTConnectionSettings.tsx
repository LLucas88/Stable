import { useEffect, useRef, useState } from 'react'
import type { BootstrapData, ChatGPTConnectionState } from './types'
import './styles/chatgpt-connection.css'

export function ChatGPTConnectionSettings({ onChanged }: { onChanged: (state: BootstrapData) => void }) {
  const [state, setState] = useState<ChatGPTConnectionState>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged
  const api = window.stable.chatgpt
  useEffect(() => {
    alive.current = true
    if (!api) return
    const update = (next: ChatGPTConnectionState) => {
      if (!alive.current) return
      setState(next)
      void window.stable.bootstrap().then(value => { if (alive.current) onChangedRef.current(value) }).catch(() => {})
    }
    const unsubscribe = api.onState(update)
    void api.status().then(next => { if (alive.current) setState(next) }).catch(() => { if (alive.current) setError('无法读取 ChatGPT 登录状态，请重新打开设置。') })
    return () => { alive.current = false; unsubscribe() }
  }, [api])
  if (!api) return null
  async function action(run: () => Promise<ChatGPTConnectionState | void>) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const next = await run()
      if (alive.current && next) setState(next)
      const bootstrap = await window.stable.bootstrap()
      if (alive.current) onChangedRef.current(bootstrap)
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : '操作失败，请重试。') }
    finally { if (alive.current) setBusy(false) }
  }
  const signingIn = state?.status === 'signing-in'
  return <section className="model-connection-settings chatgpt-connection" aria-label="ChatGPT 订阅连接" aria-busy={busy || signingIn}>
    <h3>ChatGPT 订阅</h3>
    <p>登录自己的 ChatGPT 账号，使用可用的订阅额度。登录会在本机加密保存并自动刷新。</p>
    <p role="status" aria-live="polite">{!state ? '正在读取登录状态…' : signingIn ? '请在浏览器完成登录授权，完成后返回此处。' : state.status === 'connected' ? `已连接${state.email ? ` · ${state.email}` : ''} · ${state.modelCount} 个模型` : state.status === 'reauth-required' ? '登录已失效，请重新登录。' : state.status === 'error' ? '无法读取加密登录记录。' : '尚未登录'}</p>
    <div className="model-connection-actions">
      <button type="button" className="button primary" disabled={busy || signingIn || !state || state.status === 'error'} onClick={() => void action(() => api.signIn())}>{state?.status === 'connected' ? '重新登录' : '登录 ChatGPT'}</button>
      {signingIn && <button type="button" className="button" onClick={() => { void api.cancel().catch(() => setError('取消失败，请重试。')) }}>取消登录</button>}
      {state?.status === 'connected' && <button type="button" className="button" disabled={busy} onClick={() => void action(() => api.refreshModels())}>刷新模型</button>}
      {(state?.status === 'connected' || state?.status === 'reauth-required') && <button type="button" className="button" disabled={busy || signingIn} onClick={() => void action(() => api.signOut())}>退出登录</button>}
      <button type="button" className="button" disabled={busy} onClick={() => void action(() => api.openUsage())}>查看用量</button>
    </div>
    <p>在聊天输入框选择“ChatGPT · 模型名”后使用。额度不足时会停止并提示，不会自动切换到其他计费通道。</p>
    {state?.message && <p role="status">{state.message}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
