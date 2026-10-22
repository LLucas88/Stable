import { useEffect, useRef, useState } from 'react'
import { CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { BootstrapData } from '../types'
import { errorMessage } from '../shared/format'
import logoUrl from '../../build/stable_logo_transparent.png'

export function cloudAccessHint(status: BootstrapData['cloud']['status']) {
  if (status === 'disabled' || status === 'authenticated') return ''
  if (status === 'checking') return '正在恢复云端登录状态，本地内容可正常查看。'
  if (status === 'password_change_required') return '请先在账号设置中修改临时密码，再发送任务。'
  if (status === 'unavailable') return '云端连接暂不可用，请在账号设置中重新连接。'
  return '登录 Stable Cloud 后即可发送模型任务。'
}

export function CloudAccessSettings({ state, onComplete }: { state: BootstrapData; onComplete: (value: BootstrapData) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState(state.cloud.error || '')
  const errorRef = useRef<HTMLDivElement>(null)
  const mustChange = state.cloud.status === 'password_change_required'
  const unavailable = state.cloud.status === 'unavailable'
  const checking = state.cloud.status === 'checking'
  useEffect(() => { setMessage(state.cloud.error || '') }, [state.cloud.error])

  async function submit(run: () => Promise<BootstrapData>) {
    setPending(true); setMessage('')
    try { const result = await run(); setPassword(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); onComplete(result) }
    catch (reason) {
      setMessage(errorMessage(reason))
      window.requestAnimationFrame(() => errorRef.current?.focus())
    } finally { setPending(false) }
  }

  return <section className="cloud-access-card cloud-access-settings" aria-labelledby="cloud-access-title">
      <div className="cloud-access-brand"><img src={logoUrl} alt="" width="52" height="52" /><span>STABLE CLOUD</span></div>
      <div className="cloud-access-copy">
        <h2 id="cloud-access-title">{checking ? '正在连接云端' : mustChange ? '设置你的正式密码' : unavailable ? '暂时无法连接云端' : '登录 Stable'}</h2>
        <p>{checking ? '正在恢复登录状态，请稍候。' : mustChange ? '这是一次性临时密码。修改完成后，其他设备会话将失效，本机继续使用新会话。' : unavailable ? '已保存的登录凭据仍在 Windows 安全存储中。网络恢复后可直接重试。' : '使用管理员分配的内部账号登录。模型凭据由 Stable 平台统一保管。'}</p>
      </div>
      {message && <div className="cloud-auth-error" role="alert" tabIndex={-1} ref={errorRef}><CircleAlert size={18} aria-hidden="true" /><span>{message}</span></div>}
      {checking ? <div role="status"><LoaderCircle className="spin" size={20} aria-label="正在连接" /></div> : mustChange ? <form className="cloud-auth-form" onSubmit={(event) => { event.preventDefault(); void submit(() => window.stable.cloud.changePassword(currentPassword, newPassword, confirmPassword)) }}>
        <div className="field"><label htmlFor="current-password">当前临时密码</label><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
        <div className="field"><label htmlFor="new-password">新密码</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-describedby="new-password-help" /><small id="new-password-help">至少 12 个字符，建议使用密码管理器生成并保存。</small></div>
        <div className="field"><label htmlFor="confirm-password">确认新密码</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
        <button className="button primary cloud-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} />正在修改…</> : '修改密码并继续'}</button>
      </form> : unavailable ? <div className="cloud-auth-actions">
        <button className="button primary" type="button" disabled={pending} onClick={() => void submit(() => window.stable.cloud.refresh())}>{pending ? '正在重试…' : '重新连接'}</button>
        <button className="text-button" type="button" disabled={pending} onClick={() => void submit(() => window.stable.cloud.logout())}>清除本机登录</button>
      </div> : <form className="cloud-auth-form" onSubmit={(event) => { event.preventDefault(); void submit(() => window.stable.cloud.login(username, password)) }}>
        <div className="field"><label htmlFor="cloud-username">账号</label><input id="cloud-username" autoComplete="username" required autoFocus value={username} onChange={(event) => setUsername(event.target.value)} /></div>
        <div className="field"><label htmlFor="cloud-password">密码</label><input id="cloud-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <button className="button primary cloud-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} />正在登录…</> : '登录'}</button>
      </form>}
      <div className="cloud-access-foot"><ShieldCheck size={16} aria-hidden="true" /><span>账号密码不会保存；设备会话由 Windows 安全存储加密。</span></div>
    </section>
}

