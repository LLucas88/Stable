import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, FolderInput, LoaderCircle, MessageSquare, Settings2, Bot } from 'lucide-react'
import type { AgentState, ImportProvider, ImportHistoryItem, DataImportResult, ImportKind, ImportPreview, ImportPreviewItem } from '../types'
import '../styles/workbuddy-import.css'
import openaiLogo from '../assets/model-providers/openai.svg'

const applications: { id: ImportProvider; name: string }[] = [
  { id: 'workbuddy', name: 'WorkBuddy' }, { id: 'codex', name: 'Codex' },
]
const historyApplications = [...applications, { id: 'chatgpt' as const, name: 'ChatGPT' }]
const groups: { name: string; icon: typeof Bot; categories: { name: string; kinds: ImportKind[] }[] }[] = [
  { name: '工具和设置', icon: Settings2, categories: [{ name: '技能', kinds: ['skill'] }, { name: '连接器', kinds: ['connector'] }, { name: '记忆', kinds: ['memory', 'instruction'] }] },
  { name: '项目和会话', icon: MessageSquare, categories: [{ name: '项目', kinds: ['project'] }, { name: '聊天会话', kinds: ['session'] }] },
]
const selectable = (item: ImportPreviewItem) => item.status === 'ready' || item.status === 'changed'
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const statusLabel = { ready: '', imported: '已导入', changed: '新版本', unavailable: '不可用' }
function AppIcon({ provider }: { provider: ImportProvider }) {
  return provider !== 'workbuddy' ? <img className="migration-brand" src={openaiLogo} alt="" width={27} height={27} /> : <Bot size={25} strokeWidth={1.7} />
}

// Only shown if an old archive could not be upgraded; keep a recovery route.
export function ImportedConversationContinuation({ conversationId, onOpen }: { conversationId: string; onOpen: (agent: AgentState) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function proceed() {
    setBusy(true); setError('')
    try { onOpen(await window.stable.dataImport.continueConversation(conversationId, [])) } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }
  return <div className="workbuddy-continuation"><button className="button" disabled={busy} onClick={() => void proceed()}>{busy ? '处理中…' : '恢复为新对话'}</button>{error && <p role="alert">{error}</p>}</div>
}

export function DataImport({ onOpen, onImported }: { onOpen: (agent: AgentState) => void; onImported: () => Promise<void> }) {
  const [provider, setProvider] = useState<ImportProvider | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [history, setHistory] = useState<ImportHistoryItem[]>([])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(''), [error, setError] = useState('')
  const [query, setQuery] = useState(''), [category, setCategory] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [historyProvider, setHistoryProvider] = useState<ImportProvider | null>(null)
  const [result, setResult] = useState<DataImportResult | null>(null)
  const [connector, setConnector] = useState(''), [authorization, setAuthorization] = useState(''), [toolNames, setToolNames] = useState('')
  const [detail, setDetail] = useState<{ id: string; text: string } | null>(null)
  const request = useRef(0), mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await window.stable.dataImport.state()
        if (!mounted.current) return
        setPreview(value.preview); setHistory(value.history); setBusy(value.busy ? '正在处理…' : '')
        if (value.warnings?.length) setError(value.warnings.join('\n'))
        if (value.busy) timer = setTimeout(() => void load(), 1500)
      } catch (reason) { if (mounted.current) setError(errorText(reason)) }
    }
    void load()
    return () => { mounted.current = false; clearTimeout(timer); request.current++ }
  }, [])
  async function scan(app: ImportProvider, choose = false) {
    if (busy) return
    const ticket = ++request.current
    setBusy('正在扫描…'); setError(''); setDetail(null); setResult(null)
    try {
      const value = await window.stable.dataImport.scan(choose, app)
      if (mounted.current && ticket === request.current && value) {
        setProvider(app); setPreview(value); setSelection(new Set()); setCategory(null); setQuery('')
      }
    } catch (reason) { if (mounted.current) { setProvider(app); setPreview(null); setError(errorText(reason)) } }
    finally { if (mounted.current) setBusy('') }
  }
  async function inspect(item: ImportPreviewItem) {
    if (!preview) return
    const ticket = ++request.current
    try {
      const value = await window.stable.dataImport.detail(preview.token, item.id)
      if (mounted.current && ticket === request.current) setDetail({ id: item.id, text: value.text })
    } catch (reason) { if (mounted.current) setError(errorText(reason)) }
  }
  function toggle(items: ImportPreviewItem[], checked: boolean) {
    setSelection(current => {
      const next = new Set(current)
      for (const item of items.filter(selectable)) {
        if (checked) next.add(item.id); else next.delete(item.id)
        if (item.kind === 'session') for (const file of preview?.items.filter(f => item.fileIds.includes(f.id) && selectable(f)) || []) {
          if (checked) next.add(file.id); else next.delete(file.id)
        }
      }
      return next
    })
  }
  async function importSelected() {
    if (!preview || !selection.size) return
    setBusy('正在导入…'); setError(''); request.current++
    try {
      const value = await window.stable.dataImport.importSelected(preview.token, [...selection])
      if (mounted.current) { setResult(value); setPreview(value.preview); setHistory(value.history); setSelection(new Set(value.results.filter(i => i.status === 'failed').map(i => i.id))) }
      await onImported()
    } catch (reason) { if (mounted.current) setError(errorText(reason)) }
    finally { if (mounted.current) setBusy('') }
  }
  async function open(id: string) { try { onOpen(await window.stable.agent.select(id)) } catch (reason) { setError(errorText(reason)) } }
  async function enableConnector() {
    setBusy('正在保存…'); setError('')
    try {
      await window.stable.dataImport.activateConnector(connector, { authorization, tools: toolNames.split(/[,，\s]+/).filter(Boolean) })
      setConnector(''); setAuthorization(''); setToolNames('')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }
  const all = preview?.items || []
  const checkbox = (items: ImportPreviewItem[], label: string) => {
    const available = items.filter(selectable), checked = available.length > 0 && available.every(i => selection.has(i.id)), partial = !checked && available.some(i => selection.has(i.id))
    return <input type="checkbox" aria-label={`选择${label}`} aria-checked={partial ? 'mixed' : checked} ref={node => { if (node) node.indeterminate = partial }} disabled={Boolean(busy) || !available.length} checked={checked} onChange={e => toggle(available, e.target.checked)} />
  }
  const selectedCategory = groups.flatMap(g => g.categories).find(c => c.name === category)
  const visible = all.filter(i => selectedCategory?.kinds.includes(i.kind) && i.name.toLowerCase().includes(query.toLowerCase()))
  function back() { request.current++; setDetail(null); setQuery(''); if (category) setCategory(null); else { setProvider(null); setHistoryProvider(null); setResult(null); setConnector(''); setAuthorization('') } }
  const title = category || (provider ? '选择要导入的项目' : historyProvider ? '已导入的数据' : '数据导入')
  const rows = (items: ImportPreviewItem[]) => items.map(item => <div className="workbuddy-item" key={item.id}>
    <div className="workbuddy-item-top"><button className="migration-item-name" onClick={() => void inspect(item)} disabled={Boolean(busy)}>{item.name}</button><small>{statusLabel[item.status]}</small>{checkbox([item], item.name)}</div>
    {item.kind === 'session' && item.fileIds.length > 0 && <details className="migration-files"><summary>附件与产物（{item.fileIds.length}）</summary>{rows(all.filter(f => item.fileIds.includes(f.id)))}</details>}
    {item.warnings.map((warning, index) => <p className="workbuddy-warning" key={index}>{warning}</p>)}
    {detail?.id === item.id && <pre className="workbuddy-preview">{detail.text || '无预览'}</pre>}
  </div>)
  return <section className="workbuddy-import migration-page" aria-label="数据导入" aria-busy={Boolean(busy)}>
    <header className="migration-header">{(provider || historyProvider) && <button className="migration-back" disabled={Boolean(busy)} aria-label="返回" onClick={back}><ArrowLeft size={20} /></button>}<h1 id="settings-page-title">{title}</h1></header>
    {busy && <p role="status" className="workbuddy-progress"><LoaderCircle size={16} />{busy}</p>}
    {error && <p role="alert" className="workbuddy-error">{error}</p>}
    {!provider && !historyProvider && <>
      <h2 className="migration-section-label">个人应用</h2>
      <div className="migration-card">{applications.map(app => <div className="migration-provider" key={app.id}>
        <span className="migration-app-icon"><AppIcon provider={app.id} /></span><span className="migration-app-name">{app.name}{preview?.provider === app.id && <small>{preview.items.filter(i => i.kind !== 'file' && selectable(i)).length} 项可导入</small>}</span>
        <button className="button" disabled={Boolean(busy)} onClick={() => void scan(app.id)}>导入</button>
      </div>)}</div>
      {history.length > 0 && <><h2 className="migration-section-label">已导入的数据</h2><div className="migration-card">{historyApplications.filter(app => history.some(i => (i.provider || 'workbuddy') === app.id)).map(app => <button className="migration-provider migration-history-button" key={app.id} onClick={() => setHistoryProvider(app.id)}><span className="migration-app-icon"><AppIcon provider={app.id} /></span><span className="migration-app-name">{app.name}<small>{new Date(history.find(i => (i.provider || 'workbuddy') === app.id)!.createdAt).toLocaleString()}</small></span><ChevronRight size={18} /></button>)}</div></>}
    </>}
    {historyProvider && !provider && <div className="migration-card">{history.filter(i => (i.provider || 'workbuddy') === historyProvider).map(item => <div className="migration-provider" key={item.id}><span className="migration-app-name">{item.name}</span>{item.kind === 'session' && <button className="button" onClick={() => void open(item.targetId)}>打开对话</button>}{item.kind === 'connector' && <button className="button" onClick={() => { setConnector(item.id); setAuthorization(''); setToolNames('') }}>配置</button>}</div>)}</div>}
    {connector && <form className="migration-connector" onSubmit={e => { e.preventDefault(); void enableConnector() }}><label>Authorization<input type="password" autoComplete="off" value={authorization} onChange={e => setAuthorization(e.target.value)} /></label><label>允许的工具名称<input value={toolNames} onChange={e => setToolNames(e.target.value)} placeholder="多个名称用逗号分隔" /></label><div className="workbuddy-actions"><button className="button primary" disabled={Boolean(busy)}>保存并启用</button><button className="button" type="button" disabled={Boolean(busy)} onClick={() => { setConnector(''); setAuthorization('') }}>取消</button></div></form>}
    {provider && <>
      <div className="workbuddy-actions migration-sources"><button className="button" disabled={Boolean(busy)} onClick={() => void scan(provider)}>扫描本机</button><button className="button" disabled={Boolean(busy)} onClick={() => void scan(provider, true)}><FolderInput size={15} />选择数据目录</button></div>
      {preview?.warnings.map((warning, index) => <p className="workbuddy-warning" key={index}>{warning}</p>)}
      {preview && !category && groups.map(group => {
        const entries = all.filter(i => group.categories.some(c => c.kinds.includes(i.kind))), count = entries.filter(i => i.status !== 'unavailable').length
        return <section className="migration-card migration-group" key={group.name}>
          <div className="migration-group-heading"><group.icon size={22} /><button aria-expanded={!collapsed.has(group.name)} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(group.name)) next.delete(group.name); else next.add(group.name); return next })}>{group.name} ({count})<ChevronDown size={18} data-collapsed={collapsed.has(group.name)} /></button>{checkbox(entries, group.name)}</div>
          {!collapsed.has(group.name) && group.categories.map(c => { const entries = all.filter(i => c.kinds.includes(i.kind)), count = entries.filter(i => i.status !== 'unavailable').length; return <div className="migration-category" key={c.name}><button onClick={() => { setCategory(c.name); setDetail(null) }}>{c.name} ({count}){!count && <small>不可用</small>}</button>{checkbox(entries, c.name)}</div> })}
        </section>
      })}
      {preview && category && <><input className="migration-search" aria-label="搜索条目" placeholder="搜索" value={query} onChange={e => setQuery(e.target.value)} /><div className="migration-card migration-items">{rows(visible)}{visible.length === 0 && <p className="migration-empty">无可用内容</p>}</div></>}
      {preview && <footer className="workbuddy-import-footer"><span>{selection.size ? `已选择 ${selection.size} 项` : ''}</span><button className="button primary" disabled={Boolean(busy) || !selection.size} onClick={() => void importSelected()}>开始导入</button></footer>}
    </>}
    {result && <div className="workbuddy-results" role="status">已导入 {result.results.filter(i => i.status === 'imported').length} 项{result.results.filter(i => i.status === 'failed' || i.warnings?.length).map(i => <p key={i.id}>{i.name}：{i.error || i.warnings?.join('；')}</p>)}{result.results.filter(i => i.kind === 'session' && i.targetId).map(i => <button className="button" key={i.id} onClick={() => void open(i.targetId!)}>打开对话</button>)}</div>}
  </section>
}
