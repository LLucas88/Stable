import { CloudAccessSettings, cloudAccessHint } from './CloudAccessSettings'
import { ModelConnectionSettings } from '../ModelConnectionSettings'
import { DataImport } from '../imports/DataImport'
import { useEffect, useRef, useState } from 'react'
import { Settings, ArrowUp, Check, CircleAlert, Download, FolderInput, Home, LoaderCircle, LogOut, MessageSquareText, Moon, Network, Save, RotateCw, Shield, ShieldCheck, Sun, Search } from 'lucide-react'
import type { AgentState, BootstrapData, GlobalInstructionsFile, ThemeMode } from '../types'
import { errorMessage } from '../shared/format'
export type AccountModuleId = 'appearance' | 'account' | 'updates' | 'agent-history' | 'models' | 'workbuddy'

const ACCOUNT_MODULES: Array<{ id: AccountModuleId; label: string; detail: string; icon: typeof Home }> = [
  { id: 'models', label: '模型连接', detail: '本地直连与设备配置', icon: Network },
  { id: 'workbuddy', label: '数据导入', detail: 'WorkBuddy、Codex', icon: FolderInput },
  { id: 'appearance', label: '主题设置', detail: '深色或浅色界面', icon: Sun },
  { id: 'account', label: '账号', detail: '身份、额度与用量', icon: ShieldCheck },
  { id: 'updates', label: '软件更新', detail: '版本与安装状态', icon: RotateCw },
  { id: 'agent-history', label: 'Agent 对话记录', detail: '全局对话提醒', icon: MessageSquareText },
]

export function AccountDock({ state, onSelect }: { state: BootstrapData; onSelect: (module: AccountModuleId) => void }) {
  const [open, setOpen] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: globalThis.PointerEvent) => { if (!dockRef.current?.contains(event.target as Node)) setOpen(false) }
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', keyboard) }
  }, [open])
  return <div className="rail-account-dock" ref={dockRef}>
    {open && <section className="account-menu-popover" id="account-menu-popover" aria-label="设置">
      <nav aria-label="账号设置模块">
        {ACCOUNT_MODULES.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setOpen(false); onSelect(id) }}>
          <Icon size={17} aria-hidden="true" /><span><strong>{label}</strong></span>
        </button>)}
      </nav>
      <div className="rail-version" aria-label={`Stable 版本 ${state.appVersion}`}>Stable v{state.appVersion}</div>
    </section>}
    <button ref={triggerRef} className="rail-account-trigger" type="button" data-tooltip="设置" aria-label="设置" aria-expanded={open} aria-controls="account-menu-popover" onClick={() => setOpen(value => !value)}><Settings size={20} aria-hidden="true" /></button>
  </div>
}

export function SettingsNavigation({ activeModule, onSelect }: { activeModule: AccountModuleId; onSelect: (module: AccountModuleId) => void; }) {
  const [query, setQuery] = useState('')
  const modules = ACCOUNT_MODULES.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="settings-navigation" aria-label="设置分类">
    <header><strong>设置</strong></header>
    <label className="settings-search"><Search size={16} aria-hidden="true" /><input aria-label="搜索设置" placeholder="搜索设置" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <span className="settings-category-label">个人</span>
    <nav>{modules.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={id === activeModule ? 'page' : undefined} onClick={() => onSelect(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}</nav>
    {!modules.length && <p className="settings-search-empty">没有找到相关设置</p>}
  </section>
}

export function SettingsContent({ module, state, replaceState, updateTheme, action, onSelect, onOpenImported }: { module: AccountModuleId; state: BootstrapData; replaceState: (state: BootstrapData) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void>; onSelect: (module: AccountModuleId) => void; onOpenImported: (agent: AgentState) => void }) {
  const selected = ACCOUNT_MODULES.find(item => item.id === module)!
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.closest('.settings-page')?.scrollTo(0, 0) }, [module])
  return <section className="settings-page" aria-labelledby="settings-page-title">
    <div className="settings-page-inner">
      <div className="settings-page-toolbar"><select aria-label="设置分类" value={module} onChange={event => onSelect(event.target.value as AccountModuleId)}>{ACCOUNT_MODULES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      {module !== 'workbuddy' && <header><h1 id="settings-page-title" ref={heading} tabIndex={-1}>{selected.label}</h1><p>{selected.detail}</p></header>}
      <div className="settings-page-content" key={module}>
        {module === 'workbuddy' ? <DataImport onImported={async () => replaceState(await window.stable.bootstrap())} onOpen={onOpenImported} /> : <AccountModuleContent module={module} state={state} replaceState={replaceState} updateTheme={updateTheme} action={action} />}
      </div>
    </div>
  </section>
}

export function UpdateProgressButton({ state, action, onOpen }: { state: BootstrapData; action: (label: string, run: () => Promise<void>) => Promise<void>; onOpen: () => void }) {
  const update = state.update
  if (!['checking', 'available', 'downloading', 'downloaded', 'installing', 'error'].includes(update.status)) return null
  const ready = update.status === 'downloaded'
  const percent = Math.max(0, Math.min(100, update.progress || 0))
  const label = ready ? `v${update.availableVersion} 已下载，点击安装` : update.status === 'downloading' ? `正在下载更新 ${percent}%` : update.status === 'error' ? '更新失败，点击查看' : update.status === 'installing' ? '正在打开安装窗口' : '正在检查并准备更新'
  return <button type="button" className="rail-update-button" data-status={update.status} data-tooltip={label} aria-label={label} disabled={update.status === 'installing'} onClick={() => ready ? void action('正在安装软件更新', async () => { await window.stable.updater.install() }) : onOpen()}>
    <svg className="update-progress-ring" viewBox="0 0 32 32" role={update.status === 'downloading' ? 'progressbar' : undefined} aria-label="更新下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><circle className="update-ring-track" cx="16" cy="16" r="13" /><circle className="update-ring-value" cx="16" cy="16" r="13" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (ready ? 100 : percent)} /></svg>
    {update.status === 'error' ? <CircleAlert size={16} /> : ready ? <ArrowUp size={16} /> : ['checking', 'available', 'installing'].includes(update.status) ? <LoaderCircle size={16} className="spin" /> : <Download size={15} />}
  </button>
}

function AccountModuleContent({ module, state, replaceState, updateTheme, action }: { module: AccountModuleId; state: BootstrapData; replaceState: (state: BootstrapData) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  if (module === 'models') return <ModelConnectionSettings state={state} replaceState={replaceState} />
  if (module === 'appearance') return <ThemeSettingsModule state={state} replaceState={replaceState} updateTheme={updateTheme} action={action} />
  if (module === 'account') return <CloudAccountModule state={state} replaceState={replaceState} action={action} />
  if (module === 'updates') return <UpdateSettingsModule state={state} action={action} />
  return <AgentHistoryModule state={state} action={action} />
}

export function ThemeSettingsModule({ state, replaceState, updateTheme, action }: { state: BootstrapData; replaceState: (state: BootstrapData) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  function setTheme(theme: ThemeMode) {
    void action('正在切换主题', async () => {
      const saved = await window.stable.appearance.setTheme(theme)
      document.documentElement.dataset.theme = saved
      updateTheme(saved)
    })
  }
  return <><div className="theme-options account-theme-options">
    {([
      { id: 'dark' as const, label: '黑色', detail: '深色背景，适合长时间工作', icon: Moon },
      { id: 'light' as const, label: '白色', detail: '暖白背景，适合长时间查看', icon: Sun },
    ]).map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" className="theme-option" data-active={state.theme === id || undefined} aria-pressed={state.theme === id} onClick={() => setTheme(id)}>
      <span className="theme-sample" data-preview={id} aria-hidden="true"><span /><span /></span>
      <span className="theme-option-copy"><span><Icon size={17} aria-hidden="true" />{label}</span><small>{detail}</small></span>
      {state.theme === id && <Check className="theme-selected" size={17} aria-hidden="true" />}
    </button>)}
  </div><label className="prediction-setting"><span><strong>显示下一步消息建议</strong><small>回答结束后预测你可能发送的下一句话，会额外使用当前模型额度。</small></span><input type="checkbox" checked={state.messagePredictionsEnabled !== false} onChange={event => {
    const enabled = event.target.checked
    void action('正在保存消息建议设置', async () => { const saved = await window.stable.settings.messagePredictions(enabled); replaceState({ ...state, messagePredictionsEnabled: saved }) })
  }} /></label></>
}

function formatCloudMoney(micros: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(micros || 0) / 1_000_000)
}

function CloudAccountModule({ state, replaceState, action }: { state: BootstrapData; replaceState: (state: BootstrapData) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const account = state.cloud.account
  const quota = state.cloud.quota
  const usage = state.cloud.usage?.totals
  if (cloudAccessHint(state.cloud.status)) return <CloudAccessSettings state={state} onComplete={replaceState} />
  if (!account) return <div className="account-module-empty"><Shield size={22} aria-hidden="true" /><strong>本地直连模式</strong><span>无需 Stable Cloud 登录。模型连接在设置中配置，用量与额度由模型供应商管理。</span></div>
  const committed = quota ? quota.spentMicros + quota.reservedMicros : 0
  const percent = quota?.limitMicros ? Math.min(100, Math.round((committed / quota.limitMicros) * 100)) : 0
  return <section className="cloud-account-settings account-module">
    <div className="cloud-account-grid">
      <article className="cloud-account-identity"><span className="cloud-account-avatar" aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{account.displayName}</strong><span>{account.username} · {account.role === 'admin' ? '管理员' : '成员'}</span></div><em><ShieldCheck size={13} aria-hidden="true" />已登录</em></article>
      <article className="cloud-quota-card">
        <div><span>本期额度</span><strong>{quota ? `${formatCloudMoney(committed, quota.currency)} / ${formatCloudMoney(quota.limitMicros, quota.currency)}` : '未分配'}</strong></div>
        {quota && <><div className="cloud-quota-track" role="progressbar" aria-label="本期额度使用比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><div className="cloud-quota-meta"><span>剩余 {formatCloudMoney(quota.remainingMicros, quota.currency)}</span><span>截止 {new Date(quota.periodEnd).toLocaleDateString('zh-CN')}</span></div></>}
      </article>
    </div>
    <div className="cloud-usage-grid" aria-label="近 30 天模型用量">
      <div><span>模型请求</span><strong>{Number(usage?.request_count || 0).toLocaleString('zh-CN')}</strong></div>
      <div><span>输入 Token</span><strong>{Number(usage?.prompt_tokens || 0).toLocaleString('zh-CN')}</strong></div>
      <div><span>输出 Token</span><strong>{Number(usage?.completion_tokens || 0).toLocaleString('zh-CN')}</strong></div>
      <div><span>确认消耗</span><strong>{formatCloudMoney(Number(usage?.actual_micros || 0), quota?.currency || 'CNY')}</strong></div>
    </div>
    <div className="account-module-actions"><button className="button" type="button" onClick={() => void action('正在刷新账号数据', async () => replaceState(await window.stable.cloud.refresh()))}><RotateCw size={15} aria-hidden="true" />刷新账号</button><button className="text-button account-logout" type="button" onClick={() => void action('正在退出云端账号', async () => replaceState(await window.stable.cloud.logout()))}><LogOut size={15} aria-hidden="true" />退出账号</button></div>
  </section>
}

function UpdateSettingsModule({ state, action }: { state: BootstrapData; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const update = state.update
  const status = update.status === 'development' ? '开发模式不连接更新服务'
    : update.status === 'checking' ? '正在检查更新…'
      : update.status === 'available' ? `发现新版本 v${update.availableVersion}，正在准备下载`
        : update.status === 'downloading' ? `正在下载 ${update.progress}%`
          : update.status === 'downloaded' ? `v${update.availableVersion} 已下载，等待安装`
            : update.status === 'installing' ? `正在打开 v${update.availableVersion} 安装进度窗口`
              : update.status === 'error' ? update.error : '已开启自动检查和下载，安装由你决定'
  const buttonLabel = update.status === 'available' ? '下载更新'
    : update.status === 'downloading' ? `下载中 ${update.progress}%`
      : update.status === 'downloaded' ? '安装更新'
        : update.status === 'installing' ? '正在安装' : '检查更新'
  const runUpdateAction = () => {
    if (update.status === 'available') return action('正在下载软件更新', async () => { await window.stable.updater.download() })
    if (update.status === 'downloaded') return action('正在安装软件更新', async () => { await window.stable.updater.install() })
    return action('正在检查软件更新', async () => { await window.stable.updater.check() })
  }
  return <section className="update-settings account-update-settings">
    <div className="update-settings-row" data-update-ready={['available', 'downloading', 'downloaded'].includes(update.status) || undefined}><div><strong>当前版本 v{update.currentVersion}</strong><span aria-live="polite">{status}</span></div><button className="button" type="button" disabled={['checking', 'downloading', 'installing'].includes(update.status)} onClick={() => void runUpdateAction()}>{buttonLabel}</button></div>
    <p>Stable 启动时和运行期间会自动检查更新，发现新版后自动下载。下载完成后点击左下角进度按钮或“安装更新”开始安装；退出软件不会自动安装。</p>
  </section>
}

function AgentHistoryModule({ state, action }: { state: BootstrapData; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [globalFile, setGlobalFile] = useState<GlobalInstructionsFile>({ path: `${state.paths.userData}\\AGENTS.md`, content: '', exists: false })
  const [globalDraft, setGlobalDraft] = useState('')
  const [globalStatus, setGlobalStatus] = useState('正在读取本机记录…')
  useEffect(() => {
    let active = true
    window.stable.settings.globalInstructions().then((value) => {
      if (!active) return
      setGlobalFile(value)
      setGlobalDraft(value.content)
      setGlobalStatus(value.exists ? '已读取当前记录' : '文件尚未创建，保存时会自动创建')
    }).catch((reason) => { if (active) setGlobalStatus(errorMessage(reason)) })
    return () => { active = false }
  }, [])
  return <section className="global-instructions-settings account-agent-history">
    <p>内容保存到本机 AGENTS.md，仅在之后启动的新任务中读取。</p>
    <div className="field"><label htmlFor="account-global-instructions">本机全局说明</label><textarea id="account-global-instructions" rows={9} value={globalDraft} onChange={(event) => { setGlobalDraft(event.target.value); setGlobalStatus('有尚未保存的更改') }} placeholder="例如：默认使用简体中文；交付文件保存到工作区并返回完整路径。" /></div>
    <div className="global-instructions-meta"><code>{globalFile.path}</code><span role="status">{globalStatus}</span></div>
    <button className="button primary" type="button" onClick={() => void action('正在保存全局 Agent 对话提醒', async () => { const saved = await window.stable.settings.saveGlobalInstructions(globalDraft); setGlobalFile(saved); setGlobalDraft(saved.content); setGlobalStatus('已保存，只影响之后启动的新任务') })}><Save size={17} aria-hidden="true" />保存记录</button>
  </section>
}
