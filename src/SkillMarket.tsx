import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Bot, Braces, Puzzle, ChevronDown, ChevronUp, PlugZap, Check, MessageSquareText, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Trash2, X, Box } from 'lucide-react'
import type { AgentState, MarketItem } from './types'
import { MarketIcon, marketPresentation } from './market-presentation'
import { skillConversationPrompts } from './skill-purpose'
const membershipCategoryOrder = ['会员与用户运营', '数据与分析', '营销与增长', '销售与客户', '内容与写作', '电商与门店', '调研与洞察', 'AI与自动化', '产品与策略', '视觉与体验设计', '文档与办公', '财务与合规', '团队与协作', '网站与搜索优化', '开发与测试', '职业与招聘']
// Presentation only: keep source documents and installed instructions intact.
function expertDisplayText(value: string) {
  const platform = /work[\s_-]*buddy|code[\s_-]*buddy|dou[\s_-]*bao(?:[\s_-]*work)?|豆包(?:\s*工作)?/i
  return value
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, label: string, target: string) => platform.test(target) ? label : match)
    .replace(/https?:\/\/[^\s<>\[\]()]+/g, target => platform.test(target) ? '相关链接' : target)
    .replace(/work[\s_-]*buddy|code[\s_-]*buddy|dou[\s_-]*bao(?:[\s_-]*work)?|豆包(?:\s*工作)?/gi, '本地助手')
}
function expertDetailPresentation(item: MarketItem): MarketItem {
  if (item.kind !== 'expert') return item
  return { ...item, name: expertDisplayText(item.name), description: expertDisplayText(item.description),
    content: expertDisplayText(item.content), version: expertDisplayText(item.version),
    compatibilityReason: item.compatibilityReason && expertDisplayText(item.compatibilityReason),
    dependencies: item.dependencies?.map(expertDisplayText),
    definitionFiles: item.definitionFiles?.map(file => ({ ...file, path: expertDisplayText(file.path), content: expertDisplayText(file.content) })) }
}
function ExpertAvatar({ item }: { item: MarketItem }) {
  const [failed, setFailed] = useState(false)
  return <span className="market-avatar" data-kind={item.kind}>{item.avatar && !failed ? <img src={`${import.meta.env.BASE_URL}${item.avatar}`} alt="" loading="lazy" onError={() => setFailed(true)}/> : item.kind === 'expert' ? <span className="expert-avatar-fallback">{item.name.slice(0, 1)}</span> : item.kind === 'connector' ? <Box/> : <Braces/>}</span>
}
function MarketDialog({ children, label, close }: { children: ReactNode; label: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog className="market-dialog" ref={ref} aria-label={label} onCancel={event => { event.preventDefault(); close() }}><button className="market-dialog-close" aria-label="关闭" onClick={close}><X size={20}/></button>{children}</dialog>
}
export function SkillMarket({ onUse, renderContent }: { onUse: (state: AgentState) => void; renderContent: (content: string) => ReactNode }) {
  const [items, setItems] = useState<MarketItem[]>([]), [tab, setTab] = useState<MarketItem['kind']>('skill'), [mine, setMine] = useState(false), [query, setQuery] = useState('')
  const [group, setGroup] = useState('全部')
  const [detail, setDetail] = useState<MarketItem>(), [documentIndex, setDocumentIndex] = useState(0), [detailTab, setDetailTab] = useState<'definition' | 'dependencies'>('definition')
  const [groupsExpanded, setGroupsExpanded] = useState(false)
  const groupsRef = useRef<HTMLElement>(null), groupsId = useId()
  useEffect(() => {
    const nav = groupsRef.current
    if (!nav || groupsExpanded) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (active) {
      const bounds = nav.getBoundingClientRect(), selected = active.getBoundingClientRect()
      if (selected.left < bounds.left) nav.scrollLeft += selected.left - bounds.left
      else if (selected.right > bounds.right) nav.scrollLeft += selected.right - bounds.right
    }
  }, [groupsExpanded, group, tab, mine])
  const [selected, setSelected] = useState(''), [draft, setDraft] = useState<Partial<MarketItem>>(), [update, setUpdate] = useState<Partial<MarketItem> & { available: boolean; currentVersion: string }>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => { void run(async () => setItems(await window.stable.market.list())) }, [])
  const presentedItems = items.map(item => ({ ...marketPresentation(item), source: item.source, originalName: item.name }))
  const current = items.find(item => item.id === selected)
  const entry = current ? expertDetailPresentation(marketPresentation({ ...current, ...(detail?.id === selected ? detail : {}), enabled: current.enabled, installed: current.installed })) : undefined
  const available = presentedItems.filter(item => item.kind === tab && (mine ? item.installed : item.builtin || item.bundled))
  const availableGroups = [...new Set(available.map(item => item.group).filter(Boolean))]
  const groups = ['全部', ...(tab === 'skill' ? [...membershipCategoryOrder.filter(name => availableGroups.includes(name)), ...availableGroups.filter(name => !membershipCategoryOrder.includes(name))] : availableGroups)]
  const expertTab = tab === 'expert'
  const visible = presentedItems.filter(item => item.kind === tab && (mine ? item.installed : item.builtin || item.bundled) && (group === '全部' || item.group === group) && `${item.name} ${item.originalName} ${item.id} ${item.description} ${(item.tags || []).join(' ')} ${item.source || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action() } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试') } finally { setBusy(false) } }
  function open(item: MarketItem) {
    setSelected(item.id); setDetail(undefined); setDocumentIndex(0); setDetailTab('definition'); setUpdate(undefined)
    void run(async () => { const next = window.stable.market.detail ? await window.stable.market.detail(item.id) : item; setDetail(next) })
  }
  function use(item: MarketItem, prompt?: string) { void run(async () => { const state = await window.stable.market.use(item.id); onUse(prompt ? { ...state, draftPrompt: prompt } : state) }) }
  return <section className={`skill-market${expertTab ? ' expert-market' : ''}`} aria-label="技能市场">
    <header className="skill-market-top"><nav aria-label="市场类型">{([['skill','Skill技能',Braces],['expert','Agent专家',Bot],['connector','CLI与MCP',PlugZap],['plugin','Plugin插件',Puzzle]] as const).map(([id,label,Icon]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setGroup('全部'); setQuery(''); setNotice('') }}><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{label}</span></button>)}</nav>
      <label className="market-search"><Search size={18}/><input aria-label="搜索技能市场" placeholder={expertTab ? '搜索专家、职责或标签' : tab === 'plugin' ? '搜索插件' : '搜索技能'} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <button className="button market-mine-toggle" aria-pressed={mine} title={mine ? '当前仅显示已添加的内容，点击返回全部' : '查看已添加的内容'} onClick={() => { setMine(value => !value); setGroup('全部'); setQuery('') }}>{mine ? <Check size={16}/> : <Settings2 size={16}/>} {expertTab ? '我的专家' : tab === 'plugin' ? '我的插件' : '我的技能'}{mine && ' · 已选'}</button>{tab !== 'plugin' && <button className="button" onClick={() => setDraft({ kind: tab === 'expert' ? 'expert' : 'skill', name: '', description: '', content: '', version: '1.0.0' })}><Plus size={18}/>新建</button>}
    </header>
    <div className="market-groups-bar" data-expanded={groupsExpanded}>
      <nav id={groupsId} ref={groupsRef} className="market-groups" aria-label="市场分组">{groups.map(name => <button key={name} aria-current={group === name ? 'page' : undefined} title={name} onClick={() => setGroup(name)}>{name}</button>)}</nav>
      <button className="market-groups-toggle" aria-expanded={groupsExpanded} aria-controls={groupsId} aria-label={groupsExpanded ? '收纳分类标签' : '展开全部分类标签'} onClick={() => setGroupsExpanded(value => !value)}>
        <span>{groupsExpanded ? '收纳' : '展开'}</span>{groupsExpanded ? <ChevronUp size={17} aria-hidden="true"/> : <ChevronDown size={17} aria-hidden="true"/>}
      </button>
    </div>
    {expertTab && <div className="expert-catalog-toolbar"><span>{mine ? '已添加' : '发现'} {visible.length} 位专家<span className="expert-toolbar-note"> · 找到适合这项工作的伙伴</span></span></div>}
    {error && <p className="market-feedback" role="alert">{error}</p>}{notice && <p className="market-feedback" role="status">{notice}</p>}
    <div className="market-grid">{visible.map(item => <article className="market-row" key={item.id}>
      {item.kind === 'expert' && (item.definitionCount || item.avatar) ? <ExpertAvatar item={item}/> : <MarketIcon item={item}/>}
      <button className="market-row-copy" onClick={() => open(item)}><strong>{item.name}</strong><small>{item.description}</small>{item.kind === 'expert' && <span className="expert-tags">{item.expertType === 'team' && <span className="expert-team-tag">专家团队</span>}{(item.tags || [item.group]).slice(0, 2).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</span>}{item.kind === 'skill' && <span className="market-skill-tags">{(item.tags?.length ? item.tags : [item.group]).filter(Boolean).map(tag => <span key={tag}>{tag}</span>)}</span>}</button>
      <button className="market-row-action" title={item.activationBlocked ? item.compatibilityReason : undefined} disabled={busy || item.activationBlocked} aria-label={item.kind === 'plugin' ? `查看${item.name}的技能` : item.installed && item.enabled ? `在对话中使用${item.name}` : `添加并启用${item.name}`} onClick={() => item.kind === 'plugin' ? open(item) : item.installed && item.enabled ? use(item) : void run(async () => setItems(await window.stable.market.toggle(item.id, true)))}>{item.installed && item.enabled ? <MessageSquareText size={19}/> : <Plus size={21}/>}</button>
    </article>)}</div>
    {!visible.length && <div className="market-empty">{query ? '没有找到匹配的内容' : mine ? '暂无本地内容，点击“新建”添加' : '暂无内容'}</div>}
    {entry && entry.kind !== 'plugin' && <MarketDialog label={`${entry.name}介绍`} close={() => setSelected('')}>{entry.kind === 'expert' && (entry.definitionCount || entry.avatar) ? <ExpertAvatar item={entry}/> : <MarketIcon item={entry}/>}
      <div className="market-detail-title"><div><h2>{entry.name}</h2><p>{entry.description}</p></div><label className="market-enable"><input aria-label={`启用${entry.name}`} type="checkbox" disabled={busy || entry.activationBlocked} checked={entry.enabled} onChange={event => void run(async () => setItems(await window.stable.market.toggle(entry.id, event.target.checked)))}/><span/></label></div>
      {entry.kind === 'expert' && <>{entry.expertType === 'team' && <div className="expert-provenance"><span>专家团队</span></div>}{entry.definitionCount && <nav className="expert-detail-tabs" aria-label="专家详情"><button aria-pressed={detailTab === 'definition'} onClick={() => setDetailTab('definition')}>专家设定</button><button aria-pressed={detailTab === 'dependencies'} onClick={() => setDetailTab('dependencies')}>依赖说明</button></nav>}{entry.definitionFiles && detailTab === 'definition' && <label className="expert-document-select">设定文件<select aria-label="专家设定文件" value={documentIndex} onChange={event => setDocumentIndex(Number(event.target.value))}>{entry.definitionFiles.map((file, index) => <option key={file.path} value={index}>{file.path.split('/').slice(-2).join('/')}</option>)}</select></label>}</>}
      <div className="market-detail-body">{entry.kind === 'skill' && <section className="skill-conversation-prompts" aria-label="对话提示词"><h3>试试这样提问</h3><p>选择一个提示词，补充需求后由你发送。</p><div className="plugin-skill-list">{skillConversationPrompts(entry).map(prompt => <article key={prompt.title}><div><strong>{prompt.title}</strong><p>{prompt.text}</p></div><button className="button" disabled={busy || entry.activationBlocked || !entry.installed || !entry.enabled} onClick={() => use(entry, prompt.text)}>使用提示词</button></article>)}</div><h3 className="skill-source-title">SKILL.md</h3></section>}{entry.kind === 'expert' && detailTab === 'dependencies' ? <><p>以下技能与工具需按实际环境配置后使用。</p>{entry.expertType === 'team' && <p>团队条目包含多个角色的设定，用于组织分析；添加后不会自动启动多个 Agent。</p>}<ul>{(entry.dependencies || []).map((name, index) => <li key={index}>{name}</li>)}</ul>{!entry.dependencies?.length && <p>此专家未配置额外技能依赖。</p>}</> : <>{entry.kind === 'expert' && !detail && busy && <p role="status">正在读取专家设定…</p>}{entry.compatibilityReason && <p className="market-feedback">{entry.compatibilityReason}</p>}{renderContent(entry.definitionFiles?.[documentIndex]?.content || entry.content)}</>}</div>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {update?.available && <div className="market-update"><span>版本 {update.currentVersion} → {update.version}</span><button className="button" disabled={busy} onClick={() => void run(async () => { setItems(await window.stable.market.save(update)); setUpdate(undefined); setNotice('更新已保存') })}>应用更新</button></div>}
      <footer><span>版本 {entry.version}</span><details className="market-more"><summary aria-label="更多操作"><MoreHorizontal size={19}/></summary><div>
        {!entry.builtin && <button onClick={() => { setDraft(current); setSelected('') }}>编辑</button>}
        <button disabled={busy || !entry.updateURL} title={entry.builtin ? '随 Stable 更新' : entry.updateURL ? '检查已配置更新源' : '尚未配置更新来源'} onClick={() => void run(async () => { const next = await window.stable.market.checkUpdate(entry.id); setUpdate(next); setNotice(next.available ? '发现新版本，确认后应用' : '当前已是最新版本') })}><RefreshCw size={16}/>检查更新</button>
        <small>{entry.builtin ? '随 Stable 更新' : entry.updateURL ? entry.version : '未配置更新来源'}</small>
        <button disabled={busy} onClick={() => void run(async () => { setItems(await window.stable.market.remove(entry.id)); setSelected('') })}><Trash2 size={16}/>{entry.kind === 'expert' && entry.builtin ? '从我的专家移除' : '删除'}</button></div></details><button className="button primary" disabled={busy || (entry.kind !== 'expert' && (!entry.enabled || !entry.installed))} onClick={() => entry.kind === 'expert' && (!entry.installed || !entry.enabled) ? void run(async () => setItems(await window.stable.market.toggle(entry.id, true))) : use(entry)}>{entry.kind === 'expert' && (!entry.installed || !entry.enabled) ? '添加专家' : '在对话中试用'}</button></footer>
    </MarketDialog>}
    {entry?.kind === 'plugin' && <MarketDialog label={`${entry.name}介绍`} close={() => setSelected('')}>
      <MarketIcon item={entry}/><div className="market-detail-title"><div><h2>{entry.name}</h2><p>{entry.description}</p></div></div>
      <div className="market-detail-body">{renderContent(entry.content)}<h3>包含的技能</h3>
        <div className="plugin-skill-list">{entry.pluginSkills?.map(skill => <article key={skill.id}><div><strong>{skill.name}</strong><p>{skill.description}</p></div><button className="button" disabled={busy} aria-label={`使用${skill.name}`} onClick={() => void run(async () => onUse(await window.stable.market.use(skill.id)))}>使用</button></article>)}</div>
      </div>{error && <p role="alert">{error}</p>}<footer><span>版本 {entry.version}</span><button className="button" onClick={() => setSelected('')}>关闭</button></footer>
    </MarketDialog>}
    {draft && <MarketDialog label="新建或编辑本地技能" close={() => { if (!busy) setDraft(undefined) }}><h2>{draft.id ? '编辑' : '新建'}{draft.kind === 'expert' ? '本地专家' : '本地技能'}</h2><form className="market-form" onSubmit={event => { event.preventDefault(); void run(async () => { setItems(await window.stable.market.save(draft)); setTab(draft.kind || 'skill'); setMine(true); setDraft(undefined) }) }}>
      <label>类型<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as 'skill' | 'expert' })}><option value="skill">Skill技能</option><option value="expert">Agent专家</option></select></label>
      <label>名称<input required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>简介<input maxLength={200} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
      <label>技能说明<textarea required rows={9} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder="描述适用场景、处理步骤和输出要求，支持 Markdown"/></label>
      <label>更新来源（可选）<input type="url" value={draft.updateURL || ''} onChange={event => setDraft({ ...draft, updateURL: event.target.value })} placeholder="HTTPS JSON 地址"/></label>
      {error && <p role="alert">{error}</p>}<footer><button className="button" type="button" disabled={busy} onClick={() => setDraft(undefined)}>取消</button><button className="button primary" disabled={busy} type="submit"><Check size={16}/>保存</button></footer>
    </form></MarketDialog>}
  </section>
}
