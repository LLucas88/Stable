import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, ArrowUp, AtSign, BookOpenText, Bot, Box, Braces, Check, ChevronDown, ChevronRight, CircleAlert,
  CircleStop, Clock3, Copy, Database, Eye, FilePlus2, FileText, FolderInput, Home, KeyRound, Library,
  Laptop2, LoaderCircle, MessageSquareText, Moon, Network, PanelLeftOpen, PanelRightClose, PanelRightOpen, Paperclip, Pencil, Play, Plus, Save,
  RotateCw, SendHorizontal, Settings, Shield, ShieldCheck, Sparkles, Sun, Trash2, Search, UploadCloud, UsersRound, Wifi, Workflow, Wrench, X,
} from 'lucide-react'
import logoUrl from '../build/stable_logo_transparent.png'
import launchLogoUrl from '../build/stable_launch_logo.png'
import sidebarLogoDarkUrl from '../build/stable_logo_sidebar_dark.png'
import sidebarLogoLightUrl from '../build/stable_logo_sidebar_light.png'
import { ReportPage } from './ReportPage'
import { WorkflowStudio } from './WorkflowStudio'
import { formatElapsedTime } from './duration'
import type { AgentAttachment, AgentCapability, AgentPermissionMode, AgentReference, AgentReferenceKind, AgentState, AgentTraceItem, AgentTraceKind, AgentTraceStatus, AutomationDraft, AutomationItem, AutomationSchedule, AutomationState, BootstrapData, ConversationItem, DataItem, DataLibraryCategory, DataLibraryItem, GlobalInstructionsFile, KnowledgeDocument, KnowledgeItem, LibraryRunStatus, MessageItem, ModelSettings, Page, PreviewBounds, PreviewState, SkillItem, TeamState, ThemeMode } from './types'

const NAV: Array<{ id: Page; label: string; icon: typeof Home }> = [
  { id: 'agent', label: '对话', icon: MessageSquareText },
  { id: 'automations', label: '定时', icon: Clock3 },
  { id: 'team', label: 'Team', icon: UsersRound },
  { id: 'data', label: '数据', icon: Database },
  { id: 'reports', label: '报告', icon: FileText },
  { id: 'skills', label: 'Skills', icon: Braces },
  { id: 'workflows', label: '工作流', icon: Workflow },
  { id: 'knowledge', label: '知识库', icon: BookOpenText },
  { id: 'settings', label: '设置', icon: Settings },
]

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
}

function DropTarget({ label, onPaths, className = '', children }: { label: string; onPaths: (paths: string[]) => void | Promise<void>; className?: string; children: ReactNode }) {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  function pathsFromEvent(event: DragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.files).map((file) => window.stable.files.path(file)).filter(Boolean)
  }
  return <div
    className={`drop-target ${className}`.trim()}
    data-dragging={dragging || undefined}
    onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
    onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void onPaths(pathsFromEvent(event)) }}
  >
    {children}
    {dragging && <div className="drop-overlay" role="status"><UploadCloud size={24} aria-hidden="true" /><strong>{label}</strong><span>松开即可继续</span></div>}
  </div>
}

export function App() {
  const requestedPage = new URLSearchParams(window.location.search).get('page') as Page | null
  const [page, setPage] = useState<Page>(requestedPage && NAV.some((item) => item.id === requestedPage) ? requestedPage : 'agent')
  const [agentPrefill, setAgentPrefill] = useState('')
  const [state, setState] = useState<BootstrapData | null>(null)
  const [showLaunch, setShowLaunch] = useState(true)
  const [launchRunning, setLaunchRunning] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('正在读取本地工作区')
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; detail: string } | null>(null)
  const confirmationResolver = useRef<((value: boolean) => void) | null>(null)

  useEffect(() => {
    return window.stable.appearance.onLaunchStart(() => setLaunchRunning(true))
  }, [])

  useEffect(() => window.stable.team.onEvent((team) => {
    setState((current) => current ? { ...current, team } : current)
    if (team.tasks.some((task) => task.events.at(-1)?.type === 'continuation_completed')) {
      setState((current) => {
        if (!current) return current
        void window.stable.agent.state(current.activeConversationId).then((agent) => setState((latest) => latest ? { ...latest, ...agent } : latest)).catch(() => {})
        return current
      })
    }
  }), [])

  useEffect(() => window.stable.agent.onState((agent) => setState((current) => {
    if (!current) return current
    return current.activeConversationId === agent.activeConversationId
      ? { ...current, ...agent }
      : { ...current, conversations: agent.conversations }
  })), [])

  useEffect(() => window.stable.automations.onEvent((automations) => setState((current) => current ? { ...current, automations } : current)), [])
  useEffect(() => window.stable.updater.onEvent((update) => setState((current) => current ? { ...current, update } : current)), [])

  useEffect(() => {
    if (!launchRunning || !showLaunch) return
    const timer = window.setTimeout(() => {
      setShowLaunch(false)
      void window.stable.appearance.completeLaunch()
    }, 2100)
    return () => window.clearTimeout(timer)
  }, [launchRunning, showLaunch])

  function finishLaunch() {
    setShowLaunch(false)
    void window.stable.appearance.completeLaunch()
  }

  useEffect(() => {
    window.stable.bootstrap().then((value) => {
      document.documentElement.dataset.theme = value.theme
      setState(value)
      setStatus(value.runtimeReady ? '本地运行时就绪' : 'Harness 运行时缺失')
    }).catch((reason) => { setError(errorMessage(reason)); setStatus('启动失败') })
  }, [])

  useEffect(() => {
    const preventNavigation = (event: globalThis.DragEvent) => event.preventDefault()
    window.addEventListener('dragover', preventNavigation)
    window.addEventListener('drop', preventNavigation)
    return () => { window.removeEventListener('dragover', preventNavigation); window.removeEventListener('drop', preventNavigation) }
  }, [])

  const update = <K extends keyof BootstrapData>(key: K, value: BootstrapData[K]) => setState((current) => current ? { ...current, [key]: value } : current)

  function requestConfirmation(label: string) {
    const actionName = label.replace(/^正在/, '')
    setConfirmation({ title: '确认操作', message: `${actionName}？`, detail: '该操作会修改 Stable 在本机保存的内容，请确认后继续。' })
    return new Promise<boolean>((resolve) => { confirmationResolver.current = resolve })
  }

  function resolveConfirmation(value: boolean) {
    confirmationResolver.current?.(value)
    confirmationResolver.current = null
    setConfirmation(null)
  }

  async function action(label: string, run: () => Promise<void>) {
    if (/(删除|移出|清空)/.test(label) && !await requestConfirmation(label)) return
    setBusy(label); setError(''); setStatus(label)
    try { await run(); setStatus('本地更改已保存') }
    catch (reason) { setError(errorMessage(reason)); setStatus('操作未完成') }
    finally { setBusy('') }
  }

  const launch = showLaunch ? <LaunchSplash running={launchRunning} onFinish={finishLaunch} /> : null

  if (!state) return <><div className="window-shell"><WindowTitlebar /><BootScreen status={status} error={error} /></div>{launch}</>

  return (
    <><div className="window-shell">
      <WindowTitlebar />
      <div className="app-shell">
      <aside className="side-rail" aria-label="主导航">
        <button className="brand-mark" onClick={() => setPage('agent')} aria-label="打开对话">
          <img src={state.theme === 'light' ? sidebarLogoLightUrl : sidebarLogoDarkUrl} alt="Stable" width="48" height="48" />
        </button>
        <nav className="rail-nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className="rail-button" data-active={page === id} onClick={() => setPage(id)} aria-label={label} aria-current={page === id ? 'page' : undefined}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-version" aria-label={`Stable 版本 ${state.appVersion}`}>v{state.appVersion}</div>
      </aside>

      <main className="main-frame">
        <div className="page-stage" data-page="agent" hidden={page !== 'agent'}>
          <AgentPage active={page === 'agent'} state={state} prefill={agentPrefill} consumePrefill={() => setAgentPrefill('')} updateAgent={(agent) => setState((current) => current ? { ...current, ...agent } : current)} updateAutomations={(automations) => update('automations', automations)} updateTeam={(team) => update('team', team)} action={action} reportError={(reason) => { setError(errorMessage(reason)); setStatus('操作未完成') }} />
        </div>
        <div className="page-stage" data-page="workflows" hidden={page !== 'workflows'}>
          <WorkflowStudio state={state} update={(items) => update('workflows', items)} action={action} busy={busy} />
        </div>
        {page !== 'agent' && page !== 'workflows' && <div className="page-stage" data-page={page} key={page}>
          {page === 'automations' && <AutomationsPage state={state.automations} update={(automations) => update('automations', automations)} goChat={() => { setAgentPrefill('帮我创建一个定时任务：'); setPage('agent') }} action={action} />}
          {page === 'team' && <TeamPage state={state} updateTeam={(team) => update('team', team)} action={action} />}
          {page === 'data' && <DataPage dataItems={state.data} libraryItems={state.library} updateData={(items) => update('data', items)} updateLibrary={(items) => update('library', items)} action={action} />}
          {page === 'reports' && <ReportPage items={state.reports} update={(items) => update('reports', items)} action={action} />}
          {page === 'skills' && <SkillsPage items={state.skills} update={(items) => update('skills', items)} action={action} />}
          {page === 'knowledge' && <KnowledgePage items={state.knowledge} update={(items) => update('knowledge', items)} action={action} />}
          {page === 'settings' && <SettingsPage state={state} updateModel={(model) => update('model', model)} updateTheme={(theme) => update('theme', theme)} action={action} />}
        </div>}

      </main>

        {(state.update.status === 'downloaded' || state.update.status === 'installing') && <section className="update-notice" role="status"><div><strong>Stable {state.update.availableVersion} {state.update.status === 'installing' ? '正在更新' : '已准备好'}</strong><span>{state.update.status === 'installing' ? 'Stable 正在关闭并静默安装，完成后会自动重新启动。' : '点击后将自动关闭 Stable、静默安装并重新启动，无需操作安装程序。'}</span></div>{state.update.status === 'downloaded' && <button className="button primary" type="button" onClick={() => void window.stable.updater.install()}>重启并更新</button>}</section>}

        {confirmation && <ConfirmModal value={confirmation} onCancel={() => resolveConfirmation(false)} onConfirm={() => resolveConfirmation(true)} />}
        {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={18} /></button></div>}
      </div>
    </div>{launch}</>
  )
}

function ConfirmModal({ value, onCancel, onConfirm }: { value: { title: string; message: string; detail: string }; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return <div className="confirm-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-detail">
      <div className="confirm-mark"><CircleAlert size={19} /></div>
      <div className="confirm-copy"><span>{value.title}</span><h2 id="confirm-title">{value.message}</h2><p id="confirm-detail">{value.detail}</p></div>
      <div className="confirm-actions"><button className="button" type="button" onClick={onCancel}>取消</button><button className="button danger" type="button" autoFocus onClick={onConfirm}>确认</button></div>
    </section>
  </div>
}

function LaunchSplash({ running, onFinish }: { running: boolean; onFinish: () => void }) {
  return <div
    className="launch-splash"
    data-running={running}
    role="button"
    tabIndex={0}
    aria-label="Stable 正在启动，点击跳过动画"
    onPointerDown={onFinish}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onFinish() }}
  >
    <div className="launch-aura" aria-hidden="true" />
    <div className="launch-logo-wrap">
      <img className="launch-logo" src={launchLogoUrl} alt="Stable" />
      <span className="launch-scan" aria-hidden="true" />
    </div>
  </div>
}

function WindowTitlebar() {
  return <div className="window-titlebar" aria-hidden="true">
    <img src={logoUrl} alt="" width="16" height="16" />
    <span>Stable</span>
  </div>
}

function BootScreen({ status, error }: { status: string; error: string }) {
  return <div className="boot-screen"><img src={logoUrl} alt="Stable" width="112" height="112" /><LoaderCircle className="spin" size={22} /><p>{error || status}</p></div>
}

function TeamPage({ state, updateTeam, action }: { state: BootstrapData; updateTeam: (team: TeamState) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [teamName, setTeamName] = useState('我的 Stable Team')
  const [deviceName, setDeviceName] = useState(() => `设备-${Math.random().toString(36).slice(2, 6).toUpperCase()}`)
  const [inviteCode, setInviteCode] = useState('')
  const team = state.team

  function createTeam() {
    void action('正在创建 Team', async () => updateTeam(await window.stable.team.create(teamName.trim(), deviceName.trim())))
  }

  function joinTeam() {
    void action('正在加入 Team', async () => updateTeam(await window.stable.team.join(inviteCode.trim(), deviceName.trim())))
  }

  if (!team.profile) return <section className="team-page reveal">
    <div className="team-lead"><span>STABLE TEAM · LAN MESH</span><h2>让局域网内的 Stable 协同完成任务</h2><p>创建者启动局域网 Relay，其他设备通过邀请码加入。Stable 只共享能力元数据，实际数据、Skill、脚本与凭证仍留在提供能力的设备上。</p></div>
    <div className="team-onboarding-grid">
      <article className="team-join-card"><div className="team-card-mark"><UsersRound size={21} /></div><span>创建网络</span><h3>新建 Team</h3><p>本设备将监听局域网 Relay，并成为 Team 所有者。</p><label>Team 名称<input value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label><label>本设备名称<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label><button className="button primary" type="button" onClick={createTeam} disabled={!teamName.trim() || !deviceName.trim()}><Network size={17} />创建 Team</button></article>
      <article className="team-join-card"><div className="team-card-mark"><Laptop2 size={21} /></div><span>加入网络</span><h3>使用邀请码加入</h3><p>粘贴另一台 Stable 提供的邀请码，身份只保存在本机。</p><label>Team 邀请码<textarea rows={4} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="STB1-…" /></label><label>本设备名称<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label><button className="button primary" type="button" onClick={joinTeam} disabled={!inviteCode.trim() || !deviceName.trim()}><Wifi size={17} />加入 Team</button></article>
    </div>
  </section>

  return <section className="team-page reveal">
    <div className="team-summary">
      <div className="team-summary-title"><span className="team-kicker">STABLE TEAM</span><h2>{team.profile.teamName}</h2><div className="team-connection" data-status={team.connection}><span className="team-pulse" />{team.connection === 'online' ? 'Relay 已连接' : team.connection === 'connecting' ? '正在连接' : 'Relay 离线'}</div></div>
      <div className="team-invite"><span>设备邀请码</span><code>{team.profile.inviteCode}</code><button className="button" type="button" onClick={() => void navigator.clipboard.writeText(team.profile!.inviteCode)}>复制邀请码</button></div>
      <button className="text-button" type="button" onClick={() => void action('正在离开 Team', async () => updateTeam(await window.stable.team.leave()))}>离开 Team</button>
    </div>

    <section className="team-section"><header><div><span>DEVICE MESH</span><h3>设备与能力</h3></div><small>{team.devices.filter((item) => item.status === 'online').length} 台在线</small></header>
      <div className="team-device-grid">{team.devices.map((device) => {
        const local = device.id === team.profile?.deviceId
        return <article className="team-device-card" data-online={device.status === 'online' || undefined} key={device.id}>
          <div className="team-device-head"><span><Laptop2 size={18} /></span><div><strong>{device.name}</strong><small>{local ? '本设备' : device.role === 'owner' ? 'Team 所有者' : device.role === 'admin' ? '管理员' : '成员设备'}</small></div><span className="device-presence"><i />{device.status === 'online' ? '在线' : '离线'}</span></div>
          <div className="capability-chips">{(device.capabilities.skills || []).slice(0, 3).map((name) => <span key={`skill-${name}`}>Skill · {name}</span>)}{(device.capabilities.scripts || []).slice(0, 3).map((name) => <span key={`script-${name}`}>脚本 · {name}</span>)}{(device.capabilities.tools || []).slice(0, 2).map((name) => <span key={`tool-${name}`}>Tool · {name}</span>)}{(device.capabilities.plugins || []).slice(0, 2).map((name) => <span key={`plugin-${name}`}>Plugin · {name}</span>)}<span>{device.capabilities.dataCount || 0} 数据</span><span>{device.capabilities.knowledgeCount || 0} 知识</span></div>
          {!local && <div className="team-device-controls">
            {team.profile?.role === 'owner' && <select value={device.role === 'admin' ? 'admin' : 'member'} onChange={(event) => void action('正在更新成员角色', async () => updateTeam(await window.stable.team.setRole(device.id, event.target.value as 'admin' | 'member')))} disabled={device.status !== 'online'}><option value="member">成员</option><option value="admin">管理员</option></select>}
          </div>}
        </article>
      })}</div>
    </section>

    <section className="team-section team-policy"><header><div><span>CONVERSATION RELAY</span><h3>对话快照共享边界</h3></div><small>发送入口位于对话输入框的 @ 按钮</small></header>
      <div className="team-policy-grid">
        <div><strong>只发送当前快照</strong><p>包含发送时已有的用户问题、Stable 回答和引用名称；发送后的新消息不会继续同步。</p></div>
        <div><strong>接收方必须确认</strong><p>每一份快照都需要接收设备手动接受或拒绝。拒绝后不会进入对话记录。</p></div>
        <div><strong>本地资源不随对话发送</strong><p>不打包工作区文件、数据正文、Skill、脚本、凭证、工具过程或模型隐藏思维。</p></div>
      </div>
    </section>

    <section className="team-section"><header><div><span>TEAM AUDIT</span><h3>网络与权限记录</h3></div><small>{team.audit?.length || 0} 条记录</small></header>
      {team.audit?.length ? <div className="team-audit-list">{team.audit.slice(-12).reverse().map((event) => <article key={event.id}><time>{new Date(event.createdAt).toLocaleString('zh-CN')}</time><strong>{event.type}</strong><p>{event.detail}</p></article>)}</div> : <div className="team-empty"><Network size={22} /><strong>暂无 Team 审计记录</strong><span>角色、信任策略和网络事件会记录在这里。</span></div>}
    </section>
  </section>
}

function HomePage({ state, go }: { state: BootstrapData; go: (page: Page) => void }) {
  const metrics = [
    { value: state.data.length, label: '本地数据', icon: Database },
    { value: state.reports.length, label: 'HTML 报告', icon: FileText },
    { value: state.skills.length, label: 'Skills', icon: Braces },
    { value: state.workflows.length, label: '工作流', icon: Workflow },
    { value: state.knowledge.length, label: '知识文档', icon: BookOpenText },
  ]
  return <section className="home-layout reveal">
    <div className="home-intro">
      <div className="signal-mark"><Sparkles size={18} aria-hidden="true" /></div>
      <h2><span>AI_Native助力业务流程优化</span><span>本地部署的Agent助理，确保数据安全</span><span>数据存储库致力专注</span></h2>
      <div className="button-row">
        <button className="button primary" onClick={() => go('agent')}><MessageSquareText size={17} />开始对话</button>
        <button className="button" onClick={() => go('data')}><FilePlus2 size={17} />导入数据</button>
      </div>
    </div>
    <div className="metric-sheet" aria-label="本地资源概览">
      {metrics.map(({ value, label, icon: Icon }) => <div className="metric-row" key={label}><Icon size={18} /><strong>{value}</strong><span>{label}</span></div>)}
      <div className="metric-note"><span className="status-dot" />所有内容默认保存在本机</div>
    </div>
    <div className="quick-strip">
      <button onClick={() => go('agent')}><Braces size={18} /><span><strong>在对话中安装 Skill</strong><small>发送完整 Skill 文件夹给 Agent</small></span></button>
      <button onClick={() => go('workflows')}><Workflow size={18} /><span><strong>编排工作流</strong><small>连接数据、脚本、知识与 AI</small></span></button>
      <button onClick={() => go('settings')}><KeyRound size={18} /><span><strong>配置模型</strong><small>DeepSeek 或 OpenAI 兼容服务</small></span></button>
    </div>
  </section>
}

const CAPABILITY_OPTIONS: Array<{ id: AgentCapability; label: string; detail: string }> = [
  { id: 'auto', label: '自动', detail: '根据任务复杂度自动选择回答深度。' },
  { id: 'fast', label: '快速回答', detail: '优先给出简洁、直接、可执行的结果。' },
  { id: 'reasoning', label: '深度推理', detail: '核对假设并分解复杂问题后再作答。' },
  { id: 'analysis', label: '数据分析', detail: '优先引用所选数据，区分事实、推断与缺口。' },
]

const PERMISSION_OPTIONS: Array<{ id: AgentPermissionMode; label: string; detail: string }> = [
  { id: 'request', label: '请求审批', detail: '超出工作区安全范围时，由你在对话内确认。' },
  { id: 'auto', label: '帮我审批', detail: '交给独立审批 Agent 检查；未通过时自动换方法。' },
  { id: 'full', label: '完全访问权限', detail: '普通操作直接执行；删除、覆盖和未知程序仍需你确认。' },
]

interface AgentTraceRun {
  runId: string
  items: AgentTraceItem[]
  status: AgentTraceStatus
  startedAt: number
  endedAt?: number
}

interface CopyUndoState {
  copiedPrompt: string
  prompt: string
  attachments: AgentAttachment[]
  references: AgentReference[]
}

type ConversationPreviewTarget =
  | { requestId: number; kind: 'web'; value: string; title: string }
  | { requestId: number; kind: 'markdown'; value: string; title: string }

function previewBounds(element: HTMLElement): PreviewBounds {
  const rect = element.getBoundingClientRect()
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
}

function AgentPage({ active, state, prefill, consumePrefill, updateAgent, updateAutomations, updateTeam, action, reportError }: { active: boolean; state: BootstrapData; prefill: string; consumePrefill: () => void; updateAgent: (value: AgentState) => void; updateAutomations: (value: AutomationState) => void; updateTeam: (value: TeamState) => void; action: (label: string, run: () => Promise<void>) => Promise<void>; reportError: (reason: unknown) => void }) {
  const [prompt, setPrompt] = useState('')
  const [pendingMap, setPendingMap] = useState<Record<string, { content: string; attachments: NonNullable<MessageItem['attachments']> } | undefined>>({})
  const [attachmentMap, setAttachmentMap] = useState<Record<string, AgentAttachment[]>>({})
  const [referenceMap, setReferenceMap] = useState<Record<string, AgentReference[]>>({})
  const [contextOpen, setContextOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [teamCollapsed, setTeamCollapsed] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<ConversationPreviewTarget>()
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewState, setPreviewState] = useState<PreviewState>({ url: '', title: '', loading: false, canGoBack: false, canGoForward: false })
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [traceMap, setTraceMap] = useState<Record<string, AgentTraceRun | undefined>>({})
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationWorkspaceRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const copyUndoRef = useRef<Record<string, CopyUndoState | undefined>>({})
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const dataMenuRef = useRef<HTMLDetailsElement>(null)
  const skillMenuRef = useRef<HTMLDetailsElement>(null)
  const teamMenuRef = useRef<HTMLDetailsElement>(null)
  const capabilityMenuRef = useRef<HTMLDetailsElement>(null)
  const permissionMenuRef = useRef<HTMLDetailsElement>(null)
  const activeConversationIdRef = useRef(state.activeConversationId)
  const stateRef = useRef(state)
  const activeConversation = state.conversations.find((item) => item.id === state.activeConversationId) || state.conversations[0]
  const running = Boolean(runningMap[state.activeConversationId])
  const pendingPrompt = pendingMap[state.activeConversationId]
  const liveTrace = traceMap[state.activeConversationId]
  const attachments = attachmentMap[state.activeConversationId] || []
  const selectedReferences = referenceMap[state.activeConversationId] || []
  const activeCapability = CAPABILITY_OPTIONS.find((item) => item.id === activeConversation?.capability) || CAPABILITY_OPTIONS[0]
  const activePermission = PERMISSION_OPTIONS.find((item) => item.id === activeConversation?.permissionMode) || PERMISSION_OPTIONS[0]
  const enabledData = state.data.filter((item) => item.enabled)
  const enabledSkills = state.skills.filter((item) => item.enabled)
  const enabledKnowledge = state.knowledge.filter((item) => item.enabled)
  const scripts = state.library.filter((item) => item.kind === 'script')
  const localConversations = state.conversations.filter((item) => item.sourceType !== 'team')
  const teamConversations = state.conversations.filter((item) => item.sourceType === 'team')
  const remoteTeamDevices = state.team.devices.filter((item) => item.id !== state.team.profile?.deviceId)
  activeConversationIdRef.current = state.activeConversationId
  stateRef.current = state

  useEffect(() => {
    if (!active || !prefill || running) return
    setPrompt(prefill); consumePrefill()
    window.requestAnimationFrame(() => { promptRef.current?.focus(); promptRef.current?.setSelectionRange(prefill.length, prefill.length) })
  }, [active, prefill, running])

  function setAttachments(next: AgentAttachment[] | ((current: AgentAttachment[]) => AgentAttachment[])) {
    setAttachmentMap((current) => {
      const currentItems = current[state.activeConversationId] || []
      return { ...current, [state.activeConversationId]: typeof next === 'function' ? next(currentItems) : next }
    })
  }

  function setReferences(next: AgentReference[] | ((current: AgentReference[]) => AgentReference[])) {
    setReferenceMap((current) => {
      const currentItems = current[state.activeConversationId] || []
      return { ...current, [state.activeConversationId]: typeof next === 'function' ? next(currentItems) : next }
    })
  }

  function toggleReference(reference: AgentReference) {
    setReferences((current) => current.some((item) => item.kind === reference.kind && item.id === reference.id)
      ? current.filter((item) => item.kind !== reference.kind || item.id !== reference.id)
      : [...current, reference])
  }

  useEffect(() => window.stable.agent.onEvent((event) => {
    if (!event.conversationId) return
    setTraceMap((all) => {
      const current = all[event.conversationId!]
      const sameRun = current?.runId === event.runId
      const awaitingFirstEvent = current?.runId === ''
      const items = sameRun ? [...current.items] : []
      const index = items.findIndex((item) => item.id === event.id)
      if (index >= 0) items[index] = event; else items.push(event)
      let status: AgentTraceStatus = sameRun ? current.status : 'running'
      if (event.id === 'complete') status = 'completed'
      if (event.id === 'runtime' && (event.status === 'failed' || event.status === 'cancelled')) status = event.status
      const terminal = status !== 'running'
      return { ...all, [event.conversationId!]: {
        runId: event.runId,
        items,
        status,
        startedAt: sameRun || awaitingFirstEvent ? current.startedAt : event.time,
        ...(terminal ? { endedAt: event.time } : {}),
      } }
    })
  }), [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: running ? 'smooth' : 'auto' })
  }, [state.messages.length, pendingPrompt, liveTrace?.items.length, running])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const menu of [dataMenuRef.current, skillMenuRef.current, teamMenuRef.current, capabilityMenuRef.current, permissionMenuRef.current]) {
        if (menu?.open && !menu.contains(event.target as Node)) menu.open = false
      }
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => document.removeEventListener('pointerdown', closeOutside, true)
  }, [])

  useEffect(() => window.stable.preview.onEvent((next) => setPreviewState((current) => ({ ...current, ...next }))), [])

  useEffect(() => () => { void window.stable.preview.close() }, [])

  useEffect(() => {
    if (active || !previewTarget) return
    setPreviewTarget(undefined); setPreviewWidth(0); void window.stable.preview.close()
  }, [active, previewTarget])

  useEffect(() => {
    if (!previewTarget) return
    let cancelled = false
    let frame = window.requestAnimationFrame(() => {
      const workspace = conversationWorkspaceRef.current
      if (!workspace) return
      if (!previewWidth) {
        setPreviewWidth(Math.max(320, Math.round(workspace.clientWidth / 2)))
        frame = window.requestAnimationFrame(open)
      } else open()
    })
    async function open() {
      const viewport = previewViewportRef.current
      if (!viewport || !previewTarget || cancelled) return
      const bounds = previewBounds(viewport)
      try {
        const next = previewTarget.kind === 'web'
          ? await window.stable.preview.openWeb(previewTarget.value, bounds)
          : await window.stable.preview.openMarkdown(previewTarget.value, bounds, activeConversation.id)
        if (!cancelled) setPreviewState(next)
      } catch (reason) {
        if (!cancelled) setPreviewState((current) => ({ ...current, loading: false, error: errorMessage(reason) }))
      }
    }
    return () => { cancelled = true; window.cancelAnimationFrame(frame) }
  }, [previewTarget?.requestId])

  useEffect(() => {
    if (!previewTarget || !previewViewportRef.current) return
    const viewport = previewViewportRef.current
    const observer = new ResizeObserver(() => { void window.stable.preview.setBounds(previewBounds(viewport)) })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [previewTarget])

  function openConversationPreview(target: Omit<ConversationPreviewTarget, 'requestId'>) {
    setContextOpen(false)
    setPreviewWidth(0)
    setPreviewState({ url: target.kind === 'web' ? target.value : '', title: target.title, loading: true, canGoBack: false, canGoForward: false })
    setPreviewTarget({ ...target, requestId: Date.now() })
  }

  function closeConversationPreview() {
    setPreviewTarget(undefined)
    setPreviewWidth(0)
    void window.stable.preview.close()
  }

  function resizePreviewBy(delta: number) {
    const width = conversationWorkspaceRef.current?.clientWidth || 0
    if (!width) return
    setPreviewWidth((current) => Math.max(320, Math.min(width - 360, (current || Math.round(width / 2)) + delta)))
  }

  function startPreviewResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!previewTarget) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = previewWidth
    const available = conversationWorkspaceRef.current?.clientWidth || 0
    const move = (next: PointerEvent) => setPreviewWidth(Math.max(320, Math.min(available - 360, startWidth + startX - next.clientX)))
    const finish = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish, { once: true })
  }

  function replaceConversation(run: () => Promise<AgentState>, label: string) {
    setPrompt(''); setSidebarOpen(false)
    void action(label, async () => updateAgent(await run()))
  }

  function configure(capability: AgentCapability, dataIds: string[]) {
    if (!activeConversation) return
    void action('正在保存对话设置', async () => updateAgent(await window.stable.agent.configure(activeConversation.id, capability, dataIds)))
  }

  function configurePermission(permissionMode: AgentPermissionMode) {
    if (!activeConversation) return
    void action('正在保存权限设置', async () => updateAgent(await window.stable.agent.configurePermission(activeConversation.id, permissionMode)))
  }

  function commitRename(id: string) {
    const title = editingTitle.trim()
    setEditingId('')
    if (!title) return
    void action('正在重命名对话', async () => updateAgent(await window.stable.agent.rename(id, title)))
  }

  function addAttachments(paths: string[]) {
    if (!paths.length) return
    void action('正在读取临时附件', async () => {
      const inspected = await window.stable.agent.inspectAttachments(paths)
      const merged = [...attachments]
      for (const item of inspected) if (!merged.some((existing) => existing.path === item.path)) merged.push(item)
      if (merged.length > 8) throw new Error('一次最多添加 8 个临时附件。')
      setAttachments(merged)
    })
  }

  function addSkillFolder() {
    void action('正在读取 Skill 文件夹', async () => {
      const inspected = await window.stable.agent.selectSkillFolder()
      if (!inspected.length) return
      const merged = [...attachments]
      for (const item of inspected) if (!merged.some((existing) => existing.path === item.path)) merged.push(item)
      if (merged.length > 8) throw new Error('一次最多添加 8 个临时附件。')
      setAttachments(merged)
    })
  }

  function shareConversation(targetDeviceId: string) {
    if (!activeConversation) return
    void action('正在发送对话快照', async () => {
      updateTeam(await window.stable.team.shareConversation(targetDeviceId, activeConversation.id))
      if (teamMenuRef.current) teamMenuRef.current.open = false
    })
  }

  function decideConversation(offerId: string, allowed: boolean) {
    void action(allowed ? '正在接收 Team 对话' : '正在拒绝 Team 对话', async () => {
      const result = await window.stable.team.decideConversation(offerId, allowed)
      updateTeam(result.team)
      updateAgent(result.agent)
    })
  }

  function referenceFromMessage(item: NonNullable<MessageItem['attachments']>[number]) {
    if (item.kind === 'attachment') return undefined
    if (item.kind === 'data') {
      const value = state.data.find((entry) => entry.id === item.id) || state.data.find((entry) => entry.name === item.name)
      return value ? { id: value.id, kind: item.kind, name: value.name, size: value.size, type: value.type } : undefined
    }
    if (item.kind === 'skill') {
      const value = state.skills.find((entry) => entry.id === item.id) || state.skills.find((entry) => entry.name === item.name)
      return value ? { id: value.id, kind: item.kind, name: value.name, size: new Blob([value.content || '']).size, type: 'skill' } : undefined
    }
    if (item.kind === 'script') {
      const value = state.library.find((entry) => entry.kind === 'script' && (entry.id === item.id || entry.name === item.name))
      return value ? { id: value.id, kind: item.kind, name: value.name, size: new Blob([value.content || '']).size, type: value.extension || 'script' } : undefined
    }
    const value = state.knowledge.find((entry) => entry.id === item.id) || state.knowledge.find((entry) => entry.name === item.name)
    return value ? { id: value.id, kind: item.kind, name: value.name, size: value.size, type: 'markdown' } : undefined
  }

  function markdownPathFromMessage(item: NonNullable<MessageItem['attachments']>[number]) {
    const markdown = /\.(?:md|markdown)$/i.test(item.name) || /^(?:md|markdown)$/i.test(item.type)
    if (!markdown) return ''
    if (item.path) return item.path
    if (item.kind === 'knowledge') return (state.knowledge.find((entry) => entry.id === item.id) || state.knowledge.find((entry) => entry.name === item.name))?.path || ''
    if (item.kind === 'data') return (state.data.find((entry) => entry.id === item.id) || state.data.find((entry) => entry.name === item.name))?.path || ''
    return ''
  }

  function previewMessageAttachment(item: NonNullable<MessageItem['attachments']>[number]) {
    const filePath = markdownPathFromMessage(item)
    if (filePath) openConversationPreview({ kind: 'markdown', value: filePath, title: item.name })
  }

  async function copyUserMessage(message: MessageItem) {
    const restoredReferences = (message.attachments || []).map(referenceFromMessage).filter((item): item is AgentReference => Boolean(item))
    const restoredAttachments: AgentAttachment[] = []
    for (const item of message.attachments || []) {
      if (item.kind !== 'attachment' || !item.path) continue
      try { restoredAttachments.push(...await window.stable.agent.inspectAttachments([item.path])) } catch { /* missing legacy attachment stays omitted */ }
    }
    copyUndoRef.current[state.activeConversationId] = { copiedPrompt: message.content, prompt, attachments: [...attachments], references: [...selectedReferences] }
    setPrompt(message.content)
    setAttachments(restoredAttachments)
    setReferences(restoredReferences)
    window.requestAnimationFrame(() => { promptRef.current?.focus(); promptRef.current?.setSelectionRange(message.content.length, message.content.length) })
  }

  function undoCopiedDraft() {
    const undo = copyUndoRef.current[state.activeConversationId]
    if (!undo || prompt !== undo.copiedPrompt) return false
    setPrompt(undo.prompt); setAttachments(undo.attachments); setReferences(undo.references)
    copyUndoRef.current[state.activeConversationId] = undefined
    window.requestAnimationFrame(() => { promptRef.current?.focus(); promptRef.current?.setSelectionRange(undo.prompt.length, undo.prompt.length) })
    return true
  }

  function ConversationRow({ item }: { item: ConversationItem }) {
    return <article className="conversation-list-item" data-active={item.id === activeConversation.id || undefined} key={item.id}>
      {editingId === item.id
        ? <input className="conversation-title-input" autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => commitRename(item.id)} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(item.id); if (event.key === 'Escape') setEditingId('') }} aria-label="对话名称" />
        : <button className="conversation-select" type="button" onClick={() => item.id !== activeConversation.id ? replaceConversation(() => window.stable.agent.select(item.id), '正在切换对话') : setSidebarOpen(false)}>
          <strong>{item.title}</strong>{item.sourceType === 'team' && <small>{item.sourceDeviceName || 'Team'}</small>}{runningMap[item.id] && <small className="conversation-running"><LoaderCircle className="spin" size={12} />执行中</small>}
        </button>}
      <div className="conversation-item-actions">
        <button type="button" onClick={() => { setEditingId(item.id); setEditingTitle(item.title) }} aria-label={`重命名 ${item.title}`}><Pencil size={14} /></button>
        <button type="button" disabled={Boolean(runningMap[item.id])} onClick={() => replaceConversation(() => window.stable.agent.remove(item.id), '正在删除对话')} aria-label={`删除 ${item.title}`}><Trash2 size={14} /></button>
      </div>
    </article>
  }

  async function send() {
    if ((!prompt.trim() && !attachments.length && !selectedReferences.length) || running) return
    const conversationId = state.activeConversationId
    const value = prompt.trim() || '请读取并分析本次引用的资源与附件。'
    const currentAttachments = [...attachments]
    const currentReferences = [...selectedReferences]
    const messageAttachments: NonNullable<MessageItem['attachments']> = [
      ...currentReferences.map(({ id, kind, name, size, type }) => ({ id, kind, name, size, type })),
      ...currentAttachments.map((item) => ({ kind: item.type === 'skill' ? 'skill' as const : 'attachment' as const, name: item.name, size: item.size, type: item.type, path: item.path })),
    ]
    copyUndoRef.current[conversationId] = undefined
    setPrompt(''); setAttachments([]); setReferences([])
    setPendingMap((current) => ({ ...current, [conversationId]: { content: value, attachments: messageAttachments } }))
    setTraceMap((current) => ({ ...current, [conversationId]: { runId: '', items: [], status: 'running', startedAt: Date.now() } }))
    setRunningMap((current) => ({ ...current, [conversationId]: true }))
    let completed = false
    try {
      await window.stable.agent.configure(conversationId, activeConversation.capability, [])
      const result = await window.stable.agent.run(conversationId, value, currentAttachments, currentReferences)
      updateAgentForConversation(result, conversationId)
      completed = true
    } catch (error) {
      reportError(error)
      try { updateAgentForConversation(await window.stable.agent.state(conversationId), conversationId) } catch { /* keep the active task usable */ }
    } finally {
      setPendingMap((current) => ({ ...current, [conversationId]: undefined }))
      setTraceMap((current) => ({ ...current, [conversationId]: completed ? undefined : current[conversationId] }))
      setRunningMap((current) => ({ ...current, [conversationId]: false }))
    }
  }

  function updateAgentForConversation(result: AgentState, conversationId: string) {
    if (activeConversationIdRef.current === conversationId) updateAgent(result)
    else updateAgent({ ...result, activeConversationId: activeConversationIdRef.current, messages: stateRef.current.messages })
  }

  if (!activeConversation) return <section className="agent-layout reveal"><Empty icon={MessageSquareText} title="正在准备对话" detail="Stable 正在创建第一个独立任务。" /></section>

  return <section className="agent-layout reveal" data-context-open={contextOpen || undefined} data-sidebar-open={sidebarOpen || undefined}>
    <aside className="conversation-sidebar" aria-label="对话任务">
      <div className="conversation-new-zone">
        <button className="conversation-new" type="button" onClick={() => replaceConversation(() => window.stable.agent.create(), '正在新建对话')}><Plus size={17} />新建对话</button>
      </div>
      <section className="conversation-history-card" aria-label="本机对话记录">
        <div className="conversation-history-head"><span>任务记录</span></div>
        <div className="conversation-list">
          {localConversations.map((item) => <ConversationRow item={item} key={item.id} />)}
        </div>
      </section>
      <section className="team-conversation-zone" data-collapsed={teamCollapsed || undefined} aria-label="Team 对话">
        <div className="team-conversation-head">
          {!teamCollapsed && <div className="team-conversation-title"><span>TEAM</span><small>{state.team.conversationOffers.length ? `${state.team.conversationOffers.length} 待确认` : '对话快照'}</small></div>}
          <button className="team-collapse-button" type="button" onClick={() => setTeamCollapsed((value) => !value)} aria-expanded={!teamCollapsed} aria-label={teamCollapsed ? '展开 Team 对话' : '收起 Team 对话'}>
            {teamCollapsed ? <UsersRound size={18} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        </div>
        {!teamCollapsed && <>
          {state.team.conversationOffers.map((offer) => <article className="team-offer-card" key={offer.id}>
            <div><small>来自 {offer.sourceDeviceName}</small><strong>{offer.title}</strong><span>{offer.messageCount} 条问答消息</span></div>
            <div><button type="button" onClick={() => decideConversation(offer.id, false)}>拒绝</button><button type="button" className="primary" onClick={() => decideConversation(offer.id, true)}>接收</button></div>
          </article>)}
          <div className="team-conversation-list">{teamConversations.map((item) => <ConversationRow item={item} key={item.id} />)}</div>
          {!state.team.conversationOffers.length && !teamConversations.length && <p className="team-conversation-empty">接收的 Team 对话会显示在这里</p>}
        </>}
      </section>
    </aside>
    <div className="conversation-workspace" data-preview-open={Boolean(previewTarget) || undefined} ref={conversationWorkspaceRef} style={previewTarget ? { '--preview-width': `${previewWidth || 320}px` } as CSSProperties : undefined}>
    <div className="conversation">
      <header className="conversation-topbar">
        <button className="conversation-sidebar-toggle" type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="打开对话列表"><PanelLeftOpen size={18} /></button>
        <div><span>当前任务</span><strong>{activeConversation.title}</strong></div>
        <button className="context-toggle" type="button" onClick={() => setContextOpen((value) => !value)} aria-controls="agent-context" aria-expanded={contextOpen} aria-label={contextOpen ? '收起本次上下文' : '展开本次上下文'}>
          {contextOpen ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}
          <span>{contextOpen ? '收起上下文' : '本次上下文'}</span>
        </button>
      </header>
      <div className="message-scroll" ref={scrollRef}>
        <div className="conversation-stream">
          {state.messages.length === 0 && !pendingPrompt ? <div className="conversation-empty"><Bot size={23} /><h2>从一个具体任务开始</h2><p>Stable 只加载手动引用或检索命中的本地资源，并把真实工具动作记录在回答前。</p></div> : state.messages.map((message) => <MessageTurn message={message} onCopy={message.role === 'user' ? () => void copyUserMessage(message) : undefined} onAutomationDecision={message.automationProposal?.status === 'pending' ? (accepted) => void action(accepted ? '正在创建定时任务' : '正在忽略定时任务', async () => { const result = await window.stable.automations.decideProposal(state.activeConversationId, message.id, accepted); updateAgent(result.agent); updateAutomations(result.automations) }) : undefined} onPreviewAttachment={previewMessageAttachment} onPreviewLink={openConversationPreview} key={message.id} />)}
          {pendingPrompt && !state.messages.some((message) => message.role === 'user' && message.content === pendingPrompt.content) && <UserTurn content={pendingPrompt.content} attachments={pendingPrompt.attachments} pending />}
          {liveTrace && liveTrace.items.some((item) => item.kind !== 'approval' || item.status !== 'running') && <RunTrace items={liveTrace.items.filter((item) => item.kind !== 'approval' || item.status !== 'running')} status={liveTrace.status} active={running} startedAt={liveTrace.startedAt} endedAt={liveTrace.endedAt} />}
          {liveTrace?.items.filter((item) => item.kind === 'approval' && item.status === 'running').map((item) => <ApprovalCard key={item.id} item={item} onDecision={async (allowed) => {
            if (!item.requestId) return
            await window.stable.agent.answerApproval(activeConversation.id, item.requestId, allowed)
            setTraceMap((all) => ({ ...all, [activeConversation.id]: all[activeConversation.id] ? { ...all[activeConversation.id]!, items: all[activeConversation.id]!.items.map((entry) => entry.id === item.id ? { ...entry, title: allowed ? '你已批准本次操作' : '你未批准本次操作', detail: allowed ? '继续执行当前任务' : 'Agent 将改用其他方法', status: allowed ? 'completed' : 'failed' } : entry) } : undefined }))
          }} />)}
        </div>
      </div>
      <div className="composer">
        <DropTarget className="composer-drop-target" label="作为本次任务附件" onPaths={addAttachments}>
          <div className="composer-box">
            {(selectedReferences.length > 0 || attachments.length > 0) && <div className="composer-selections" aria-label="本次引用的资源与附件">
              {selectedReferences.map((item) => <div className="selection-chip" data-kind={item.kind} key={`${item.kind}:${item.id}`} title={item.name}><ReferenceIcon kind={item.kind} /><strong>{item.name}</strong><button type="button" onClick={() => toggleReference(item)} aria-label={`移除引用 ${item.name}`}><X size={13} /></button></div>)}
              {attachments.map((item) => <div className="selection-chip" data-kind={item.type === 'skill' ? 'skill' : 'attachment'} key={item.path} title={`${item.name} · ${formatBytes(item.size)}`}>{item.type === 'skill' ? <Braces size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}<strong>{item.name}</strong><button type="button" onClick={() => setAttachments((current) => current.filter((entry) => entry.path !== item.path))} aria-label={`移除附件 ${item.name}`}><X size={13} /></button></div>)}
            </div>}
            <label className="sr-only" htmlFor="agent-prompt">给 Stable 一个任务</label>
            <textarea ref={promptRef} id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undoCopiedDraft()) { event.preventDefault(); return }
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
            }} placeholder="给 Stable 一个任务，或拖入本次需要分析的文件" disabled={running} />
            <div className="composer-actions">
              <div className="composer-tools">
                <input ref={attachmentInputRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.yaml,.yml,.html,.log,.xml,.pdf,.docx,.xlsx,.xls" onChange={(event) => { const files = Array.from(event.target.files || []); addAttachments(files.map((file) => window.stable.files.path(file)).filter(Boolean)); event.target.value = '' }} />
                <button className="composer-tool" type="button" onClick={() => attachmentInputRef.current?.click()} disabled={running} aria-label="添加本次任务附件"><Paperclip size={18} aria-hidden="true" /></button>
                <details className="composer-menu skill-menu" ref={skillMenuRef}>
                  <summary className="composer-tool" aria-label="选择 Skill"><Braces size={18} aria-hidden="true" /></summary>
                  <div className="composer-popover">
                    <div className="composer-popover-head"><strong>选择 Skills</strong><span>可多选</span></div>
                    {enabledSkills.length ? enabledSkills.map((item) => { const active = selectedReferences.some((entry) => entry.kind === 'skill' && entry.id === item.id); return <button type="button" className="composer-option" data-active={active || undefined} aria-pressed={active} key={item.id} onClick={() => toggleReference({ id: item.id, kind: 'skill', name: item.name, size: new Blob([item.content || '']).size, type: 'skill' })}><span><strong>{item.name}</strong><small>{item.description || '已安装全局 Skill'}</small></span></button> }) : <p className="composer-menu-empty">还没有已启用的 Skill。</p>}
                    <button className="composer-install-skill" type="button" onClick={addSkillFolder}><FolderInput size={15} />安装新的 Skill 文件夹</button>
                  </div>
                </details>
                <details className="composer-menu team-share-menu" ref={teamMenuRef}>
                  <summary className="composer-tool" aria-label="发送当前对话给 Team"><AtSign size={18} aria-hidden="true" /></summary>
                  <div className="composer-popover team-share-popover">
                    <div className="composer-popover-head"><strong>发送当前对话</strong><span>仅发送此刻快照</span></div>
                    {!state.team.profile && <p className="composer-menu-empty">请先在 Team 页创建或加入一个 Team。</p>}
                    {state.team.profile && !remoteTeamDevices.length && <p className="composer-menu-empty">Team 中还没有其他设备。</p>}
                    {remoteTeamDevices.map((device) => {
                      const available = state.team.connection === 'online' && device.status === 'online'
                      return <button type="button" className="team-device-option" disabled={!available} key={device.id} onClick={() => shareConversation(device.id)}>
                        <span className="team-device-option-icon"><Laptop2 size={16} /></span><span><strong>{device.name}</strong><small>{available ? '在线 · 点击发送问答快照' : '离线 · 暂不可发送'}</small></span><i data-online={available || undefined} />
                      </button>
                    })}
                  </div>
                </details>
                <details className="composer-menu data-menu" ref={dataMenuRef}>
                  <summary><Database size={17} /><span>{selectedReferences.filter((item) => item.kind !== 'skill').length ? `${selectedReferences.filter((item) => item.kind !== 'skill').length} 个资源` : '引用资源'}</span><ChevronDown size={14} /></summary>
                  <div className="composer-popover">
                    <div className="composer-popover-head"><strong>引用本地资源</strong><span>可多选</span></div>
                    <ResourceGroup title="数据库" items={enabledData.map((item) => ({ id: item.id, kind: 'data' as const, name: item.name, size: item.size, type: item.type }))} selected={selectedReferences} toggle={toggleReference} />
                    <ResourceGroup title="脚本" items={scripts.map((item) => ({ id: item.id, kind: 'script' as const, name: item.name, size: new Blob([item.content || '']).size, type: item.extension || 'script' }))} selected={selectedReferences} toggle={toggleReference} />
                    <ResourceGroup title="知识库" items={enabledKnowledge.map((item) => ({ id: item.id, kind: 'knowledge' as const, name: item.name, size: item.size, type: 'markdown' }))} selected={selectedReferences} toggle={toggleReference} />
                    {!enabledData.length && !scripts.length && !enabledKnowledge.length && <p className="composer-menu-empty">还没有可引用的本地资源。</p>}
                  </div>
                </details>
              </div>
              <details className="composer-menu permission-menu" ref={permissionMenuRef}>
                <summary><Shield size={17} /><span>{activePermission.label}</span><ChevronDown size={14} /></summary>
                <div className="composer-popover permission-popover">
                  <div className="composer-popover-head"><strong>批准 Agent 操作</strong><span>当前对话独立保存</span></div>
                  {PERMISSION_OPTIONS.map((item) => <button type="button" className="capability-option permission-option" data-active={item.id === activeConversation.permissionMode || undefined} key={item.id} onClick={() => configurePermission(item.id)}>
                    <span>{item.id === activeConversation.permissionMode ? <Check size={15} /> : <span className="capability-placeholder" />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  </button>)}
                </div>
              </details>
              <details className="composer-menu capability-menu" ref={capabilityMenuRef}>
                <summary><Sparkles size={17} /><span>{activeCapability.label}</span><ChevronDown size={14} /></summary>
                <div className="composer-popover capability-popover">
                  <div className="composer-popover-head"><strong>模型能力</strong><span>当前对话独立保存</span></div>
                  {CAPABILITY_OPTIONS.map((item) => <button type="button" className="capability-option" data-active={item.id === activeConversation.capability || undefined} key={item.id} onClick={() => configure(item.id, [])}>
                    <span>{item.id === activeConversation.capability ? <Check size={15} /> : <span className="capability-placeholder" />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  </button>)}
                </div>
              </details>
              {running
                ? <button className="composer-stop" type="button" onClick={() => window.stable.agent.cancel(activeConversation.id)} aria-label="停止执行"><CircleStop size={20} /></button>
                : <button className="composer-send" type="button" onClick={() => void send()} disabled={!prompt.trim() && !attachments.length && !selectedReferences.length} aria-label="发送任务"><ArrowUp size={20} /></button>}
            </div>
          </div>
        </DropTarget>
      </div>
    </div>
    {previewTarget && <aside className="conversation-preview" aria-label="对话文件预览">
      <div className="preview-resizer" role="separator" aria-label="调整预览面板宽度" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(320, (conversationWorkspaceRef.current?.clientWidth || 680) - 360)} aria-valuenow={previewWidth || 320} tabIndex={0} onPointerDown={startPreviewResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); resizePreviewBy(32) } else if (event.key === 'ArrowRight') { event.preventDefault(); resizePreviewBy(-32) } }} />
      <header className="conversation-preview-head">
        <div className="preview-navigation">
          <button type="button" disabled={!previewState.canGoBack} onClick={() => void window.stable.preview.navigate('back')} aria-label="预览后退"><ArrowLeft size={16} /></button>
          <button type="button" disabled={!previewState.canGoForward} onClick={() => void window.stable.preview.navigate('forward')} aria-label="预览前进"><ArrowRight size={16} /></button>
          <button type="button" onClick={() => void window.stable.preview.navigate('reload')} aria-label="重新加载预览"><RotateCw className={previewState.loading ? 'spin' : undefined} size={16} /></button>
        </div>
        <div className="preview-location"><strong>{previewState.title || previewTarget.title}</strong><span>{previewTarget.kind === 'web' ? (previewState.url || previewTarget.value) : previewTarget.value}</span></div>
        <button className="preview-close" type="button" onClick={closeConversationPreview} aria-label="关闭预览面板"><X size={17} /></button>
      </header>
      <div className="preview-viewport" ref={previewViewportRef}>
        {previewState.loading && <div className="preview-loading"><LoaderCircle className="spin" size={20} /><span>正在加载预览</span></div>}
        {previewState.error && <div className="preview-error" role="alert"><CircleAlert size={20} /><strong>无法打开预览</strong><span>{previewState.error}</span></div>}
      </div>
    </aside>}
    </div>
    {contextOpen && <aside className="context-panel" id="agent-context">
      <div className="context-panel-head"><div className="context-heading"><span>CONTEXT</span><h2>本次上下文</h2></div><button className="icon-button" type="button" onClick={() => setContextOpen(false)} aria-label="收起本次上下文"><X size={17} /></button></div>
      <ContextLine icon={Database} label="已启用数据" value={state.data.filter((item) => item.enabled).length} />
      <ContextLine icon={Database} label="当前引用资源" value={selectedReferences.length} />
      <ContextLine icon={BookOpenText} label="已启用知识" value={state.knowledge.filter((item) => item.enabled).length} />
      <ContextLine icon={Braces} label="已启用 Skills" value={state.skills.filter((item) => item.enabled).length} />
      <ContextLine icon={Box} label="模型" value={state.model.model} />
      <div className="context-note"><strong>{activeCapability.label}</strong><br />{activeCapability.detail}<br /><br />Stable 会优先加载当前对话显式引用的数据；未选择时再按问题检索已启用资料。</div>
      <div className="trace-disclosure"><Activity size={16} /><span>执行区展示过程摘要与真实工具事件，不展示模型隐藏思维链。</span></div>
      {state.messages.length > 0 && <button className="text-button" onClick={() => void action('正在清空对话', async () => updateAgent(await window.stable.agent.clear(activeConversation.id)))}>清空当前对话</button>}
    </aside>}
  </section>
}

function ApprovalCard({ item, onDecision }: { item: AgentTraceItem; onDecision: (allowed: boolean) => void | Promise<void> }) {
  return <section className="approval-card" role="alertdialog" aria-label="权限审批">
    <div className="approval-card-icon">{item.danger ? <CircleAlert size={20} /> : <ShieldCheck size={20} />}</div>
    <div className="approval-card-copy"><span>{item.danger ? '高风险操作需要你确认' : 'Agent 请求扩大权限'}</span><h3>{item.toolName || item.title}</h3><p>{item.reason || item.detail || '本次操作需要超出工作区的安全范围。'}</p><small>权限仅对本次操作生效。</small></div>
    <div className="approval-card-actions"><button className="button" type="button" onClick={() => void onDecision(false)}>不允许</button><button className="button primary" type="button" onClick={() => void onDecision(true)}>允许一次</button></div>
  </section>
}

function ReferenceIcon({ kind }: { kind: AgentReferenceKind }) {
  if (kind === 'skill') return <Braces size={14} aria-hidden="true" />
  if (kind === 'script') return <Wrench size={14} aria-hidden="true" />
  if (kind === 'knowledge') return <BookOpenText size={14} aria-hidden="true" />
  return <Database size={14} aria-hidden="true" />
}

function ResourceGroup({ title, items, selected, toggle }: { title: string; items: AgentReference[]; selected: AgentReference[]; toggle: (item: AgentReference) => void }) {
  if (!items.length) return null
  return <section className="resource-picker-group">
    <h3>{title}</h3>
    {items.map((item) => { const active = selected.some((entry) => entry.kind === item.kind && entry.id === item.id); return <button type="button" className="composer-option" data-active={active || undefined} aria-pressed={active} key={`${item.kind}:${item.id}`} onClick={() => toggle(item)}>
      <ReferenceIcon kind={item.kind} /><span><strong>{item.name}</strong><small>{item.type.toUpperCase()} · {formatBytes(item.size)}</small></span>
    </button> })}
  </section>
}

function MessageTurn({ message, onCopy, onAutomationDecision, onPreviewAttachment, onPreviewLink }: { message: MessageItem; onCopy?: () => void; onAutomationDecision?: (accepted: boolean) => void; onPreviewAttachment?: (item: NonNullable<MessageItem['attachments']>[number]) => void; onPreviewLink?: (target: Omit<ConversationPreviewTarget, 'requestId'>) => void }) {
  if (message.role === 'user') return <UserTurn content={message.content} attachments={message.attachments} onCopy={onCopy} onPreviewAttachment={onPreviewAttachment} />
  return <article className="assistant-turn">
    {message.trace?.length ? <RunTrace items={message.trace} status="completed" /> : null}
    <div className="assistant-answer">
      <div className="assistant-mark" aria-hidden="true">S</div>
      <div className="answer-content"><div className="answer-label">Stable</div><MarkdownContent content={message.content} onPreview={onPreviewLink} /></div>
    </div>
    {message.automationProposal && <section className="automation-proposal" data-status={message.automationProposal.status} aria-label="定时任务确认">
      <span className="automation-card-icon"><Clock3 size={18} aria-hidden="true" /></span>
      <div><small>定时任务</small><h3>{message.automationProposal.title}</h3><p>{message.automationProposal.prompt}</p><strong>{formatAutomationSchedule(message.automationProposal.schedule)}</strong></div>
      {message.automationProposal.status === 'pending'
        ? <div className="automation-proposal-actions"><button className="button" type="button" onClick={() => onAutomationDecision?.(false)}>忽略</button><button className="button primary" type="button" onClick={() => onAutomationDecision?.(true)}>确认创建</button></div>
        : <span className="automation-decision"><Check size={15} />{message.automationProposal.status === 'accepted' ? '已创建' : '已忽略'}</span>}
    </section>}
  </article>
}

function formatAutomationSchedule(schedule: AutomationSchedule) {
  if (schedule.type === 'once') return `${schedule.date} ${schedule.time}`
  if (schedule.type === 'daily') return `每天 ${schedule.time}`
  if (schedule.type === 'weekly') return `每周 ${schedule.weekdays.map((day) => '日一二三四五六'[day]).join('、')} ${schedule.time}`
  return `每月 ${schedule.day} 日 ${schedule.time}`
}

function UserTurn({ content, attachments = [], pending = false, onCopy, onPreviewAttachment }: { content: string; attachments?: MessageItem['attachments']; pending?: boolean; onCopy?: () => void; onPreviewAttachment?: (item: NonNullable<MessageItem['attachments']>[number]) => void }) {
  return <article className="user-turn" data-pending={pending || undefined}>
    <div className="user-bubble"><div className="turn-label">你</div><p>{content}</p>
      {attachments.length > 0 && <div className="message-attachments" aria-label="随消息发送的附件">
        {attachments.map((item, index) => {
          const previewable = Boolean(onPreviewAttachment && (/\.(?:md|markdown)$/i.test(item.name) || /^(?:md|markdown)$/i.test(item.type)))
          const chipContent = <>{item.kind === 'attachment' ? <FileText size={14} aria-hidden="true" /> : <ReferenceIcon kind={item.kind} />}<strong>{item.name}</strong></>
          return previewable
            ? <button className="selection-chip message-file-chip" type="button" data-kind={item.kind} key={`${item.kind}-${item.name}-${index}`} title={`${item.name} · ${formatBytes(item.size)}`} onClick={() => onPreviewAttachment?.(item)}>{chipContent}</button>
            : <div className="selection-chip" data-kind={item.kind} key={`${item.kind}-${item.name}-${index}`} title={`${item.name} · ${formatBytes(item.size)}`}>{chipContent}</div>
        })}
      </div>}
      {onCopy && <div className="user-turn-actions"><button type="button" onClick={onCopy} aria-label="复制这条消息到主输入框"><Copy size={15} aria-hidden="true" /></button></div>}
    </div>
  </article>
}

const TRACE_MODULES: Record<AgentTraceKind, { label: string; icon: typeof Database }> = {
  context: { label: '准备上下文', icon: Database },
  reasoning: { label: 'AI 处理', icon: Activity },
  tool: { label: '工具调用', icon: Wrench },
  approval: { label: '权限审批', icon: ShieldCheck },
  status: { label: 'Stable 运行', icon: Clock3 },
}

function traceModuleStatus(items: AgentTraceItem[]): AgentTraceStatus {
  if (items.some((item) => item.status === 'running')) return 'running'
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'cancelled')) return 'cancelled'
  return 'completed'
}

function TraceModuleCard({ kind, items }: { kind: AgentTraceKind; items: AgentTraceItem[] }) {
  const [index, setIndex] = useState(Math.max(0, items.length - 1))
  const [paused, setPaused] = useState(false)
  const module = TRACE_MODULES[kind]
  const Icon = module.icon
  const moduleStatus = traceModuleStatus(items)
  const safeIndex = items.length ? index % items.length : 0
  const item = items[safeIndex]

  useEffect(() => setIndex(Math.max(0, items.length - 1)), [items.length])
  useEffect(() => {
    if (paused || items.length < 2) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 2000)
    return () => window.clearInterval(timer)
  }, [items.length, paused])

  if (!item) return null
  return <article
    className="trace-module-card"
    data-status={moduleStatus}
    data-paused={paused || undefined}
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={() => setPaused(false)}
    tabIndex={0}
  >
    <header className="trace-card-head">
      <span className="trace-card-icon"><Icon size={15} aria-hidden="true" /></span>
      <strong>{module.label}</strong>
      <small>{safeIndex + 1}/{items.length}</small>
      <span className="trace-card-state" aria-label={moduleStatus === 'running' ? '运行中' : moduleStatus === 'completed' ? '已完成' : '未完成'}>
        {moduleStatus === 'running' ? <LoaderCircle className="spin" size={14} /> : moduleStatus === 'completed' ? <Check size={14} /> : <CircleAlert size={14} />}
      </span>
    </header>
    <div className="trace-card-stage">
      <div className="trace-card-frame" key={`${item.id}-${item.status}-${safeIndex}`}>
        <strong>{item.title}</strong>
        {item.detail && <small>{item.detail}</small>}
      </div>
    </div>
  </article>
}

interface SubagentTraceView {
  id: string
  name: string
  status: AgentTraceStatus
  currentTask: string
  latestAction: string
}

function buildSubagentTraceViews(items: AgentTraceItem[]): SubagentTraceView[] {
  const childSessions = new Set(items
    .filter((item) => item.entity === 'agent' && item.sessionId && item.parentSessionId)
    .map((item) => item.sessionId!))

  return Array.from(childSessions).map((sessionId) => {
    const sessionItems = items.filter((item) => item.sessionId === sessionId).sort((a, b) => a.time - b.time)
    const descriptor = sessionItems.find((item) => item.eventType === 'agent/descriptor')
    const start = [...sessionItems].reverse().find((item) => item.eventType === 'agent/start')
    const lifecycle = [...sessionItems].reverse().find((item) => item.eventType === 'agent/end' || item.eventType === 'agent/start')
    const latestActionItem = [...sessionItems].reverse().find((item) => item.entity === 'tool' || item.kind === 'reasoning') || sessionItems[sessionItems.length - 1]
    const status = lifecycle?.status || traceModuleStatus(sessionItems)
    return {
      id: sessionId,
      name: descriptor?.title || start?.title || '子 Agent',
      status,
      currentTask: status === 'running'
        ? (start?.detail || descriptor?.detail || '正在执行委派任务')
        : (lifecycle?.detail || (status === 'completed' ? '已完成委派任务' : '委派任务未完成')),
      latestAction: latestActionItem
        ? `${latestActionItem.title}${latestActionItem.detail ? ` · ${latestActionItem.detail}` : ''}`
        : '尚未记录动作',
    }
  })
}

function SubagentTraceCard({ agent }: { agent: SubagentTraceView }) {
  const statusLabel = agent.status === 'running' ? '运行中' : agent.status === 'completed' ? '已完成' : agent.status === 'cancelled' ? '已取消' : '执行失败'
  return <article className="trace-module-card trace-subagent-card" data-status={agent.status}>
    <header className="trace-card-head">
      <span className="trace-card-icon"><Bot size={15} aria-hidden="true" /></span>
      <strong>{agent.name}</strong>
      <small>{statusLabel}</small>
      <span className="trace-card-state" aria-label={statusLabel}>
        {agent.status === 'running' ? <LoaderCircle className="spin" size={14} /> : agent.status === 'completed' ? <Check size={14} /> : <CircleAlert size={14} />}
      </span>
    </header>
    <div className="trace-subagent-body trace-card-frame" key={`${agent.id}-${agent.status}-${agent.latestAction}`}>
      <div><small>当前任务</small><strong>{agent.currentTask}</strong></div>
      <div><small>最新动作</small><span>{agent.latestAction}</span></div>
    </div>
  </article>
}

function RunTrace({ items, status, active = false, startedAt, endedAt }: { items: AgentTraceItem[]; status: AgentTraceStatus; active?: boolean; startedAt?: number; endedAt?: number }) {
  const [expanded, setExpanded] = useState(active)
  const firstEventAt = useMemo(() => Math.min(...items.map((item) => item.time)), [items])
  const lastEventAt = useMemo(() => Math.max(...items.map((item) => item.time)), [items])
  const timerStartedAt = startedAt ?? firstEventAt
  const timerEndedAt = endedAt ?? (status === 'running' ? undefined : lastEventAt)
  const [now, setNow] = useState(() => Date.now())
  const subagents = useMemo(() => buildSubagentTraceViews(items), [items])
  const modules = useMemo(() => {
    const subagentSessionIds = new Set(subagents.map((agent) => agent.id))
    const grouped = new Map<AgentTraceKind, AgentTraceItem[]>()
    items.filter((item) => !item.sessionId || !subagentSessionIds.has(item.sessionId))
      .forEach((item) => grouped.set(item.kind, [...(grouped.get(item.kind) || []), item]))
    return Array.from(grouped.entries())
  }, [items, subagents])
  useEffect(() => {
    if (active) { setExpanded(true); return }
    if (status === 'completed') setExpanded(false)
  }, [active, status])
  useEffect(() => {
    setNow(Date.now())
    if (status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status, timerStartedAt])
  const elapsed = formatElapsedTime(Math.max(0, (timerEndedAt ?? now) - timerStartedAt))
  return <section className="run-trace" data-status={status}>
    <div className="trace-elapsed" role="timer" aria-label={`执行时长 ${elapsed}`}><span>已执行</span><strong>{elapsed}</strong></div>
    <button className="trace-summary" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={`执行过程，${expanded ? '已展开' : '已折叠'}`}>
      <span className="trace-summary-icon">{status === 'running' ? <LoaderCircle className="spin" size={16} /> : status === 'completed' ? <Check size={16} /> : <CircleAlert size={16} />}</span>
      <strong>执行过程</strong>
      <ChevronRight className="trace-chevron" data-open={expanded} size={17} />
    </button>
    {expanded && <div className="trace-card-grid">
      {modules.map(([kind, moduleItems]) => <TraceModuleCard kind={kind} items={moduleItems} key={kind} />)}
      {subagents.map((agent) => <SubagentTraceCard agent={agent} key={agent.id} />)}
    </div>}
  </section>
}

function markdownTableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function isMarkdownTableStart(lines: string[], index: number) {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) return false
  const separators = markdownTableCells(lines[index + 1])
  return separators.length > 1 && separators.every((cell) => /^:?-{3,}:?$/.test(cell))
}

type PreviewOpener = (target: Omit<ConversationPreviewTarget, 'requestId'>) => void

function markdownTableSource(headers: string[], separators: string[], rows: string[][]) {
  const cell = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const line = (values: string[]) => `| ${values.map(cell).join(' | ')} |`
  return [line(headers), line(separators), ...rows.map((row) => line(headers.map((_, index) => row[index] || '')))].join('\n')
}

function MarkdownTable({ headers, separators, alignments, rows, tableIndex, onPreview }: { headers: string[]; separators: string[]; alignments: Array<'left' | 'center' | 'right'>; rows: string[][]; tableIndex: number; onPreview?: PreviewOpener }) {
  const [copied, setCopied] = useState(false)
  async function copyTable() {
    await window.stable.clipboard.writeText(markdownTableSource(headers, separators, rows))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }
  return <div className="markdown-table-shell">
    <button className="markdown-table-copy" type="button" onClick={() => void copyTable()} aria-label={copied ? '表格已复制' : '复制表格'} title={copied ? '已复制' : '复制表格'}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
    <div className="markdown-table-wrap"><table><thead><tr>{headers.map((cell, cellIndex) => <th style={{ textAlign: alignments[cellIndex] || 'left' }} key={cellIndex}>{renderInline(cell, `table-head-${tableIndex}-${cellIndex}`, onPreview)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td style={{ textAlign: alignments[cellIndex] || 'left' }} key={cellIndex}>{renderInline(row[cellIndex] || '', `table-${tableIndex}-${rowIndex}-${cellIndex}`, onPreview)}</td>)}</tr>)}</tbody></table></div>
  </div>
}

function MarkdownContent({ content, onPreview }: { content: string; onPreview?: PreviewOpener }) {
  const lines = content.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) { code.push(lines[index]); index += 1 }
      index += 1
      blocks.push(<div className="code-block" key={`code-${index}`}><div className="code-label">{language || 'code'}</div><pre><code>{code.join('\n')}</code></pre></div>)
      continue
    }
    if (isMarkdownTableStart(lines, index)) {
      const headers = markdownTableCells(line)
      const separators = markdownTableCells(lines[index + 1])
      const alignments = separators.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') as Array<'left' | 'center' | 'right'>
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(markdownTableCells(lines[index])); index += 1 }
      blocks.push(<MarkdownTable headers={headers} separators={separators} alignments={alignments} rows={rows} tableIndex={index} onPreview={onPreview} key={`table-${index}`} />)
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const children = renderInline(heading[2], `heading-${index}`, onPreview)
      blocks.push(level === 1 ? <h2 key={`h-${index}`}>{children}</h2> : level === 2 ? <h3 key={`h-${index}`}>{children}</h3> : <h4 key={`h-${index}`}>{children}</h4>)
      index += 1; continue
    }
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/)
    if (bullet) {
      const ordered = /\d+\./.test(bullet[1])
      const entries: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*([-*]|\d+\.)\s+(.+)$/)
        if (!match || /\d+\./.test(match[1]) !== ordered) break
        entries.push(match[2]); index += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={`list-${index}`}>{entries.map((entry, itemIndex) => <li key={itemIndex}>{renderInline(entry, `list-${index}-${itemIndex}`, onPreview)}</li>)}</List>)
      continue
    }
    if (line.trimStart().startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trimStart().startsWith('> ')) { quote.push(lines[index].trimStart().slice(2)); index += 1 }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '), `quote-${index}`, onPreview)}</blockquote>)
      continue
    }
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isMarkdownTableStart(lines, index) && !/^(#{1,3})\s+|^\s*([-*]|\d+\.)\s+|^\s*>\s+|^\s*```/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1 }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '), `p-${index}`, onPreview)}</p>)
  }
  return <div className="markdown-body">{blocks}</div>
}

function renderInline(text: string, keyPrefix: string, onPreview?: PreviewOpener): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/[^)\s]+|[A-Za-z]:\\[^)]+\.(?:md|markdown))\)|https?:\/\/[^\s<]+|[A-Za-z]:\\[^\n<>|?*"]+?\.(?:md|markdown)\b)/g
  return text.split(token).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/)
    if (link && /^https?:\/\//i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <a href={link[2]} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{link[1]}</a>
    if (link && /^[A-Za-z]:\\.*\.(?:md|markdown)$/i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'markdown', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <Fragment key={`${keyPrefix}-${index}`}>{link[1]}</Fragment>
    if (/^https?:\/\//i.test(part)) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: part, title: new URL(part).hostname })} key={`${keyPrefix}-${index}`}>{part}</button>
      : <a href={part} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{part}</a>
    if (/^[A-Za-z]:\\.*\.(?:md|markdown)$/i.test(part) && onPreview) return <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'markdown', value: part, title: part.split(/[/\\]/).pop() || 'Markdown' })} key={`${keyPrefix}-${index}`}>{part}</button>
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
  })
}

function ContextLine({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string | number }) {
  return <div className="context-line"><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>
}

type DataSection = 'database' | DataLibraryCategory

const DATA_SECTIONS: Array<{ id: DataSection; label: string; detail: string; icon: typeof Database }> = [
  { id: 'database', label: '数据库', detail: '本地资料', icon: Database },
  { id: 'collection', label: '数据采集', detail: '执行脚本', icon: Activity },
  { id: 'cleaning', label: '数据清洗', detail: '执行脚本', icon: Sparkles },
  { id: 'processing', label: '数据加工', detail: 'Markdown', icon: Library },
]

const RUN_STATUS_LABEL: Record<LibraryRunStatus, string> = {
  idle: '未运行', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已停止',
}

function DataPage({ dataItems, libraryItems, updateData, updateLibrary, action }: {
  dataItems: DataItem[]
  libraryItems: DataLibraryItem[]
  updateData: (items: DataItem[]) => void
  updateLibrary: (items: DataLibraryItem[]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
}) {
  const [section, setSection] = useState<DataSection>('database')
  const [runningId, setRunningId] = useState('')
  const [logId, setLogId] = useState('')
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [markdownId, setMarkdownId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [scriptInput, setScriptInput] = useState('')
  const [inputState, setInputState] = useState<'idle' | 'sending' | 'error' | 'success'>('idle')
  const [inputMessage, setInputMessage] = useState('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
  const libraryRef = useRef(libraryItems)
  const logsRef = useRef(logs)
  libraryRef.current = libraryItems
  logsRef.current = logs

  useEffect(() => window.stable.library.onEvent((event) => {
    const decoratedChunk = event.stream === 'stderr'
      ? `[错误] ${event.chunk}`
      : event.stream === 'status'
        ? `${event.status === 'running' ? '' : '\n'}${event.chunk}${event.chunk.endsWith('\n') ? '' : '\n'}`
        : event.chunk
    const nextLog = `${logsRef.current[event.itemId] || ''}${decoratedChunk}`.slice(-120_000)
    logsRef.current = { ...logsRef.current, [event.itemId]: nextLog }
    setLogs(logsRef.current)
    if (libraryRef.current.find((item) => item.id === event.itemId)?.kind === 'script') setLogId(event.itemId)
    if (event.status) {
      updateLibrary(libraryRef.current.map((item) => item.id === event.itemId ? {
        ...item,
        lastStatus: event.status!,
        lastOutput: event.status === 'running' ? '' : nextLog,
        lastRunAt: new Date(event.time).toISOString(),
      } : item))
      if (event.status === 'running') {
        setRunningId(event.itemId)
        setInputState('idle')
        setInputMessage('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
      } else {
        setRunningId('')
        setInputState(event.status === 'completed' ? 'success' : 'idle')
        setInputMessage(event.status === 'completed' ? '脚本已完成，不再接收输入。' : '脚本已停止，不再接收输入。')
      }
    }
  }), [])

  const selectedMarkdown = libraryItems.find((item) => item.id === markdownId && item.kind === 'markdown')
  useEffect(() => {
    if (!selectedMarkdown) return
    setDraft(selectedMarkdown.content)
    setEditing(false)
  }, [selectedMarkdown?.id])

  const categoryItems = section === 'database' ? [] : libraryItems.filter((item) => item.category === section)
  const logItem = libraryItems.find((item) => item.id === logId)
  const logContent = logId ? (logs[logId] || logItem?.lastOutput || '') : ''
  const sectionConfig = DATA_SECTIONS.find((item) => item.id === section) || DATA_SECTIONS[0]

  function importAssets(category: DataLibraryCategory) {
    void action(`正在导入${sectionConfig.label}`, async () => updateLibrary((await window.stable.library.importFiles(category)).items))
  }

  function removeAsset(item: DataLibraryItem) {
    void action(`正在删除 ${item.name}`, async () => {
      updateLibrary(await window.stable.library.remove(item.id))
      if (markdownId === item.id) setMarkdownId('')
      if (logId === item.id) setLogId('')
    })
  }

  async function runScript(item: DataLibraryItem) {
    setRunningId(item.id)
    setLogId(item.id)
    setLogs((current) => ({ ...current, [item.id]: '' }))
    logsRef.current = { ...logsRef.current, [item.id]: '' }
    setScriptInput('')
    setInputState('idle')
    setInputMessage('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
    try {
      await action(`正在运行 ${item.name}`, async () => {
        const result = await window.stable.library.run(item.id)
        updateLibrary(result.items)
      })
    } finally {
      setRunningId('')
    }
  }

  async function sendScriptInput(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!logId || runningId !== logId || inputState === 'sending') return
    setInputState('sending')
    setInputMessage('正在发送输入…')
    try {
      await window.stable.library.sendInput(logId, scriptInput)
      setScriptInput('')
      setInputState('success')
      setInputMessage('已发送，等待脚本继续输出。')
    } catch (reason) {
      setInputState('error')
      setInputMessage(errorMessage(reason))
    }
  }

  function importDropped(paths: string[]) {
    if (!paths.length) return
    void action(`正在导入${sectionConfig.label}`, async () => {
      if (section === 'database') updateData((await window.stable.data.importPaths(paths)).items)
      else updateLibrary((await window.stable.library.importPaths(section, paths)).items)
    })
  }

  return <DropTarget className="page-drop-target" label={`导入到${sectionConfig.label}`} onPaths={importDropped}><section className="data-hub reveal">
    <aside className="data-subnav" aria-label="数据分类">
      <div className="data-subnav-heading"><span>DATA HUB</span><strong>数据中心</strong></div>
      <nav>
        {DATA_SECTIONS.map(({ id, label, detail, icon: Icon }) => {
          const count = id === 'database' ? dataItems.length : libraryItems.filter((item) => item.category === id).length
          return <button key={id} data-active={section === id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
            <Icon size={18} strokeWidth={1.7} />
            <span><strong>{label}</strong><small>{detail}</small></span>
            <em>{count}</em>
          </button>
        })}
      </nav>
      <p>导入内容会复制到 Stable 私有目录，原始文件保持不变。</p>
    </aside>

    <div className="data-workspace">
      {section === 'database' ? <>
        <PageLead title="数据库" copy="导入文档和表格。Stable 在本机提取可检索文本，可按需启用给 Agent 调用。" action={<button className="button primary" onClick={() => void action('正在导入数据', async () => updateData((await window.stable.data.importFiles()).items))}><FilePlus2 size={17} />导入文件</button>} />
        {dataItems.length === 0 ? <Empty icon={Database} title="还没有本地数据" detail="支持 TXT、Markdown、CSV、JSON、PDF、DOCX 和 Excel。" /> : <div className="resource-list">
          {dataItems.map((item) => <ResourceRow key={item.id} title={item.name} detail={`${item.type.toUpperCase()} · ${formatBytes(item.size)}`} enabled={item.enabled}
            onToggle={(enabled) => void action('正在更新数据状态', async () => updateData(await window.stable.data.setEnabled(item.id, enabled)))}
            onRemove={() => void action('正在移出数据', async () => updateData(await window.stable.data.remove(item.id)))} />)}
        </div>}
      </> : <>
        <PageLead
          title={sectionConfig.label}
          copy={section === 'processing' ? '集中保存可复用的数据加工说明、口径和模板，可直接预览与编辑。' : section === 'collection' ? '集中管理数据采集脚本。支持单文件、完整文件夹和 ZIP；运行时可在日志下方直接回答脚本问题。' : '集中管理数据清洗脚本。支持单文件、完整文件夹和 ZIP；切换页面后脚本仍会在后台继续运行。'}
          action={<button className="button primary" onClick={() => importAssets(section)}><FolderInput size={17} />{section === 'processing' ? '导入 Markdown' : '导入脚本或包'}</button>}
        />
        {categoryItems.length === 0 ? <Empty icon={sectionConfig.icon} title={`还没有${sectionConfig.label}资产`} detail={section === 'processing' ? '支持 MD 和 MARKDOWN 文件。' : '支持 Python、PowerShell、CMD 和 BAT 脚本。'} /> : <div className="library-grid">
          {categoryItems.map((item) => item.kind === 'script'
            ? <ScriptCard key={item.id} item={item} running={runningId === item.id} onRun={() => void runScript(item)} onLog={() => setLogId(item.id)} onRename={(name) => void action(`正在重命名 ${item.name}`, async () => updateLibrary(await window.stable.library.rename(item.id, name)))} onRemove={() => removeAsset(item)} />
            : <MarkdownCard key={item.id} item={item} selected={markdownId === item.id} onOpen={() => setMarkdownId(item.id)} onRemove={() => removeAsset(item)} />)}
        </div>}

        {logId && logItem?.kind === 'script' && logItem.category === section && <section className="asset-panel script-console" aria-live="polite">
          <div className="asset-panel-head">
            <div><span>RUN LOG</span><h3>{logItem?.name || '脚本日志'}</h3></div>
            <div className="button-row">{runningId === logId && <button className="button danger" onClick={() => window.stable.library.cancel()}><CircleStop size={16} />停止</button>}<button className="icon-button" onClick={() => setLogId('')} aria-label="关闭日志"><X size={17} /></button></div>
          </div>
          <pre>{logContent || (runningId === logId ? '等待脚本输出…' : '这次运行没有输出。')}</pre>
          {runningId === logId && <form className="script-input" data-state={inputState} onSubmit={(event) => void sendScriptInput(event)}>
            <label htmlFor={`script-input-${logId}`}>脚本输入</label>
            <div className="script-input-row">
              <input
                id={`script-input-${logId}`}
                value={scriptInput}
                onChange={(event) => { setScriptInput(event.target.value); if (inputState !== 'sending') setInputState('idle') }}
                placeholder="输入脚本要求的回答"
                autoComplete="off"
                aria-invalid={inputState === 'error' ? 'true' : undefined}
                aria-describedby={`script-input-help-${logId}`}
                disabled={inputState === 'sending'}
              />
              <button className="button primary" type="submit" data-state={inputState} disabled={inputState === 'sending'}>
                {inputState === 'sending' ? <LoaderCircle className="spin" size={16} /> : inputState === 'success' ? <Check size={16} /> : <SendHorizontal size={16} />}
                {inputState === 'sending' ? '发送中' : '发送'}
              </button>
            </div>
            <p id={`script-input-help-${logId}`} role={inputState === 'error' ? 'alert' : 'status'}>{inputMessage}</p>
          </form>}
        </section>}

        {section === 'processing' && selectedMarkdown && <section className="asset-panel markdown-panel">
          <div className="asset-panel-head">
            <div><span>MARKDOWN</span><h3>{selectedMarkdown.name}</h3></div>
            <div className="button-row">
              {editing ? <button className="button primary" onClick={() => void action('正在保存 Markdown', async () => { updateLibrary(await window.stable.library.saveMarkdown(selectedMarkdown.id, draft)); setEditing(false) })}><Save size={16} />保存</button> : <button className="button" onClick={() => setEditing(true)}><Pencil size={16} />编辑</button>}
              <button className="icon-button" onClick={() => setMarkdownId('')} aria-label="关闭 Markdown"><X size={17} /></button>
            </div>
          </div>
          {editing ? <textarea className="markdown-editor" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Markdown 内容" /> : <div className="markdown-preview"><MarkdownContent content={selectedMarkdown.content} /></div>}
        </section>}
      </>}
    </div>
  </section></DropTarget>
}

function ScriptCard({ item, running, onRun, onLog, onRename, onRemove }: { item: DataLibraryItem; running: boolean; onRun: () => void; onLog: () => void; onRename: (name: string) => void; onRemove: () => void }) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)

  useEffect(() => { if (!editingName) setNameDraft(item.name) }, [item.name, editingName])

  function commitName() {
    const name = nameDraft.trim()
    setEditingName(false)
    if (!name || name === item.name) { setNameDraft(item.name); return }
    onRename(name)
  }

  return <article className="library-card" data-status={item.lastStatus}>
    <div className="library-card-top"><span className="asset-type"><Wrench size={16} />{item.extension.toUpperCase()}</span><span className="asset-status">{running ? <LoaderCircle className="spin" size={13} /> : null}{RUN_STATUS_LABEL[running ? 'running' : item.lastStatus]}</span></div>
    <div className="library-card-copy">
      <div className="library-card-title">
        {editingName
          ? <input autoFocus maxLength={100} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
            if (event.key === 'Escape') { event.preventDefault(); setNameDraft(item.name); setEditingName(false) }
          }} aria-label="脚本显示名称" />
          : <h3 title={item.name}>{item.name}</h3>}
        {!editingName && <button className="library-card-rename" disabled={running} onClick={() => setEditingName(true)} aria-label={`重命名 ${item.name}`} title="重命名"><Pencil size={15} /></button>}
      </div>
      <p>{item.description}</p>
    </div>
    <div className="library-card-meta"><span>{item.lastRunAt ? `上次 ${formatLocalTime(item.lastRunAt)}` : '尚未执行'}</span></div>
    <div className="library-card-actions"><button className="button primary" disabled={running} onClick={onRun}><Play size={16} />{running ? '运行中' : '运行'}</button>{item.lastRunAt && <button className="button" onClick={onLog}>日志</button>}<button className="icon-button" disabled={running} onClick={onRemove} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button></div>
  </article>
}

function MarkdownCard({ item, selected, onOpen, onRemove }: { item: DataLibraryItem; selected: boolean; onOpen: () => void; onRemove: () => void }) {
  return <article className="library-card" data-selected={selected || undefined}>
    <div className="library-card-top"><span className="asset-type"><Library size={16} />MD</span><span className="asset-status">本地文档</span></div>
    <button className="library-card-open" onClick={onOpen}><span>{item.name}</span><small>{item.description}</small></button>
    <div className="library-card-meta"><span>更新于 {formatLocalTime(item.updatedAt)}</span></div>
    <div className="library-card-actions"><button className="button primary" onClick={onOpen}>预览</button><button className="icon-button" onClick={onRemove} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button></div>
  </article>
}

function formatLocalTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function KnowledgePage({ items, update, action }: {
  items: KnowledgeItem[]
  update: (items: KnowledgeItem[]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [document, setDocument] = useState<KnowledgeDocument | null>(null)
  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? items.filter((item) => `${item.name}\n${item.summary}`.toLowerCase().includes(term)) : items
  }, [items, query])

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) { setSelectedId(''); setDocument(null) }
  }, [items, selectedId])

  useEffect(() => {
    if (selectedId || !items[0]) return
    setSelectedId(items[0].id)
    void window.stable.knowledge.get(items[0].id).then(setDocument)
  }, [items, selectedId])

  function openDocument(item: KnowledgeItem) {
    setSelectedId(item.id)
    void action('正在读取知识文档', async () => setDocument(await window.stable.knowledge.get(item.id)))
  }

  function toggleDocument(item: KnowledgeItem, enabled: boolean) {
    void action('正在更新知识调用状态', async () => {
      const next = await window.stable.knowledge.setEnabled(item.id, enabled)
      update(next)
      setDocument((current) => current?.id === item.id ? { ...current, enabled } : current)
    })
  }

  function removeDocument(item: KnowledgeItem) {
    void action('正在删除知识文档', async () => {
      const next = await window.stable.knowledge.remove(item.id)
      update(next)
      if (selectedId === item.id) { setSelectedId(''); setDocument(null) }
    })
  }

  return <DropTarget className="page-drop-target" label="导入知识库 Markdown" onPaths={(paths) => { if (paths.length) void action('正在导入知识库', async () => update((await window.stable.knowledge.importPaths(paths)).items)) }}><section className="knowledge-layout reveal">
    <div className="knowledge-toolbar">
      <div><h2>知识库</h2><p>管理供 Agent 检索调用的 Markdown 文档。文件副本只保存在本机。</p></div>
      <button className="button primary" onClick={() => void action('正在导入知识库', async () => update((await window.stable.knowledge.importFiles()).items))}><FolderInput size={17} />导入 Markdown</button>
    </div>
    <div className="knowledge-workbench">
      <aside className="knowledge-index">
        <label className="knowledge-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">搜索知识库</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或摘要" />
        </label>
        <div className="knowledge-count"><span>{visibleItems.length} 篇文档</span><span>{items.filter((item) => item.enabled).length} 篇可调用</span></div>
        {visibleItems.length === 0 ? <div className="knowledge-empty"><BookOpenText size={24} /><strong>{items.length ? '没有匹配文档' : '还没有知识文档'}</strong><span>{items.length ? '换一个关键词试试。' : '导入 Markdown 文件或文件夹。'}</span></div> : <div className="knowledge-list">
          {visibleItems.map((item) => <article className="knowledge-item" data-selected={selectedId === item.id || undefined} key={item.id}>
            <button className="knowledge-open" onClick={() => openDocument(item)}>
              <FileText size={18} aria-hidden="true" />
              <span><strong>{item.name}</strong><small>{item.summary}</small></span>
            </button>
            <div className="knowledge-item-actions">
              <label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => toggleDocument(item, event.target.checked)} /><span aria-hidden="true" /><em>{item.enabled ? '可调用' : '未启用'}</em></label>
              <button className="icon-button" onClick={() => openDocument(item)} aria-label={`预览 ${item.name}`}><Eye size={16} /></button>
              <button className="icon-button" onClick={() => removeDocument(item)} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button>
            </div>
          </article>)}
        </div>}
      </aside>
      <article className="knowledge-reader">
        {document ? <>
          <header className="knowledge-reader-head">
            <div><span>MARKDOWN</span><h3>{document.name}</h3><p>{formatBytes(document.size)} · 更新于 {formatLocalTime(document.updatedAt)}</p></div>
            <span className="knowledge-call-state" data-enabled={document.enabled}>{document.enabled ? 'Agent 可调用' : '未启用调用'}</span>
          </header>
          <div className="knowledge-preview"><MarkdownContent content={document.content} /></div>
        </> : <div className="knowledge-reader-empty"><BookOpenText size={28} /><h2>选择一篇文档预览</h2><p>启用后的文档会按问题关键词加载相关片段，供 Agent 回答时使用。</p></div>}
      </article>
    </div>
  </section></DropTarget>
}

function SkillsPage({ items, update, action }: { items: SkillItem[]; update: (items: SkillItem[]) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [previewId, setPreviewId] = useState('')
  const preview = items.find((item) => item.id === previewId)
  useEffect(() => {
    if (!previewId) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewId('') }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [previewId])
  return <section className="library-page skill-library reveal">
    <PageLead title="Skills" copy="这里仅展示已由 Agent 安装的全局 Skills。发送完整 Skill 文件夹到对话，即可识别并安装。" action={<div className="skill-library-count"><Braces size={16} /><strong>{items.length}</strong><span>个已安装</span></div>} />
    {items.length === 0 ? <Empty icon={Braces} title="还没有已安装的 Skill" detail="前往对话，发送根目录中包含 SKILL.md 的完整文件夹。" /> : <div className="skill-card-grid">
      {items.map((item) => <article className="skill-card" key={item.id}>
        <div className="skill-card-top"><span className="skill-card-mark"><Braces size={18} /></span><span className="skill-scope">GLOBAL SKILL</span></div>
        <div className="skill-card-copy"><h3>{item.name}</h3><p>{item.description}</p></div>
        <div className="skill-card-meta"><FileText size={14} /><span>SKILL.md</span><span>·</span><time dateTime={item.createdAt}>安装于 {formatLocalTime(item.createdAt)}</time></div>
        <div className="skill-card-actions">
          <button className="skill-preview-button" type="button" onClick={() => setPreviewId(item.id)}><Eye size={16} />预览</button>
          <label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => void action('正在更新 Skill 状态', async () => update(await window.stable.skills.setEnabled(item.id, event.target.checked)))} /><span aria-hidden="true" /><em>{item.enabled ? '已启用' : '未启用'}</em></label>
          <button className="icon-button" type="button" onClick={() => void action('正在移出 Skill', async () => { update(await window.stable.skills.remove(item.id)); if (previewId === item.id) setPreviewId('') })} aria-label={`移出 ${item.name}`}><Trash2 size={17} /></button>
        </div>
      </article>)}
    </div>}
    {preview && <div className="skill-preview-overlay" role="presentation" onMouseDown={() => setPreviewId('')}>
      <section className="skill-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-preview-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>SKILL.md · RAW</span><h2 id="skill-preview-title">{preview.name}</h2></div><button className="icon-button" type="button" onClick={() => setPreviewId('')} aria-label="关闭 Skill 预览"><X size={18} /></button></header>
        <pre tabIndex={0}><code>{preview.content}</code></pre>
      </section>
    </div>}
  </section>
}

function AutomationsPage({ state, update, goChat, action }: { state: AutomationState; update: (value: AutomationState) => void; goChat: () => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [tab, setTab] = useState<'configured' | 'history' | 'templates'>('configured')
  const [draft, setDraft] = useState<AutomationDraft>()
  const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
  const newDraft = (): AutomationDraft => ({ title: '', prompt: '', schedule: { type: 'once', date: tomorrow(), time: '09:00' } })
  function changeType(type: AutomationSchedule['type']) {
    if (!draft) return
    const time = draft.schedule.time || '09:00'
    const schedule: AutomationSchedule = type === 'once' ? { type, date: tomorrow(), time }
      : type === 'daily' ? { type, time }
        : type === 'weekly' ? { type, time, weekdays: [1] }
          : { type, time, day: 1 }
    setDraft({ ...draft, schedule })
  }
  function saveDraft() {
    if (!draft) return
    void action('正在保存定时任务', async () => { update(await window.stable.automations.save(draft)); setDraft(undefined); setTab('configured') })
  }
  function edit(item: AutomationItem) { setDraft({ id: item.id, title: item.title, prompt: item.prompt, schedule: { ...item.schedule } as AutomationSchedule }) }
  return <section className="automations-page reveal">
    <header className="automations-head">
      <div><span>AUTOMATION</span><h1>定时</h1><p>Stable 开启期间按计划运行任务。退出软件后不在后台执行。</p></div>
      <div className="button-row"><button className="button" type="button" onClick={() => setDraft(newDraft())}><Plus size={16} />手动新建</button><button className="button primary" type="button" onClick={goChat}><MessageSquareText size={16} />在对话中创建</button></div>
    </header>
    <nav className="automation-tabs" aria-label="定时任务视图">
      <button data-active={tab === 'configured' || undefined} onClick={() => setTab('configured')}>已配置 <span>{state.items.length}</span></button>
      <button data-active={tab === 'history' || undefined} onClick={() => setTab('history')}>执行历史</button>
      <button data-active={tab === 'templates' || undefined} onClick={() => setTab('templates')}>任务模板</button>
    </nav>
    {tab === 'configured' && (state.items.length ? <div className="automation-grid">{state.items.map((item) => <article className="automation-card" key={item.id} data-enabled={item.enabled || undefined}>
      <header><span className="automation-card-icon"><Clock3 size={17} /></span><div><h2>{item.title}</h2><p>{formatAutomationSchedule(item.schedule)}</p></div><label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => void action('正在更新定时任务', async () => update(await window.stable.automations.setEnabled(item.id, event.target.checked)))} /><span aria-hidden="true" /><em>{item.enabled ? '已启用' : '已暂停'}</em></label></header>
      <p className="automation-prompt">{item.prompt}</p>
      <div className="automation-meta"><span>下次运行</span><strong>{item.nextRunAt ? formatLocalTime(item.nextRunAt) : '暂无'}</strong><small data-status={item.lastStatus}>{item.lastStatus === 'running' ? '运行中' : item.lastStatus === 'completed' ? '上次成功' : item.lastStatus === 'failed' ? '上次失败' : item.source === 'chat' ? '由对话创建' : '手动创建'}</small></div>
      <footer><button className="text-button" type="button" disabled={item.lastStatus === 'running'} onClick={() => void action('正在运行定时任务', async () => update(await window.stable.automations.run(item.id)))}><Play size={15} />立即运行</button><span /><button className="icon-button" type="button" onClick={() => edit(item)} aria-label={`编辑 ${item.title}`}><Pencil size={15} /></button><button className="icon-button" type="button" disabled={item.lastStatus === 'running'} onClick={() => void action('正在删除定时任务', async () => update(await window.stable.automations.remove(item.id)))} aria-label={`删除 ${item.title}`}><Trash2 size={15} /></button></footer>
    </article>)}</div> : <div className="automation-empty"><Clock3 size={24} /><h2>尚未配置定时任务</h2><p>手动设置日期时间，或直接告诉 Stable 何时执行什么任务。</p><button className="button primary" onClick={() => setDraft(newDraft())}>手动新建</button></div>)}
    {tab === 'history' && (state.runs.length ? <div className="automation-history">{state.runs.map((run) => <article key={run.id}><span className="run-dot" data-status={run.status} /><div><strong>{run.title}</strong><p>{run.error || (run.result ? run.result.slice(0, 180) : '任务正在执行')}</p></div><div><span>{run.status === 'completed' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'cancelled' ? '已取消' : '失败'}</span><time>{formatLocalTime(run.startedAt)}</time></div></article>)}</div> : <div className="automation-empty"><Activity size={24} /><h2>还没有执行记录</h2><p>任务首次运行后，结果与错误会显示在这里。</p></div>)}
    {tab === 'templates' && <div className="automation-grid">{state.templates.map((template) => <article className="automation-card template" key={template.id}><header><span className="automation-card-icon"><Sparkles size={17} /></span><div><h2>{template.title}</h2><p>{formatAutomationSchedule(template.schedule)}</p></div></header><p className="automation-prompt">{template.description}</p><footer><span /><button className="button" type="button" onClick={() => setDraft({ title: template.title, prompt: template.prompt, schedule: { ...template.schedule } as AutomationSchedule })}>使用模板</button></footer></article>)}</div>}
    {draft && <div className="automation-editor-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDraft(undefined) }}><section className="automation-editor" role="dialog" aria-modal="true" aria-labelledby="automation-editor-title">
      <header><div><span>AUTOMATION</span><h2 id="automation-editor-title">{draft.id ? '编辑定时任务' : '新建定时任务'}</h2></div><button className="icon-button" onClick={() => setDraft(undefined)} aria-label="关闭"><X size={17} /></button></header>
      <div className="field"><label htmlFor="automation-title">任务名称</label><input id="automation-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：每日工作摘要" /></div>
      <div className="field"><label htmlFor="automation-prompt">指定任务</label><textarea id="automation-prompt" rows={6} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="到点后让 Stable 执行什么？" /></div>
      <div className="automation-schedule-fields"><div className="field"><label htmlFor="automation-type">重复方式</label><select id="automation-type" value={draft.schedule.type} onChange={(event) => changeType(event.target.value as AutomationSchedule['type'])}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></div>
        {draft.schedule.type === 'once' && <div className="field"><label htmlFor="automation-date">执行日期</label><input id="automation-date" type="date" value={draft.schedule.date} onChange={(event) => setDraft({ ...draft, schedule: { type: 'once', time: draft.schedule.time, date: event.target.value } })} /></div>}
        {draft.schedule.type === 'monthly' && <div className="field"><label htmlFor="automation-day">每月日期</label><input id="automation-day" type="number" min="1" max="31" value={draft.schedule.day} onChange={(event) => setDraft({ ...draft, schedule: { type: 'monthly', time: draft.schedule.time, day: Number(event.target.value) } })} /></div>}
        <div className="field"><label htmlFor="automation-time">执行时间</label><input id="automation-time" type="time" value={draft.schedule.time} onChange={(event) => setDraft({ ...draft, schedule: { ...draft.schedule, time: event.target.value } as AutomationSchedule })} /></div>
      </div>
      {draft.schedule.type === 'weekly' && <fieldset className="weekday-picker"><legend>每周执行日</legend>{['日','一','二','三','四','五','六'].map((label, day) => { const selected = draft.schedule.type === 'weekly' && draft.schedule.weekdays.includes(day); return <button type="button" data-active={selected || undefined} aria-pressed={selected} key={label} onClick={() => { if (draft.schedule.type !== 'weekly') return; const weekdays = selected ? draft.schedule.weekdays.filter((item) => item !== day) : [...draft.schedule.weekdays, day].sort(); setDraft({ ...draft, schedule: { ...draft.schedule, weekdays } }) }}>{label}</button> })}</fieldset>}
      <footer><button className="button" type="button" onClick={() => setDraft(undefined)}>取消</button><button className="button primary" type="button" disabled={!draft.title.trim() || !draft.prompt.trim()} onClick={saveDraft}><Save size={16} />保存任务</button></footer>
    </section></div>}
  </section>
}

function PageLead({ title, copy, action }: { title: string; copy: string; action: React.ReactNode }) {
  return <div className="page-lead"><div><h2>{title}</h2><p>{copy}</p></div>{action}</div>
}

function ResourceRow({ title, detail, enabled, onToggle, onRemove }: { title: string; detail: string; enabled: boolean; onToggle: (enabled: boolean) => void; onRemove: () => void }) {
  return <article className="resource-row">
    <div className="resource-main"><strong>{title}</strong><span>{detail}</span></div>
    <label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} /><span aria-hidden="true" /><em>{enabled ? '已启用' : '未启用'}</em></label>
    <button className="icon-button" onClick={onRemove} aria-label={`移出 ${title}`}><Trash2 size={17} /></button>
  </article>
}

function SettingsPage({ state, updateModel, updateTheme, action }: { state: BootstrapData; updateModel: (model: ModelSettings) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [form, setForm] = useState({ ...state.model, apiKey: '' })
  const [globalFile, setGlobalFile] = useState<GlobalInstructionsFile>({ path: `${state.paths.userData}\\AGENTS.md`, content: '', exists: false })
  const [globalDraft, setGlobalDraft] = useState('')
  const [globalStatus, setGlobalStatus] = useState('正在读取本机设置…')
  const patch = (value: Partial<typeof form>) => setForm((current) => ({ ...current, ...value }))
  function deepSeekPreset() { patch({ providerId: 'deepseek', displayName: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }) }
  useEffect(() => {
    let active = true
    window.stable.settings.globalInstructions().then((value) => {
      if (!active) return
      setGlobalFile(value); setGlobalDraft(value.content); setGlobalStatus(value.exists ? '已读取当前全局提醒' : '文件尚未创建，保存时会自动创建')
    }).catch((reason) => { if (active) setGlobalStatus(errorMessage(reason)) })
    return () => { active = false }
  }, [])
  function setTheme(theme: ThemeMode) {
    void action('正在切换主题', async () => {
      const saved = await window.stable.appearance.setTheme(theme)
      document.documentElement.dataset.theme = saved
      updateTheme(saved)
    })
  }
  return <section className="settings-layout reveal">
    <div className="settings-form">
      <section className="appearance-settings" aria-labelledby="appearance-title">
        <div className="settings-section-head"><h2 id="appearance-title">外观主题</h2><p>选择适合当前环境的黑色或白色界面，品牌蓝保持一致。</p></div>
        <div className="theme-options">
          {([
            { id: 'dark' as const, label: '黑色', detail: '深色背景，适合长时间工作', icon: Moon },
            { id: 'light' as const, label: '白色', detail: '暖白背景，适合长时间查看', icon: Sun },
          ]).map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" className="theme-option" data-active={state.theme === id || undefined} aria-pressed={state.theme === id} onClick={() => setTheme(id)}>
            <span className="theme-sample" data-preview={id} aria-hidden="true"><span /><span /></span>
            <span className="theme-option-copy"><span><Icon size={17} />{label}</span><small>{detail}</small></span>
            {state.theme === id && <Check className="theme-selected" size={17} aria-hidden="true" />}
          </button>)}
        </div>
      </section>
      <PageLead title="模型服务" copy="Stable 使用 OpenAI Chat Completions 兼容接口。API Key 由 Windows 安全存储加密。" action={<button className="text-button" onClick={deepSeekPreset}>使用 DeepSeek 预设</button>} />
      <div className="form-grid">
        <div className="field"><label htmlFor="display-name">服务名称</label><input id="display-name" value={form.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></div>
        <div className="field"><label htmlFor="provider-id">服务 ID</label><input id="provider-id" value={form.providerId} onChange={(event) => patch({ providerId: event.target.value })} /></div>
        <div className="field span"><label htmlFor="base-url">API 地址</label><input id="base-url" value={form.baseURL} onChange={(event) => patch({ baseURL: event.target.value })} placeholder="https://api.example.com/v1" /></div>
        <div className="field"><label htmlFor="model-name">模型名称</label><input id="model-name" value={form.model} onChange={(event) => patch({ model: event.target.value })} /></div>
        <div className="field"><label htmlFor="api-key">API Key</label><input id="api-key" type="password" value={form.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder={form.hasApiKey ? '已安全保存；留空则保持不变' : '输入 API Key'} /></div>
      </div>
      <button className="button primary" onClick={() => void action('正在保存模型设置', async () => { const model = await window.stable.model.save(form); updateModel(model); patch({ ...model, apiKey: '' }) })}><Save size={17} />保存模型设置</button>
      <section className="update-settings" aria-labelledby="update-settings-title">
        <div className="settings-section-head"><span>UPDATE</span><h2 id="update-settings-title">软件更新</h2><p>安装版会从 GitHub Releases 后台下载安装包；确认重启后全程静默安装。</p></div>
        <div className="update-settings-row"><div><strong>当前版本 v{state.update.currentVersion}</strong><span>{state.update.status === 'development' ? '开发模式不连接更新服务' : state.update.status === 'checking' ? '正在检查更新…' : state.update.status === 'downloading' ? `正在下载 ${state.update.progress}%` : state.update.status === 'downloaded' ? `v${state.update.availableVersion} 已下载，等待重启更新` : state.update.status === 'installing' ? `正在静默安装 v${state.update.availableVersion}` : state.update.status === 'error' ? state.update.error : '已启用自动更新'}</span></div><button className="button" type="button" disabled={['checking', 'downloading', 'downloaded', 'installing'].includes(state.update.status)} onClick={() => void action('正在检查软件更新', async () => { await window.stable.updater.check() })}>{state.update.status === 'downloaded' ? '已准备好' : state.update.status === 'installing' ? '正在安装' : '检查更新'}</button></div>
      </section>
      <section className="global-instructions-settings" aria-labelledby="global-instructions-title">
        <div className="settings-section-head"><span>GLOBAL CONTEXT</span><h2 id="global-instructions-title">全局 Agent 对话提醒</h2><p>保存到本机 AGENTS.md，仅在之后启动的新任务中读取；不会改变正在执行的任务，也不属于当前对话的临时提示。</p></div>
        <div className="field"><label htmlFor="global-instructions">本机全局说明</label><textarea id="global-instructions" rows={10} value={globalDraft} onChange={(event) => { setGlobalDraft(event.target.value); setGlobalStatus('有尚未保存的更改') }} placeholder="例如：默认使用简体中文；交付文件保存到工作区并返回完整路径。" /></div>
        <div className="global-instructions-meta"><code>{globalFile.path}</code><span role="status">{globalStatus}</span></div>
        <button className="button primary" type="button" onClick={() => void action('正在保存全局 Agent 对话提醒', async () => { const saved = await window.stable.settings.saveGlobalInstructions(globalDraft); setGlobalFile(saved); setGlobalDraft(saved.content); setGlobalStatus('已保存，只影响之后启动的新任务') })}><Save size={17} />保存全局提醒</button>
      </section>
    </div>
    <aside className="local-sheet">
      <h2>本地目录</h2>
      <div><span>应用数据</span><code>{state.paths.userData}</code></div>
      <div><span>工作区</span><code>{state.paths.workspace}</code></div>
      <button className="button" onClick={() => window.stable.system.openPath(state.paths.workspace)}><Library size={17} />打开工作区</button>
      <p>卸载 Stable 时默认保留这里的数据。需要完全移除时，可在卸载后手动删除应用数据目录。</p>
    </aside>
  </section>
}

function Empty({ icon: Icon, title, detail }: { icon: typeof Database; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={26} strokeWidth={1.5} /><h2>{title}</h2><p>{detail}</p></div>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
