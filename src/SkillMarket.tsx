import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Braces, Check, MessageSquareText, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Trash2, X, Box } from 'lucide-react'
import type { AgentState, MarketItem } from './types'
function MarketDialog({ children, label, close }: { children: ReactNode; label: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog className="market-dialog" ref={ref} aria-label={label} onCancel={event => { event.preventDefault(); close() }}><button className="market-dialog-close" aria-label="关闭" onClick={close}><X size={20}/></button>{children}</dialog>
}
export function SkillMarket({ onUse, renderContent }: { onUse: (state: AgentState) => void; renderContent: (content: string) => ReactNode }) {
  const [items, setItems] = useState<MarketItem[]>([]), [tab, setTab] = useState<MarketItem['kind']>('skill'), [mine, setMine] = useState(false), [query, setQuery] = useState('')
  const [selected, setSelected] = useState(''), [draft, setDraft] = useState<Partial<MarketItem>>(), [update, setUpdate] = useState<Partial<MarketItem> & { available: boolean; currentVersion: string }>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => { void run(async () => setItems(await window.stable.market.list())) }, [])
  const entry = items.find(item => item.id === selected)
  const visible = items.filter(item => item.kind === tab && (mine ? item.installed : item.builtin) && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action() } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试') } finally { setBusy(false) } }
  function use(item: MarketItem) { void run(async () => { onUse(await window.stable.market.use(item.id)) }) }
  return <section className="skill-market" aria-label="技能市场">
    <header className="skill-market-top"><nav aria-label="市场类型">{([['skill','Skill技能'],['connector','cli&mcp连接器'],['expert','Agent专家']] as const).map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNotice('') }}>{label}</button>)}</nav>
      <label className="market-search"><Search size={18}/><input aria-label="搜索技能市场" placeholder="搜索技能" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <button className="button" aria-pressed={mine} onClick={() => setMine(!mine)}><Settings2 size={16}/>我的技能</button><button className="button" onClick={() => setDraft({ kind: tab === 'expert' ? 'expert' : 'skill', name: '', description: '', content: '', version: '1.0.0' })}><Plus size={18}/>新建</button>
    </header>
    <nav className="market-groups" aria-label="市场分组">{mine ? <button aria-current="page" onClick={() => setMine(false)}>我的技能 · 返回市场</button> : tab !== 'expert' ? <button aria-current="page">问鼎</button> : <span>Agent专家</span>}</nav>
    {error && <p className="market-feedback" role="alert">{error}</p>}{notice && <p className="market-feedback" role="status">{notice}</p>}
    <div className="market-grid">{visible.map(item => <article className="market-row" key={item.id}>
      <span className="market-avatar" data-kind={item.kind}>{item.kind === 'connector' ? <Box/> : item.kind === 'expert' ? <Bot/> : <Braces/>}</span>
      <button className="market-row-copy" onClick={() => { setSelected(item.id); setUpdate(undefined) }}><strong>{item.name}</strong><small>{item.description}</small></button>
      <button className="market-row-action" disabled={busy} aria-label={item.installed && item.enabled ? `在对话中使用${item.name}` : `添加并启用${item.name}`} onClick={() => item.installed && item.enabled ? use(item) : void run(async () => setItems(await window.stable.market.toggle(item.id, true)))}>{item.installed && item.enabled ? <MessageSquareText size={19}/> : <Plus size={21}/>}</button>
    </article>)}</div>
    {!visible.length && <div className="market-empty">{query ? '没有找到匹配的内容' : mine ? '暂无本地内容，点击“新建”添加' : '暂无内容'}</div>}
    {entry && <MarketDialog label={`${entry.name}介绍`} close={() => setSelected('')}><span className="market-avatar" data-kind={entry.kind}>{entry.kind === 'connector' ? <Box/> : <Braces/>}</span>
      <div className="market-detail-title"><div><h2>{entry.name}</h2><p>{entry.description}</p></div><label className="market-enable"><input aria-label={`启用${entry.name}`} type="checkbox" disabled={busy} checked={entry.enabled} onChange={event => void run(async () => setItems(await window.stable.market.toggle(entry.id, event.target.checked)))}/><span/></label></div>
      <div className="market-detail-body">{renderContent(entry.content)}</div>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {update?.available && <div className="market-update"><span>版本 {update.currentVersion} → {update.version}</span><button className="button" disabled={busy} onClick={() => void run(async () => { setItems(await window.stable.market.save(update)); setUpdate(undefined); setNotice('更新已保存') })}>应用更新</button></div>}
      <footer><span>版本 {entry.version}</span><details className="market-more"><summary aria-label="更多操作"><MoreHorizontal size={19}/></summary><div>
        {!entry.builtin && <button onClick={() => { setDraft(entry); setSelected('') }}>编辑</button>}
        <button disabled={busy || !entry.updateURL} title={entry.builtin ? '随 Stable 更新' : entry.updateURL ? '检查已配置更新源' : '尚未配置更新来源'} onClick={() => void run(async () => { const next = await window.stable.market.checkUpdate(entry.id); setUpdate(next); setNotice(next.available ? '发现新版本，确认后应用' : '当前已是最新版本') })}><RefreshCw size={16}/>检查更新</button>
        <small>{entry.builtin ? '随 Stable 更新' : entry.updateURL ? entry.version : '未配置更新来源'}</small>
        <button disabled={busy} onClick={() => void run(async () => { setItems(await window.stable.market.remove(entry.id)); setSelected('') })}><Trash2 size={16}/>删除</button></div></details><button className="button primary" disabled={busy || !entry.enabled || !entry.installed} onClick={() => use(entry)}>在对话中试用</button></footer>
    </MarketDialog>}
    {draft && <MarketDialog label="新建或编辑本地技能" close={() => { if (!busy) setDraft(undefined) }}><h2>{draft.id ? '编辑' : '新建'}本地技能</h2><form className="market-form" onSubmit={event => { event.preventDefault(); void run(async () => { setItems(await window.stable.market.save(draft)); setTab(draft.kind || 'skill'); setMine(true); setDraft(undefined) }) }}>
      <label>类型<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as 'skill' | 'expert' })}><option value="skill">Skill技能</option><option value="expert">Agent专家</option></select></label>
      <label>名称<input required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>简介<input maxLength={200} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
      <label>技能说明<textarea required rows={9} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder="描述适用场景、处理步骤和输出要求，支持 Markdown"/></label>
      <label>更新来源（可选）<input type="url" value={draft.updateURL || ''} onChange={event => setDraft({ ...draft, updateURL: event.target.value })} placeholder="HTTPS JSON 地址"/></label>
      {error && <p role="alert">{error}</p>}<footer><button className="button" type="button" disabled={busy} onClick={() => setDraft(undefined)}>取消</button><button className="button primary" disabled={busy} type="submit"><Check size={16}/>保存</button></footer>
    </form></MarketDialog>}
  </section>
}
