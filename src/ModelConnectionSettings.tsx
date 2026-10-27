import { useState } from 'react'
import { ChatGPTConnectionSettings } from './ChatGPTConnectionSettings'
import type { BootstrapData } from './types'
import { modelConnectionChoices } from './model-presets'
import './styles/model-connection.css'

const empty = { id: '', providerId: '', displayName: '', baseURL: '', model: '', hasApiKey: false, apiKey: '' }
export function ModelConnectionSettings({ state, replaceState }: { state: BootstrapData; replaceState: (state: BootstrapData) => void }) {
  const choices = modelConnectionChoices(state.models.items.filter(item => item.providerId !== 'chatgpt'))
  const initial = choices.find(item => item.id === state.models.defaultModelId) || choices[0]
  const [draft, setDraft] = useState(initial ? { ...initial, apiKey: '' } : empty)
  const [advanced, setAdvanced] = useState(!initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const saved = state.models.items.find(item => item.id === draft.id)
  const changedAddress = Boolean(saved && saved.baseURL !== draft.baseURL.trim().replace(/\/+$/, ''))
  const keyRequired = !draft.hasApiKey || changedAddress
  const complete = [draft.providerId, draft.displayName, draft.baseURL, draft.model].every(value => value.trim()) && (!keyRequired || Boolean(draft.apiKey.trim()))
  async function save() {
    if (busy || !complete) return
    setBusy(true); setError(''); setMessage('')
    try {
      const request = { ...draft, id: draft.id || crypto.randomUUID() }
      const catalog = await window.stable.model.save(request)
      const item = catalog.items.find(m => m.id === request.id)
      setDraft(current => ({ ...current, apiKey: '' }))
      if (!item) throw new Error('连接已保存，但未找到对应模型，请重新打开设置。')
      setDraft({ ...item, apiKey: '' })
      await window.stable.model.setDefault(item.id)
      replaceState(await window.stable.bootstrap())
      setMessage('已在本机加密保存，下次启动自动使用。已有对话可在输入框选择此模型。尚未测试供应商连接。')
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试。') }
    finally { setBusy(false) }
  }
  if (state.cloud.status !== 'disabled') return <><ChatGPTConnectionSettings onChanged={replaceState} /><p>当前使用 Stable Cloud，模型和生图连接由网关管理员配置，无需填写本机 API Key。服务不可用时，请联系管理员检查对应模型的配置与额度。</p></>
  return <><ChatGPTConnectionSettings onChanged={replaceState} /><form className="model-connection-settings" aria-busy={busy} onSubmit={event => { event.preventDefault(); void save() }}>
    <p>输入一次 API Key，保存在当前 Windows 用户的加密存储中。下次打开 Stable 无需重新填写。</p>
    <fieldset disabled={busy}><legend>模型连接</legend>
      <label>供应商与模型<select value={draft.id} onChange={event => {
        const item = choices.find(m => m.id === event.target.value)
        setDraft(item ? { ...item, apiKey: '' } : empty); setAdvanced(!item); setError(''); setMessage('')
      }}>{choices.map(item => <option key={item.id} value={item.id}>{item.providerId} · {item.displayName}{item.hasApiKey ? '（已配置）' : ''}</option>)}<option value="">自定义连接…</option></select></label>
      {draft.id && <p className="model-connection-summary">{draft.baseURL}<br />模型：{draft.model}</p>}
      <label>API Key<input type="password" name="api-key" value={draft.apiKey} required={keyRequired} maxLength={4096} autoComplete="new-password" spellCheck={false} aria-describedby="model-key-help" placeholder={draft.hasApiKey ? '已保存；填写新 Key 可更新' : '粘贴供应商 API Key'} onChange={event => setDraft({ ...draft, apiKey: event.target.value })} /></label>
      <p id="model-key-help">{draft.hasApiKey ? '已加密保存。输入框不会显示已保存的 Key；留空将继续使用原 Key。' : 'Key 仅用于向所选模型供应商发起请求。'}{changedAddress && ' 修改 API 地址后需要重新填写 Key。'}</p>
      <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>连接详情与自定义设置</summary>
        <div className="model-connection-fields">{([['providerId', '服务 ID'], ['displayName', '显示名称'], ['baseURL', 'API 基础地址'], ['model', '供应商实际模型 ID']] as const).map(([key, label]) => <label key={key}>{label}<input value={draft[key]} required type={key === 'baseURL' ? 'url' : 'text'} maxLength={key === 'baseURL' ? 500 : key === 'displayName' ? 80 : 160} onChange={event => setDraft({ ...draft, [key]: event.target.value })} autoComplete="off" /></label>)}</div>
      </details>
      <button className="button primary" type="submit" disabled={!complete}>{busy ? '正在加密保存…' : draft.hasApiKey ? '保存并设为默认' : '加密保存并使用'}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </form></>
}
