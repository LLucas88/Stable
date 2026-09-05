import { Fragment, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity, ArrowLeft, ArrowRight, ArrowUp, AtSign, BookOpenText, Bot, Box, Braces, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleAlert,
  CircleStop, Clock3, Copy, Database, Download, ExternalLink, Eye, FilePlus2, FileText, FlaskConical, FolderInput, FolderOpen, Home, Library, ListTree,
  Image as ImageIcon, Laptop2, LoaderCircle, LogOut, MessageSquareText, Minus, Moon, MoreVertical, Network, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Pin, PinOff, Play, Plus, Save,
  RotateCw, SendHorizontal, Share2, Shield, ShieldCheck, Sparkles, Sun, Trash2, Search, UploadCloud, UsersRound, Wifi, Workflow, Wrench, X,
} from 'lucide-react'
import logoUrl from '../build/stable_logo_transparent.png'
import launchLogoUrl from '../build/stable_launch_logo.png'
import conversationStartAnimationUrl from './assets/bloub-2.mp4'
import { ReportPage } from './ReportPage'
import { WorkflowStudio } from './WorkflowStudio'
import { formatElapsedTime } from './duration'
import { buildTraceTimeline, savedTraceStatus, traceActionLabel, traceItemStatus } from './trace-timeline'
import { MessageOutbox, type OutboxEntry, type OutboxResult } from './message-outbox'
import { taskErrorMessage } from './task-feedback'
import { ConversationWending } from './ConversationWending'
import { ApprovalComposer } from './ApprovalComposer'
import { useComposerAutosize } from './use-composer-autosize'
import { useConversationUnread } from './use-conversation-unread'
import type { AgentAttachment, AgentCapability, AgentPermissionMode, AgentReference, AgentReferenceKind, AgentState, AgentTraceItem, AgentTraceStatus, AutomationDraft, AutomationItem, AutomationSchedule, AutomationState, BootstrapData, ConversationItem, ConversationSearchResult, DataItem, DataLibraryCategory, DataLibraryItem, GlobalInstructionsFile, KnowledgeDocument, KnowledgeItem, LibraryRunStatus, MessageItem, ModelProfile, Page, PreviewBounds, PreviewState, SkillItem, TeamState, ThemeMode, WendingCliStatus } from './types'

type WorkspaceMode = 'work' | 'lab'
type ComposerMessage = { prompt: string; attachments: AgentAttachment[]; references: AgentReference[] }
type RepositoryPageId = Extract<Page, 'data' | 'reports' | 'skills' | 'knowledge'>
type PrimaryNavId = Page | 'repository'

const MIN_RAIL_WIDTH = 280
const DEFAULT_RAIL_WIDTH = MIN_RAIL_WIDTH
const MAX_RAIL_WIDTH = 560
const MIN_MAIN_WIDTH = 640

function maximumRailWidth() {
  return Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_MAIN_WIDTH))
}

function clampRailWidth(value: number) {
  return Math.min(maximumRailWidth(), Math.max(MIN_RAIL_WIDTH, value))
}

const WORK_NAV: Array<{ id: PrimaryNavId; label: string; icon: typeof Home }> = [
  { id: 'agent', label: '对话', icon: MessageSquareText },
  { id: 'automations', label: '定时', icon: Clock3 },
  { id: 'repository', label: '仓库', icon: Library },
  { id: 'mcp-cli', label: 'MCP & CLI', icon: Box },
]

const WENDING_CLI_PREFILL = '调用问鼎cli：我需要做...'

const LAB_NAV: Array<{ id: Page; label: string; icon: typeof Home }> = [
  { id: 'workflows', label: '工作流', icon: Workflow },
  { id: 'team', label: 'Team', icon: UsersRound },
]

const REPOSITORY_TABS: Array<{ id: RepositoryPageId; label: string; icon: typeof Home }> = [
  { id: 'data', label: '数据', icon: Database },
  { id: 'reports', label: '报告', icon: FileText },
  { id: 'skills', label: 'Skills', icon: Braces },
  { id: 'knowledge', label: '知识库', icon: BookOpenText },
]

const PAGE_IDS = [...WORK_NAV.filter((item) => item.id !== 'repository').map((item) => item.id), ...LAB_NAV.map((item) => item.id), ...REPOSITORY_TABS.map((item) => item.id)] as Page[]
const isRepositoryPage = (value: Page): value is RepositoryPageId => REPOSITORY_TABS.some((item) => item.id === value)

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
}

function attachmentIsImage(item: { name?: string; path?: string; type?: string; mediaType?: string }) {
  if (String(item.mediaType || '').startsWith('image/')) return true
  return /\.(?:png|jpe?g|webp)$/i.test(String(item.path || item.name || '')) || /^(?:png|jpe?g|webp)$/i.test(String(item.type || ''))
}

function profileIsDeepSeek(item?: Pick<ModelProfile, 'id' | 'providerId' | 'displayName' | 'model'>) {
  return Boolean(item && [item.id, item.providerId, item.displayName, item.model].some((value) => value.toLowerCase().includes('deepseek')))
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
  const initialPage = requestedPage && PAGE_IDS.includes(requestedPage) ? requestedPage : 'agent'
  const [page, setPage] = useState<Page>(initialPage)
  const [mode, setMode] = useState<WorkspaceMode>(LAB_NAV.some((item) => item.id === initialPage) ? 'lab' : 'work')
  const [repositoryTab, setRepositoryTab] = useState<RepositoryPageId>(isRepositoryPage(initialPage) ? initialPage : 'data')
  const [agentPrefill, setAgentPrefill] = useState('')
  const [state, setState] = useState<BootstrapData | null>(null)
  const [showLaunch, setShowLaunch] = useState(true)
  const [launchRunning, setLaunchRunning] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('正在读取本地工作区')
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; detail: string } | null>(null)
  const creatingConversationRef = useRef(false)
  const [conversationTasksTarget, setConversationTasksTarget] = useState<HTMLDivElement | null>(null)
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [conversationSearchResults, setConversationSearchResults] = useState<ConversationSearchResult[]>([])
  const [conversationSearchLoading, setConversationSearchLoading] = useState(false)
  const [conversationSearchError, setConversationSearchError] = useState('')
  const confirmationResolver = useRef<((value: boolean) => void) | null>(null)
  const railResize = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const conversationSearchButtonRef = useRef<HTMLButtonElement>(null)

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
    setMode(LAB_NAV.some((item) => item.id === page) ? 'lab' : 'work')
    if (isRepositoryPage(page)) setRepositoryTab(page)
  }, [page])

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

  useEffect(() => {
    if (!conversationSearchOpen || !state) return
    let cancelled = false
    setConversationSearchLoading(true)
    setConversationSearchError('')
    const timer = window.setTimeout(() => {
      void window.stable.agent.search(conversationSearchQuery).then((results) => {
        if (!cancelled) setConversationSearchResults(results)
      }).catch((reason) => {
        if (!cancelled) { setConversationSearchResults([]); setConversationSearchError(errorMessage(reason)) }
      }).finally(() => { if (!cancelled) setConversationSearchLoading(false) })
    }, 160)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [conversationSearchOpen, conversationSearchQuery, state?.conversations.length])

  useEffect(() => {
    const fitRailToWindow = () => setRailWidth((current) => clampRailWidth(current))
    window.addEventListener('resize', fitRailToWindow)
    return () => {
      window.removeEventListener('resize', fitRailToWindow)
      document.documentElement.removeAttribute('data-rail-resizing')
    }
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

  function selectMode(next: WorkspaceMode) {
    setMode(next)
    setPage(next === 'work' ? 'agent' : 'workflows')
  }

  function navigate(id: PrimaryNavId) {
    if (id === 'agent') {
      if (creatingConversationRef.current) return
      creatingConversationRef.current = true
      void action('正在新建对话', async () => {
        try {
          const agent = await window.stable.agent.create()
          setState(current => current ? { ...current, ...agent } : current)
          setAgentPrefill('')
          setPage('agent')
        } finally { creatingConversationRef.current = false }
      })
    } else if (id === 'repository') setPage(repositoryTab)
    else setPage(id)
  }

  function selectRepositoryTab(id: RepositoryPageId) {
    setRepositoryTab(id)
    setPage(id)
  }

  function beginRailResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    railResize.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: railWidth }
    document.documentElement.dataset.railResizing = 'true'
  }

  function continueRailResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = railResize.current
    if (!resize || resize.pointerId !== event.pointerId) return
    setRailWidth(clampRailWidth(resize.startWidth + event.clientX - resize.startX))
  }

  function endRailResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (railResize.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    railResize.current = null
    document.documentElement.removeAttribute('data-rail-resizing')
  }

  function resizeRailWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -16, ArrowRight: 16 }
    if (event.key in steps) {
      event.preventDefault()
      setRailWidth((current) => clampRailWidth(current + steps[event.key]))
    } else if (event.key === 'Home') {
      event.preventDefault(); setRailWidth(MIN_RAIL_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault(); setRailWidth(maximumRailWidth())
    }
  }

  function openConversationSearch() {
    setConversationSearchQuery('')
    setConversationSearchResults([])
    setConversationSearchError('')
    setConversationSearchOpen(true)
  }

  function closeConversationSearch(restoreFocus = true) {
    setConversationSearchOpen(false)
    setConversationSearchQuery('')
    if (restoreFocus) window.requestAnimationFrame(() => conversationSearchButtonRef.current?.focus())
  }

  function selectConversationSearchResult(id: string) {
    closeConversationSearch(false)
    setMode('work')
    setPage('agent')
    if (state?.activeConversationId === id) return
    void action('正在切换对话', async () => {
      const agent = await window.stable.agent.select(id)
      setState((current) => current ? { ...current, ...agent } : current)
    })
  }

  async function openWendingConversation() {
    setError('')
    const agent = await window.stable.agent.create()
    setState((current) => current ? { ...current, ...agent } : current)
    setAgentPrefill(WENDING_CLI_PREFILL)
    setMode('work')
    setPage('agent')
    setStatus('问鼎 CLI 已载入，请确认提示词后发送')
  }

  const launch = showLaunch ? <LaunchSplash running={launchRunning} onFinish={finishLaunch} /> : null

  if (!state) return <><div className="window-shell"><WindowTitlebar /><BootScreen status={status} error={error} /></div>{launch}</>
  if (!['disabled', 'authenticated'].includes(state.cloud.status)) return <><div className="window-shell"><WindowTitlebar /><CloudAccessPage state={state} onComplete={(value) => { document.documentElement.dataset.theme = value.theme; setState(value); setError('') }} /></div>{launch}</>

  return (
    <><div className="window-shell">
      <WindowTitlebar railCollapsed={railCollapsed} searchOpen={conversationSearchOpen} searchButtonRef={conversationSearchButtonRef} onToggleRail={() => setRailCollapsed((current) => !current)} onSearch={openConversationSearch} />
      <div className="app-shell" data-rail-collapsed={railCollapsed || undefined} style={{ '--rail-width': `${railCollapsed ? 0 : railWidth}px` } as CSSProperties}>
      {!railCollapsed && <aside className="side-rail" id="stable-main-navigation" aria-label="主导航">
        <div className="rail-mode-switch" role="tablist" aria-label="Stable 工作区">
          <button type="button" role="tab" aria-selected={mode === 'work'} data-active={mode === 'work' || undefined} onClick={() => selectMode('work')}><BriefcaseBusiness size={14} aria-hidden="true" /><span>工作</span></button>
          <button type="button" role="tab" aria-selected={mode === 'lab'} data-active={mode === 'lab' || undefined} onClick={() => selectMode('lab')}><FlaskConical size={14} aria-hidden="true" /><span>实验室</span></button>
        </div>
        <nav className="rail-nav" aria-label={mode === 'work' ? '工作模块' : '实验室模块'}>
          {(mode === 'work' ? WORK_NAV : LAB_NAV).map(({ id, label, icon: Icon }) => {
            const active = id === 'repository' ? isRepositoryPage(page) : page === id
            return <button key={id} className="rail-button" data-active={active || undefined} onClick={() => navigate(id)} disabled={id === 'agent' && busy === '正在新建对话'} title={id === 'agent' ? '新建任务对话' : undefined} aria-label={label} aria-current={active ? 'page' : undefined}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          })}
        </nav>
        {mode === 'work' && <div className="rail-conversation-tasks-slot" ref={setConversationTasksTarget} aria-label="对话任务" />}
        <AccountDock state={state} replaceState={setState} updateTheme={(theme) => update('theme', theme)} action={action} />
      </aside>}

      {!railCollapsed && <div
        className="rail-resizer"
        role="separator"
        aria-label="调整导航栏宽度"
        aria-controls="stable-main-frame"
        aria-orientation="vertical"
        aria-valuemin={MIN_RAIL_WIDTH}
        aria-valuemax={maximumRailWidth()}
        aria-valuenow={Math.round(railWidth)}
        tabIndex={0}
        onDoubleClick={() => setRailWidth(clampRailWidth(DEFAULT_RAIL_WIDTH))}
        onKeyDown={resizeRailWithKeyboard}
        onPointerDown={beginRailResize}
        onPointerMove={continueRailResize}
        onPointerUp={endRailResize}
        onPointerCancel={endRailResize}
      />}

      <main className="main-frame" id="stable-main-frame">
        <div className="page-stage" data-page="agent" hidden={page !== 'agent'}>
          <AgentPage active={page === 'agent'} state={state} prefill={agentPrefill} consumePrefill={() => setAgentPrefill('')} updateAgent={(agent) => setState((current) => current ? { ...current, ...agent } : current)} updateAutomations={(automations) => update('automations', automations)} updateTeam={(team) => update('team', team)} action={action} openConversation={() => setPage('agent')} conversationTasksTarget={conversationTasksTarget} />
        </div>
        <div className="page-stage" data-page="workflows" hidden={page !== 'workflows'}>
          <WorkflowStudio state={state} update={(items) => update('workflows', items)} action={action} busy={busy} />
        </div>
        {isRepositoryPage(page) && <RepositoryPage activeTab={page} onTabChange={selectRepositoryTab} state={state} update={update} action={action} />}
        {page !== 'agent' && page !== 'workflows' && !isRepositoryPage(page) && <div className="page-stage" data-page={page} key={page}>
          {page === 'automations' && <AutomationsPage state={state.automations} update={(automations) => update('automations', automations)} goChat={() => { setAgentPrefill('帮我创建一个定时任务：'); setPage('agent') }} action={action} />}
          {page === 'team' && <TeamPage state={state} updateTeam={(team) => update('team', team)} action={action} />}
          {page === 'mcp-cli' && <McpCliPage onUseWending={openWendingConversation} />}
        </div>}

      </main>

        {(state.update.status === 'downloaded' || state.update.status === 'installing') && <section className="update-notice" role="status" aria-live="polite"><div><strong>Stable {state.update.availableVersion} {state.update.status === 'installing' ? '正在打开安装窗口' : '已准备好'}</strong><span>{state.update.status === 'installing' ? 'Stable 即将关闭，独立窗口会持续显示真实安装进度。' : '安装时会关闭 Stable，并在独立窗口中显示百分比；完成后请重新点击图标打开新版。'}</span></div>{state.update.status === 'downloaded' && <button className="button primary" type="button" onClick={() => void window.stable.updater.install()}>安装更新</button>}</section>}

        {confirmation && <ConfirmModal value={confirmation} onCancel={() => resolveConfirmation(false)} onConfirm={() => resolveConfirmation(true)} />}
        {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={18} /></button></div>}
      </div>
      {conversationSearchOpen && <ConversationSearch query={conversationSearchQuery} results={conversationSearchResults} loading={conversationSearchLoading} error={conversationSearchError} activeConversationId={state.activeConversationId} onQueryChange={setConversationSearchQuery} onSelect={selectConversationSearchResult} onClose={() => closeConversationSearch()} />}
    </div>{launch}</>
  )
}

function McpCliPage({ onUseWending }: { onUseWending: () => Promise<void> }) {
  const [tab, setTab] = useState<'cli' | 'mcp'>('cli')
  const [cliStatus, setCliStatus] = useState<WendingCliStatus>({ id: 'wending-cli', status: 'checking', version: '0.9.0.dev9', detail: '正在读取内置服务状态。' })
  const [using, setUsing] = useState(false)
  const [localError, setLocalError] = useState('')
  const useLock = useRef(false)
  const alive = useRef(true)
  const useButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let cancelled = false
    void window.stable.extensions.wendingStatus()
      .then((value) => { if (!cancelled) setCliStatus(value) })
      .catch((reason) => { if (!cancelled) setCliStatus({ id: 'wending-cli', status: 'unavailable', version: '0.9.0.dev9', detail: errorMessage(reason) }) })
    return () => { cancelled = true }
  }, [])

  async function useWending() {
    if (useLock.current || cliStatus.status === 'unavailable') return
    useLock.current = true
    setUsing(true)
    setLocalError('')
    setCliStatus((current) => ({ ...current, status: 'checking', detail: '正在后台验证内置命令。' }))
    try {
      const checked = await window.stable.extensions.wendingStatus()
      if (!alive.current) return
      setCliStatus(checked)
      if (checked.status === 'unavailable') throw new Error(checked.detail)
      await onUseWending()
    } catch (reason) {
      setLocalError(errorMessage(reason))
    } finally {
      useLock.current = false
      if (alive.current) setUsing(false)
    }
  }

  const statusLabel = cliStatus.status === 'ready' ? 'CLI 可用' : cliStatus.status === 'bundled' ? '已内置' : cliStatus.status === 'unavailable' ? '不可用' : '检查中'
  const StatusIcon = cliStatus.status === 'ready' ? Check : cliStatus.status === 'unavailable' ? CircleAlert : LoaderCircle

  return <section className="extension-market page-stage" data-page="mcp-cli">
    <header className="extension-market-head">
      <div><span>TOOL CENTER</span><h1>MCP &amp; CLI</h1><p>把可调用的本地服务带入 Stable 对话。首版已内置问鼎 CLI，MCP 暂未开放。</p></div>
      <div className="extension-market-note"><ShieldCheck size={18} aria-hidden="true" /><span>点击“使用”创建独立任务，再在任务内登录；仅预填提示词，不会自动发送或执行业务任务。</span></div>
    </header>
    <div className="extension-market-body">
      <div className="extension-tabs" role="tablist" aria-label="工具类型">
        <button type="button" role="tab" aria-selected={tab === 'cli'} data-active={tab === 'cli' || undefined} onClick={() => setTab('cli')}>CLI <small>1</small></button>
        <button type="button" role="tab" aria-selected={tab === 'mcp'} data-active={tab === 'mcp' || undefined} onClick={() => setTab('mcp')}>MCP <small>0</small></button>
      </div>

      {tab === 'cli' ? <div className="extension-catalog" role="tabpanel" aria-label="CLI 服务">
        <div className="extension-section-title"><div><span>内置服务</span><strong>开箱即用，无需另外安装 Python 或 pipx</strong></div><small>Windows x64</small></div>
        <article className="extension-card" data-status={cliStatus.status}>
          <div className="extension-card-mark" aria-hidden="true">问</div>
          <div className="extension-card-copy">
            <header><h2>问鼎 CLI</h2><span>内置</span></header>
            <p>面向品牌经营的数据查询与分析命令行服务。在安全表单中登录，再进入 Agent 对话查数和分析。</p>
            <div className="extension-tags" aria-label="能力标签"><span>经营数据</span><span>会员洞察</span><span>营销分析</span></div>
            <div className="extension-runtime-status" data-status={cliStatus.status} role="status" aria-live="polite">
              <StatusIcon className={cliStatus.status === 'checking' ? 'spin' : undefined} size={15} aria-hidden="true" />
              <span><strong>{statusLabel}</strong>{cliStatus.detail}</span>
            </div>
            <p className="extension-login-status">每个任务独立绑定账号、渠道和品牌</p>
            {localError && <p className="extension-card-error" role="alert">{localError}</p>}
          </div>
          <div className="extension-card-action">
            <span>v{cliStatus.version}</span>
            <button ref={useButton} className="button primary" type="button" disabled={using || cliStatus.status === 'unavailable'} onClick={() => void useWending()}>
              {using ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <MessageSquareText size={16} aria-hidden="true" />}
              {using ? '正在准备' : cliStatus.status === 'unavailable' ? '资源不可用' : '使用'}
            </button>
          </div>
        </article>
        <div className="extension-use-preview">
          <div><SquarePromptIcon /><span>进入新对话后将自动填入</span></div>
          <code>{WENDING_CLI_PREFILL}</code>
          <ArrowRight size={17} aria-hidden="true" />
        </div>
      </div> : <div className="extension-empty" role="tabpanel" aria-label="MCP 服务">
        <span><Network size={24} aria-hidden="true" /></span><h2>MCP 暂未接入</h2><p>后续接入的 MCP 服务会集中显示在这里。当前版本不会扫描或连接任何 MCP 服务。</p>
      </div>}
    </div>
  </section>
}

function SquarePromptIcon() {
  return <span className="extension-prompt-icon" aria-hidden="true"><Box size={15} /></span>
}

function RepositoryPage({ activeTab, onTabChange, state, update, action }: {
  activeTab: RepositoryPageId
  onTabChange: (page: RepositoryPageId) => void
  state: BootstrapData
  update: <K extends keyof BootstrapData>(key: K, value: BootstrapData[K]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
}) {
  return <section className="repository-page page-stage" data-page="repository">
    <header className="repository-header">
      <div><span>REPOSITORY</span><h1>仓库</h1><p>集中管理 Stable 的数据、报告、Skills 与知识库。</p></div>
      <nav className="repository-tabs" role="tablist" aria-label="仓库分类">
        {REPOSITORY_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} data-active={activeTab === id || undefined} onClick={() => onTabChange(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}
      </nav>
    </header>
    <div className="repository-body" role="tabpanel" aria-label={REPOSITORY_TABS.find((item) => item.id === activeTab)?.label}>
      {activeTab === 'data' && <DataPage dataItems={state.data} libraryItems={state.library} updateData={(items) => update('data', items)} updateLibrary={(items) => update('library', items)} action={action} />}
      {activeTab === 'reports' && <ReportPage items={state.reports} update={(items) => update('reports', items)} action={action} />}
      {activeTab === 'skills' && <SkillsPage items={state.skills} update={(items) => update('skills', items)} action={action} />}
      {activeTab === 'knowledge' && <KnowledgePage items={state.knowledge} update={(items) => update('knowledge', items)} action={action} />}
    </div>
  </section>
}

function CloudAccessPage({ state, onComplete }: { state: BootstrapData; onComplete: (value: BootstrapData) => void }) {
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

  async function submit(run: () => Promise<BootstrapData>) {
    setPending(true); setMessage('')
    try { onComplete(await run()) }
    catch (reason) {
      setMessage(errorMessage(reason))
      window.requestAnimationFrame(() => errorRef.current?.focus())
    } finally { setPending(false) }
  }

  return <main className="cloud-access-shell">
    <section className="cloud-access-card" aria-labelledby="cloud-access-title">
      <div className="cloud-access-brand"><img src={logoUrl} alt="" width="52" height="52" /><span>STABLE CLOUD</span></div>
      <div className="cloud-access-copy">
        <h1 id="cloud-access-title">{mustChange ? '设置你的正式密码' : unavailable ? '暂时无法连接云端' : '登录 Stable'}</h1>
        <p>{mustChange ? '这是一次性临时密码。修改完成后，其他设备会话将失效，本机继续使用新会话。' : unavailable ? '已保存的登录凭据仍在 Windows 安全存储中。网络恢复后可直接重试。' : '使用管理员分配的内部账号登录。模型凭据由 Stable 平台统一保管。'}</p>
      </div>
      {message && <div className="cloud-auth-error" role="alert" tabIndex={-1} ref={errorRef}><CircleAlert size={18} aria-hidden="true" /><span>{message}</span></div>}
      {mustChange ? <form className="cloud-auth-form" onSubmit={(event) => { event.preventDefault(); void submit(() => window.stable.cloud.changePassword(currentPassword, newPassword, confirmPassword)) }}>
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
  </main>
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

function WindowTitlebar({ railCollapsed, searchOpen, searchButtonRef, onToggleRail, onSearch }: {
  railCollapsed?: boolean
  searchOpen?: boolean
  searchButtonRef?: RefObject<HTMLButtonElement>
  onToggleRail?: () => void
  onSearch?: () => void
}) {
  if (!onToggleRail || !onSearch) return <div className="window-titlebar" aria-hidden="true" />
  return <div className="window-titlebar">
    <div className="window-titlebar-tools" aria-label="窗口工具">
      <button type="button" onClick={onToggleRail} aria-controls="stable-main-navigation" aria-expanded={!railCollapsed} aria-label={railCollapsed ? '展开侧边导航栏' : '收起侧边导航栏'} title={railCollapsed ? '展开侧边导航栏' : '收起侧边导航栏'}>
        {railCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
      </button>
      <button ref={searchButtonRef} type="button" onClick={onSearch} aria-haspopup="dialog" aria-expanded={searchOpen} aria-label="搜索对话记录" title="搜索对话记录"><Search size={17} aria-hidden="true" /></button>
    </div>
  </div>
}

function ConversationSearch({ query, results, loading, error, activeConversationId, onQueryChange, onSelect, onClose }: {
  query: string
  results: ConversationSearchResult[]
  loading: boolean
  error: string
  activeConversationId: string
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { window.requestAnimationFrame(() => inputRef.current?.focus()) }, [])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return <div className="conversation-search-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="conversation-search-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="conversation-search-title" onKeyDown={handleKeyDown}>
      <header><div><h2 id="conversation-search-title">搜索对话记录</h2><p>搜索对话标题和全部消息内容</p></div><button type="button" onClick={onClose} aria-label="关闭对话搜索"><X size={17} aria-hidden="true" /></button></header>
      <label className="conversation-search-field">
        <Search size={17} aria-hidden="true" />
        <input ref={inputRef} value={query} maxLength={200} onChange={(event) => onQueryChange(event.target.value)} placeholder="输入标题或消息关键词" aria-label="搜索对话标题或消息内容" />
        {query && <button type="button" onClick={() => { onQueryChange(''); inputRef.current?.focus() }} aria-label="清除搜索关键词"><X size={15} aria-hidden="true" /></button>}
      </label>
      <div className="conversation-search-summary" aria-live="polite"><span>{query.trim() ? '搜索结果' : '最近对话'}</span><small>{loading ? '正在搜索…' : `${results.length} 条`}</small></div>
      <div className="conversation-search-results">
        {!loading && error && <div className="conversation-search-empty" role="alert"><CircleAlert size={20} aria-hidden="true" /><strong>搜索失败</strong><span>{error}</span></div>}
        {!loading && !error && !results.length && <div className="conversation-search-empty"><Search size={20} aria-hidden="true" /><strong>{query.trim() ? '没有找到相关对话' : '还没有对话记录'}</strong><span>{query.trim() ? '试试更短或不同的关键词。' : '创建对话后会显示在这里。'}</span></div>}
        {results.map((item) => <button type="button" className="conversation-search-result" data-active={item.id === activeConversationId || undefined} aria-current={item.id === activeConversationId ? 'page' : undefined} onClick={() => onSelect(item.id)} key={item.id}>
          <MessageSquareText size={17} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.snippet || `${item.messageCount} 条消息`}</small></span><ChevronRight size={16} aria-hidden="true" />
        </button>)}
      </div>
    </section>
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
      <button onClick={() => go('agent')}><Box size={18} /><span><strong>选择对话模型</strong><small>在对话输入区切换当前模型</small></span></button>
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
  { id: 'full', label: '完全访问权限', detail: '允许联网；已核实的读取、搜索和工作区文件操作自动执行；高风险或无法核实的操作仍需确认。' },
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
  | { requestId: number; kind: 'file'; value: string; title: string }

type MessageAttachmentItem = NonNullable<MessageItem['attachments']>[number]
type ViewerImageItem = { name: string; path?: string; previewUrl?: string }

interface ImageViewerTarget {
  items: ViewerImageItem[]
  index: number
}

function previewBounds(element: HTMLElement): PreviewBounds {
  const rect = element.getBoundingClientRect()
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
}

function emptyPreviewState(): PreviewState {
  return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false }
}

function AgentPage({ active, state, prefill, consumePrefill, updateAgent, updateAutomations, updateTeam, action, openConversation, conversationTasksTarget }: { active: boolean; state: BootstrapData; prefill: string; consumePrefill: () => void; updateAgent: (value: AgentState) => void; updateAutomations: (value: AutomationState) => void; updateTeam: (value: TeamState) => void; action: (label: string, run: () => Promise<void>) => Promise<void>; openConversation: () => void; conversationTasksTarget: HTMLDivElement | null }) {
  const [prompt, setPrompt] = useState('')
  const [pendingMap, setPendingMap] = useState<Record<string, { content: string; attachments: NonNullable<MessageItem['attachments']> } | undefined>>({})
  const [attachmentMap, setAttachmentMap] = useState<Record<string, AgentAttachment[]>>({})
  const [referenceMap, setReferenceMap] = useState<Record<string, AgentReference[]>>({})
  const [composerErrorMap, setComposerErrorMap] = useState<Record<string, string>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversationMenuId, setConversationMenuId] = useState('')
  const [previewTarget, setPreviewTarget] = useState<ConversationPreviewTarget>()
  const [imageViewer, setImageViewer] = useState<ImageViewerTarget>()
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewState, setPreviewState] = useState<PreviewState>(emptyPreviewState)
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [modelStatus, setModelStatus] = useState('')
  const [attachmentStatusMap, setAttachmentStatusMap] = useState<Record<string, string>>({})
  const [traceMap, setTraceMap] = useState<Record<string, AgentTraceRun | undefined>>({})
  const [streamingAnswerMap, setStreamingAnswerMap] = useState<Record<string, { id: string; runId: string; turn: number; step: number; time: number; content: string } | undefined>>({})
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const { unread, approvalUnread, markRead, markCompleted, markApproval, clearApprovals } = useConversationUnread(state.activeConversationId, active)
  const completedUnreadCount = state.conversations.filter((item) => unread.has(item.id) && !runningMap[item.id]).length
  useEffect(() => {
    // Optional chaining keeps development/older preview bridges compatible.
    void window.stable.appearance.setCompletedCount?.(completedUnreadCount).catch(() => {})
  }, [completedUnreadCount])
  const [, refreshOutbox] = useState(0)
  const outboxRef = useRef<MessageOutbox<ComposerMessage>>()
  if (!outboxRef.current) outboxRef.current = new MessageOutbox({ run: runQueuedMessage, steer: steerQueuedMessage, changed: () => refreshOutbox((value) => value + 1) })
  const outbox = outboxRef.current
  const queue = outbox.snapshot(state.activeConversationId)
  const [queueEdit, setQueueEdit] = useState<{ conversationId: string; id: string; text: string }>()
  const cancelBeforeDispatchRef = useRef<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationWorkspaceRef = useRef<HTMLDivElement>(null)
  const previewRequestRef = useRef(0)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  useComposerAutosize(promptRef, prompt, active)
  const copyUndoRef = useRef<Record<string, CopyUndoState | undefined>>({})
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const dataMenuRef = useRef<HTMLDetailsElement>(null)
  const skillMenuRef = useRef<HTMLDetailsElement>(null)
  const teamMenuRef = useRef<HTMLDetailsElement>(null)
  const capabilityMenuRef = useRef<HTMLDetailsElement>(null)
  const permissionMenuRef = useRef<HTMLDetailsElement>(null)
  const modelMenuRef = useRef<HTMLDetailsElement>(null)
  const activeConversationIdRef = useRef(state.activeConversationId)
  const stateRef = useRef(state)
  const activeConversation = state.conversations.find((item) => item.id === state.activeConversationId) || state.conversations[0]
  const running = Boolean(runningMap[state.activeConversationId])
  const pendingPrompt = pendingMap[state.activeConversationId]
  const liveTrace = traceMap[state.activeConversationId]
  const pendingApproval = running ? liveTrace?.items.find((item) => item.kind === 'approval' && item.status === 'running' && item.requestId) : undefined
  const streamingAnswer = streamingAnswerMap[state.activeConversationId]
  const attachments = attachmentMap[state.activeConversationId] || []
  const imageAttachments = attachments.filter(attachmentIsImage)
  const documentAttachments = attachments.filter((item) => !attachmentIsImage(item))
  const selectedReferences = referenceMap[state.activeConversationId] || []
  const hasComposerContent = Boolean(prompt.trim() || attachments.length || selectedReferences.length)
  const showComposerStop = running && !hasComposerContent
  const composerError = composerErrorMap[state.activeConversationId] || ''
  const activeCapability = CAPABILITY_OPTIONS.find((item) => item.id === activeConversation?.capability) || CAPABILITY_OPTIONS[0]
  const activePermission = PERMISSION_OPTIONS.find((item) => item.id === activeConversation?.permissionMode) || PERMISSION_OPTIONS[0]
  const defaultModel = state.models.items.find((item) => item.id === state.models.defaultModelId) || state.models.items[0]
  const activeModel = state.models.items.find((item) => item.id === activeConversation?.modelId) || defaultModel
  const deepSeekImageBlocked = imageAttachments.length > 0 && profileIsDeepSeek(activeModel)
  const attachmentStatus = attachmentStatusMap[state.activeConversationId] || ''
  const conversationIsEmpty = state.messages.length === 0 && !pendingPrompt
  const reduceConversationMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const enabledData = state.data.filter((item) => item.enabled)
  const enabledSkills = state.skills.filter((item) => item.enabled)
  const enabledKnowledge = state.knowledge.filter((item) => item.enabled)
  const scripts = state.library.filter((item) => item.kind === 'script')
  const pinnedConversations = state.conversations.filter((item) => item.pinned)
  const remoteTeamDevices = state.team.devices.filter((item) => item.id !== state.team.profile?.deviceId)
  activeConversationIdRef.current = state.activeConversationId
  stateRef.current = state

  useEffect(() => { setPrompt(''); setSidebarOpen(false) }, [state.activeConversationId])

  useEffect(() => {
    if (!active || !prefill || running) return
    setPrompt(prefill); consumePrefill()
    window.requestAnimationFrame(() => { promptRef.current?.focus(); promptRef.current?.setSelectionRange(prefill.length, prefill.length) })
  }, [active, prefill, running])

  useEffect(() => { setModelStatus(''); if (modelMenuRef.current) modelMenuRef.current.open = false }, [state.activeConversationId])

  useEffect(() => {
    if (!conversationMenuId) return
    const menuHost = () => Array.from(document.querySelectorAll<HTMLElement>(`[data-conversation-menu="${conversationMenuId}"]`)).find((element) => element.getClientRects().length)
    menuHost()?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const closeMenu = (event: globalThis.PointerEvent) => {
      if (!(event.target as Element).closest(`[data-conversation-menu="${conversationMenuId}"]`)) setConversationMenuId('')
    }
    const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
      const host = menuHost()
      if (event.key === 'Escape') {
        setConversationMenuId('')
        host?.querySelector<HTMLButtonElement>(':scope > button')?.focus()
      } else if (host?.contains(document.activeElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeFromKeyboard)
    return () => { document.removeEventListener('pointerdown', closeMenu); window.removeEventListener('keydown', closeFromKeyboard) }
  }, [conversationMenuId])

  useEffect(() => {
    setPreviewTarget(undefined)
    setPreviewWidth(0)
    setPreviewState(emptyPreviewState())
    void window.stable.preview.close()
  }, [state.activeConversationId])

  function setAttachments(next: AgentAttachment[] | ((current: AgentAttachment[]) => AgentAttachment[])) {
    setAttachmentMap((current) => {
      const currentItems = current[state.activeConversationId] || []
      return { ...current, [state.activeConversationId]: typeof next === 'function' ? next(currentItems) : next }
    })
  }

  function setAttachmentStatus(value: string) {
    setAttachmentStatusMap((current) => ({ ...current, [state.activeConversationId]: value }))
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
    if (event.kind === 'approval') markApproval(event.conversationId, `${event.runId}:${event.id}`, event.status === 'running')
    if (event.id === 'complete' || (event.id === 'runtime' && (event.status === 'failed' || event.status === 'cancelled'))) clearApprovals(event.conversationId)
    if (event.eventType === 'agent/answer-delta') {
      if (event.delta) setStreamingAnswerMap((all) => {
          const current = all[event.conversationId]
          const sameStep = current?.runId === event.runId && current.id === event.id
          return { ...all, [event.conversationId]: {
            runId: event.runId,
            id: event.id,
            turn: event.turn,
            step: event.step,
            time: sameStep ? current.time : event.time,
            content: `${sameStep ? current.content : ''}${event.delta}`,
          } }
        })
      return
    }
    if (event.eventType === 'agent/answer' || (event.eventType === 'tool/start' && !event.parentSessionId)) {
      setStreamingAnswerMap((all) => ({ ...all, [event.conversationId!]: undefined }))
    }
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
    element.scrollTo({ top: element.scrollHeight, behavior: running && !reduceConversationMotion ? 'smooth' : 'auto' })
  }, [state.messages.length, pendingPrompt, liveTrace?.items.length, Boolean(streamingAnswer?.content), running])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const menu of [dataMenuRef.current, skillMenuRef.current, teamMenuRef.current, capabilityMenuRef.current, permissionMenuRef.current, modelMenuRef.current]) {
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
          : await window.stable.preview.openFile(previewTarget.value, bounds)
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
    setPreviewWidth(0)
    setPreviewState({ url: target.kind === 'web' ? target.value : '', title: target.title, loading: true, canGoBack: false, canGoForward: false })
    previewRequestRef.current += 1
    setPreviewTarget({ ...target, requestId: previewRequestRef.current })
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

  function selectConversation(item: ConversationItem) {
    openConversation()
    if (item.id !== activeConversation.id) replaceConversation(() => window.stable.agent.select(item.id), '正在切换对话')
    else setSidebarOpen(false)
  }

  function configure(capability: AgentCapability, dataIds: string[]) {
    if (!activeConversation) return
    void action('正在保存对话设置', async () => updateAgent(await window.stable.agent.configure(activeConversation.id, capability, dataIds)))
  }

  function configurePermission(permissionMode: AgentPermissionMode) {
    if (!activeConversation) return
    void action('正在保存权限设置', async () => updateAgent(await window.stable.agent.configurePermission(activeConversation.id, permissionMode)))
  }

  function configureModel(modelId: string) {
    if (!activeConversation || modelId === activeConversation.modelId) {
      if (modelMenuRef.current) modelMenuRef.current.open = false
      return
    }
    const selected = state.models.items.find((item) => item.id === modelId)
    if (!selected) return
    const summary = modelMenuRef.current?.querySelector<HTMLElement>('summary')
    void action('正在切换对话模型', async () => {
      updateAgent(await window.stable.agent.configureModel(activeConversation.id, modelId))
      setModelStatus(`已切换至 ${selected.displayName}，从下一条消息生效。`)
      if (modelMenuRef.current) modelMenuRef.current.open = false
      window.requestAnimationFrame(() => summary?.focus())
    })
  }

  function commitRename(id: string) {
    const title = editingTitle.trim()
    setEditingId('')
    if (!title) return
    void action('正在重命名对话', async () => updateAgent(await window.stable.agent.rename(id, title)))
  }

  function togglePin(item: ConversationItem) {
    setConversationMenuId('')
    void action(item.pinned ? '正在取消置顶对话' : '正在置顶对话', async () => updateAgent(await window.stable.agent.pin(item.id, !item.pinned)))
  }

  function addAttachments(paths: string[]) {
    if (!paths.length) return
    void action('正在读取临时附件', async () => {
      const inspected = await window.stable.agent.inspectAttachments(paths)
      const merged = [...attachments]
      for (const item of inspected) if (!merged.some((existing) => existing.path === item.path)) merged.push(item)
      if (merged.length > 8) throw new Error('一次最多添加 8 个临时附件。')
      if (merged.filter(attachmentIsImage).reduce((sum, item) => sum + item.size, 0) > 10 * 1024 * 1024) throw new Error('本次图片总大小不能超过 10 MB。')
      setAttachments(merged)
      setAttachmentStatus(`已添加 ${inspected.length} 个附件。`)
    })
  }

  async function addPastedImages(files: File[]) {
    const saved: AgentAttachment[] = []
    setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' }))
    setAttachmentStatus('正在读取剪贴板图片。')
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
        const name = file.name && !/^image\.(?:png|jpe?g|webp)$/i.test(file.name) ? file.name : `粘贴截图-${Date.now()}-${index + 1}.${extension}`
        saved.push(await window.stable.agent.savePastedImage(state.activeConversationId, name, file.type, new Uint8Array(await file.arrayBuffer())))
      }
      const merged = [...attachments]
      for (const item of saved) if (!merged.some((existing) => existing.path === item.path)) merged.push(item)
      if (merged.length > 8) throw new Error('一次最多添加 8 个临时附件。')
      if (merged.filter(attachmentIsImage).reduce((sum, item) => sum + item.size, 0) > 10 * 1024 * 1024) throw new Error('本次图片总大小不能超过 10 MB。')
      setAttachments(merged)
      setAttachmentStatus(`已从剪贴板添加 ${saved.length} 张图片。`)
    } catch (error) {
      for (const item of saved) void window.stable.agent.discardDraftImage(item.path).catch(() => {})
      setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: errorMessage(error) }))
      setAttachmentStatus('剪贴板图片未添加。')
    }
  }

  function handlePromptPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && ['image/png', 'image/jpeg', 'image/webp'].includes(item.type))
      .map((item) => item.getAsFile()).filter((item): item is File => Boolean(item))
    if (!files.length) return
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    if (pastedText) {
      const start = event.currentTarget.selectionStart
      const end = event.currentTarget.selectionEnd
      setPrompt((current) => `${current.slice(0, start)}${pastedText}${current.slice(end)}`)
    }
    void addPastedImages(files)
  }

  function removeAttachment(item: AgentAttachment) {
    setAttachments((current) => current.filter((entry) => entry.path !== item.path))
    setAttachmentStatus(`已移除附件 ${item.name}。`)
    if (item.draft) void window.stable.agent.discardDraftImage(item.path).catch(() => {})
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

  function previewMessageAttachment(item: NonNullable<MessageItem['attachments']>[number]) {
    if (item.kind === 'attachment' && item.path) openConversationPreview({ kind: 'file', value: item.path, title: item.name })
  }

  function openImageViewer(items: ViewerImageItem[], index: number) {
    setImageViewer({ items, index })
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
    const menuOpen = conversationMenuId === item.id
    const activity = approvalUnread.has(item.id) && !(active && item.id === activeConversation.id) ? 'approval' : runningMap[item.id] ? 'running' : unread.has(item.id) ? 'unread' : undefined
    const activityLabel = activity === 'approval' ? '有待查看的审批请求' : activity === 'running' ? '任务执行中' : activity === 'unread' ? '已完成，未读' : ''
    return <article className="conversation-list-item" data-conversation-id={item.id} data-activity={activity} data-active={item.id === activeConversation.id || undefined} data-pinned={item.pinned || undefined} key={item.id}>
      <button className="conversation-pin-action" type="button" onClick={() => togglePin(item)} aria-label={item.pinned ? `取消置顶 ${item.title}` : `置顶 ${item.title}`}><span>{item.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}</span></button>
      {editingId === item.id
        ? <input className="conversation-title-input" autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => commitRename(item.id)} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(item.id); if (event.key === 'Escape') setEditingId('') }} aria-label="对话名称" />
        : <button className="conversation-select" type="button" onClick={() => selectConversation(item)}>
          <strong>{item.title}</strong>
          {activityLabel && <span className="sr-only">{activityLabel}</span>}
        </button>}
      {activity && <span className="conversation-activity" title={activityLabel} aria-hidden="true">
        {activity === 'running' ? <LoaderCircle className="spin" size={15} /> : <span className={activity === 'approval' ? 'conversation-approval-dot' : 'conversation-unread-dot'} />}
      </span>}
      <div className="conversation-item-actions" data-conversation-menu={item.id}>
        <button type="button" aria-label={`更多操作 ${item.title}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setConversationMenuId((current) => current === item.id ? '' : item.id)}><MoreVertical size={15} aria-hidden="true" /></button>
        {menuOpen && <div className="conversation-action-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => togglePin(item)}>{item.pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{item.pinned ? '取消置顶任务' : '置顶任务'}</span></button>
          <button type="button" role="menuitem" onClick={() => { setConversationMenuId(''); void action('正在打开资源管理器', async () => { await window.stable.agent.openWorkspace() }) }}><FolderOpen size={14} /><span>在资源管理器打开</span></button>
          <button type="button" role="menuitem" disabled aria-disabled="true"><ListTree size={14} /><span>文件管理</span><small>暂不可用</small></button>
          <button type="button" role="menuitem" disabled aria-disabled="true"><Share2 size={14} /><span>分享</span><small>暂不可用</small></button>
          <button type="button" role="menuitem" onClick={() => { setConversationMenuId(''); setEditingId(item.id); setEditingTitle(item.title) }}><Pencil size={14} /><span>重命名</span></button>
          <button className="danger" type="button" role="menuitem" disabled={Boolean(runningMap[item.id])} onClick={() => { setConversationMenuId(''); replaceConversation(() => window.stable.agent.remove(item.id), '正在删除对话') }}><Trash2 size={14} /><span>删除任务</span></button>
        </div>}
      </div>
    </article>
  }

  function ConversationTaskSections() {
    return <>
      {pinnedConversations.length > 0 && <section className="conversation-pinned" aria-label="置顶任务">
        <div className="conversation-section-head"><span>置顶</span><small>{pinnedConversations.length}</small></div>
        <div className="conversation-list">{pinnedConversations.map((item) => ConversationRow({ item }))}</div>
      </section>}
      <section className="conversation-history-card" aria-label="任务清单">
        <div className="conversation-section-head"><span>任务清单</span></div>
        <div className="conversation-list">
          {state.team.conversationOffers.map((offer) => <article className="team-offer-card" key={offer.id}>
            <div><small>来自 {offer.sourceDeviceName}</small><strong>{offer.title}</strong><span>{offer.messageCount} 条问答消息</span></div>
            <div><button type="button" onClick={() => decideConversation(offer.id, false)}>拒绝</button><button type="button" className="primary" onClick={() => decideConversation(offer.id, true)}>接收</button></div>
          </article>)}
          {state.conversations.filter((item) => !item.pinned).map((item) => ConversationRow({ item }))}
        </div>
      </section>
    </>
  }

  function send() {
    if (!prompt.trim() && !attachments.length && !selectedReferences.length) return
    if (deepSeekImageBlocked) {
      setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: 'DeepSeek 暂不支持图片分析，请切换其他模型。' }))
      window.requestAnimationFrame(() => promptRef.current?.focus())
      return
    }
    const conversationId = state.activeConversationId
    try {
      const pendingQueue = outbox.snapshot(conversationId)
      if (!pendingQueue.running && !pendingQueue.items.length) outbox.resume(conversationId)
      outbox.enqueue(conversationId, {
        prompt: prompt.trim() || '请读取并分析本次引用的资源与附件。',
        attachments: attachments.map((item) => ({ ...item })),
        references: selectedReferences.map((item) => ({ ...item })),
      })
      copyUndoRef.current[conversationId] = undefined
      setPrompt(''); setAttachments([]); setReferences([])
      setComposerErrorMap((current) => ({ ...current, [conversationId]: '' }))
      window.requestAnimationFrame(() => promptRef.current?.focus())
    } catch (error) {
      setComposerErrorMap((current) => ({ ...current, [conversationId]: errorMessage(error) }))
    }
  }

  async function runQueuedMessage(conversationId: string, entry: OutboxEntry<ComposerMessage>): Promise<OutboxResult> {
    cancelBeforeDispatchRef.current[conversationId] = false
    const { prompt: value, attachments: currentAttachments, references: currentReferences } = entry.payload
    const messageAttachments: NonNullable<MessageItem['attachments']> = [
      ...currentReferences.map(({ id, kind, name, size, type }) => ({ id, kind, name, size, type })),
      ...currentAttachments.map((item) => ({ kind: item.type === 'skill' ? 'skill' as const : 'attachment' as const, name: item.name, size: item.size, type: item.type, path: item.path })),
    ]
    setComposerErrorMap((current) => ({ ...current, [conversationId]: '' }))
    setPendingMap((current) => ({ ...current, [conversationId]: { content: value, attachments: messageAttachments } }))
    setTraceMap((current) => ({ ...current, [conversationId]: { runId: '', items: [], status: 'running', startedAt: Date.now() } }))
    setStreamingAnswerMap((current) => ({ ...current, [conversationId]: undefined }))
    setRunningMap((current) => ({ ...current, [conversationId]: true }))
    markRead(conversationId)
    let completed = false
    let terminalStatus: AgentTraceStatus = 'failed'
    let previousMessageIds: Set<string> | undefined
    let dispatched = false
    try {
      const before = await window.stable.agent.state(conversationId)
      previousMessageIds = new Set(before.messages.map((item) => item.id))
      const conversation = before.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error('找不到这个对话。')
      await window.stable.agent.configure(conversationId, conversation.capability, [])
      if (cancelBeforeDispatchRef.current[conversationId]) {
        terminalStatus = 'cancelled'
        return { accepted: false, continue: false, error: '已停止发送，消息仍保留在队列中。' }
      }
      dispatched = true
      const result = await window.stable.agent.run(conversationId, value, currentAttachments, currentReferences)
      updateAgentForConversation(result, conversationId)
      completed = true
      const lastAnswer = [...result.messages].reverse().find((item) => item.role === 'assistant')
      if (lastAnswer && !previousMessageIds.has(lastAnswer.id) && (!lastAnswer.trace?.length || savedTraceStatus(lastAnswer.trace) === 'completed')) markCompleted(conversationId)
      return { accepted: true, continue: !lastAnswer?.trace?.length || savedTraceStatus(lastAnswer.trace) === 'completed' }
    } catch (error) {
      let messageAccepted = dispatched
      try {
        const recovered = await window.stable.agent.state(conversationId)
        messageAccepted = Boolean(dispatched && previousMessageIds && recovered.messages.some((item) => item.role === 'user' && !previousMessageIds!.has(item.id)))
        updateAgentForConversation(recovered, conversationId)
      } catch { /* do not resend a possibly accepted message without a confirmed receipt */ }
      const detail = errorMessage(error)
      const feedback = taskErrorMessage(detail)
      if (!feedback) terminalStatus = 'cancelled'
      setComposerErrorMap((current) => ({ ...current, [conversationId]: feedback }))
      return { accepted: messageAccepted, continue: false, error: detail }
    } finally {
      setPendingMap((current) => ({ ...current, [conversationId]: undefined }))
      setTraceMap((current) => {
        const trace = current[conversationId]
        return { ...current, [conversationId]: completed || !trace ? undefined : { ...trace, status: trace.status === 'running' ? terminalStatus : trace.status, endedAt: trace.endedAt || Date.now() } }
      })
      setStreamingAnswerMap((current) => ({ ...current, [conversationId]: undefined }))
      setRunningMap((current) => ({ ...current, [conversationId]: false }))
    }
  }

  async function steerQueuedMessage(conversationId: string, entry: OutboxEntry<ComposerMessage>) {
    const result = await window.stable.agent.steer(conversationId, entry.id, entry.payload.prompt, entry.payload.attachments, entry.payload.references)
    updateAgentForConversation(result, conversationId)
  }

  function stopConversation() {
    cancelBeforeDispatchRef.current[activeConversation.id] = true
    outbox.pause(activeConversation.id)
    void window.stable.agent.cancel(activeConversation.id).catch((error) => setComposerErrorMap((current) => ({ ...current, [activeConversation.id]: taskErrorMessage(errorMessage(error)) })))
  }

  function updateAgentForConversation(result: AgentState, conversationId: string) {
    if (activeConversationIdRef.current === conversationId) updateAgent(result)
    else updateAgent({ ...result, activeConversationId: activeConversationIdRef.current, messages: stateRef.current.messages })
  }

  if (!activeConversation) return <section className="agent-layout reveal"><Empty icon={MessageSquareText} title="正在准备对话" detail="Stable 正在创建第一个独立任务。" /></section>

  return <section className="agent-layout reveal" data-sidebar-open={sidebarOpen || undefined}>
    {conversationTasksTarget && createPortal(ConversationTaskSections(), conversationTasksTarget)}
    <aside className="conversation-sidebar conversation-sidebar-mobile" aria-label="对话任务">
      {ConversationTaskSections()}
    </aside>
    <div className="conversation-workspace" data-preview-open={Boolean(previewTarget) || undefined} ref={conversationWorkspaceRef} style={previewTarget ? { '--preview-width': `${previewWidth || 320}px` } as CSSProperties : undefined}>
    <div className="conversation" data-empty={conversationIsEmpty || undefined}>
      <header className="conversation-topbar">
        <button className="conversation-sidebar-toggle" type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="打开对话列表"><PanelLeftOpen size={18} /></button>
        <div><span>当前任务</span><strong>{activeConversation.title}</strong></div>
        <ConversationWending key={state.activeConversationId} conversationId={state.activeConversationId} running={running} active={active} autoOpen={prefill === WENDING_CLI_PREFILL} />
      </header>
      <div className="message-scroll" ref={scrollRef}>
        <div className="conversation-stream">
          {conversationIsEmpty ? <div className="conversation-empty"><video className="conversation-start-animation" src={conversationStartAnimationUrl} autoPlay={!reduceConversationMotion} loop muted playsInline preload="auto" aria-hidden="true" /><h2>准备好了，随时开始</h2></div> : state.messages.map((message) => <MessageTurn message={message} workspace={state.paths.workspace} onCopy={message.role === 'user' ? () => void copyUserMessage(message) : undefined} onAutomationDecision={message.automationProposal?.status === 'pending' ? (accepted) => void action(accepted ? '正在创建定时任务' : '正在忽略定时任务', async () => { const result = await window.stable.automations.decideProposal(state.activeConversationId, message.id, accepted); updateAgent(result.agent); updateAutomations(result.automations) }) : undefined} onPreviewAttachment={previewMessageAttachment} onPreviewImages={openImageViewer} onPreviewLink={openConversationPreview} key={message.id} />)}
          {pendingPrompt && !state.messages.some((message) => message.role === 'user' && message.content === pendingPrompt.content) && <UserTurn content={pendingPrompt.content} attachments={pendingPrompt.attachments} onPreviewImages={openImageViewer} pending />}
          {liveTrace && <RunTrace items={liveTrace.items} status={liveTrace.status} active={running} startedAt={liveTrace.startedAt} endedAt={liveTrace.endedAt} streaming={running ? streamingAnswer : undefined} />}

        </div>
      </div>
      <div className="composer">
        {queue.items.length > 0 && <section className="message-queue" aria-label="待发送消息">
          <div className="queue-heading"><span role="status" aria-atomic="true">{queue.paused ? '排队已暂停' : '排队中'} · {queue.items.length} 条</span>
            {queue.paused && <button type="button" disabled={queueEdit?.conversationId === activeConversation.id} onClick={() => outbox.resume(activeConversation.id)}>继续队列</button>}
          </div>
          <div className="queue-items">{queue.items.map((item) => <div className="queue-item" key={item.id}>
            {queueEdit?.conversationId === activeConversation.id && queueEdit.id === item.id ? <div className="queue-edit">
              <textarea aria-label="编辑排队消息" value={queueEdit.text} autoFocus onChange={(event) => setQueueEdit({ ...queueEdit, text: event.target.value })} onKeyDown={(event) => { if (event.key === 'Escape') setQueueEdit(undefined) }} />
              <div><button type="button" disabled={!queueEdit.text.trim()} onClick={() => { outbox.edit(activeConversation.id, item.id, { ...item.payload, prompt: queueEdit.text.trim() }); setQueueEdit(undefined) }}>保存</button><button type="button" onClick={() => setQueueEdit(undefined)}>取消</button></div>
            </div> : <>
              <div className="queue-copy"><p>{item.payload.prompt}</p>
                {(item.payload.attachments.length > 0 || item.payload.references.length > 0) && <small>{[...item.payload.attachments, ...item.payload.references].map((resource) => resource.name).join(' · ')}</small>}
                {item.error && taskErrorMessage(errorMessage(item.error)) && <small className="queue-error" role="alert">{errorMessage(item.error)}</small>}
              </div>
              <div className="queue-actions">
                <button type="button" disabled={item.status === 'steering' || queue.items.some((entry) => entry.status === 'steering')} onClick={() => void outbox.steer(activeConversation.id, item.id)} title="立即补充到当前任务，不中断当前执行；下一模型步骤读取">
                  {item.status === 'steering' ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}{item.status === 'steering' ? '正在发送' : queue.running ? '调整方向' : '立即发送'}
                </button>
                <button type="button" disabled={item.status === 'steering'} aria-label="编辑这条排队消息" onClick={() => { outbox.pause(activeConversation.id); setQueueEdit({ conversationId: activeConversation.id, id: item.id, text: item.payload.prompt }) }}><Pencil size={14} aria-hidden="true" /></button>
                <button type="button" disabled={item.status === 'steering'} aria-label="删除这条排队消息" onClick={() => outbox.remove(activeConversation.id, item.id)}><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            </>}
          </div>)}</div>
        </section>}
        {pendingApproval ? <ApprovalComposer key={`${activeConversation.id}:${pendingApproval.id}`} item={pendingApproval} onDecision={(decision) => action('正在处理审批', async () => {
          const conversationId = activeConversation.id
          const item = pendingApproval
          const accepted = await window.stable.agent.answerApproval(conversationId, item.requestId!, decision)
          if (!accepted) throw new Error('此审批请求已结束，请等待任务状态更新。')
          markApproval(conversationId, `${liveTrace?.runId}:${item.id}`, false)
          setTraceMap((all) => ({ ...all, [conversationId]: all[conversationId] ? { ...all[conversationId]!, items: all[conversationId]!.items.map((entry) => entry.id === item.id ? { ...entry, title: decision === 'deny' ? '已拒绝本次操作' : decision === 'conversation' ? '此对话已允许该类操作' : '已允许本次操作', status: 'completed' } : entry) } : undefined }))
        })} /> : <DropTarget className="composer-drop-target" label="作为本次任务附件" onPaths={addAttachments}>
          <div className="composer-box">
            {imageAttachments.length > 0 && <div className="composer-image-selections" aria-label="待发送图片">
              {imageAttachments.map((item, index) => <div className="composer-image-selection" key={item.path}>
                <button className="composer-image-preview" type="button" onClick={() => openImageViewer(imageAttachments, index)} aria-label={`预览图片 ${item.name}`}><AttachmentImage item={item} /></button>
                <button className="composer-image-remove" type="button" onClick={() => removeAttachment(item)} aria-label={`移除图片 ${item.name}`}><X size={14} aria-hidden="true" /></button>
              </div>)}
            </div>}
            {(selectedReferences.length > 0 || documentAttachments.length > 0) && <div className="composer-selections" aria-label="本次引用的资源与文件">
              {selectedReferences.map((item) => <div className="selection-chip" data-kind={item.kind} key={`${item.kind}:${item.id}`} title={item.name}><ReferenceIcon kind={item.kind} /><strong>{item.name}</strong><button type="button" onClick={() => toggleReference(item)} aria-label={`移除引用 ${item.name}`}><X size={13} /></button></div>)}
              {documentAttachments.map((item) => <div className="selection-chip" data-kind={item.type === 'skill' ? 'skill' : 'attachment'} key={item.path} title={`${item.name} · ${formatBytes(item.size)}`}>{item.type === 'skill' ? <Braces size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}<strong>{item.name}</strong><button type="button" onClick={() => removeAttachment(item)} aria-label={`移除附件 ${item.name}`}><X size={13} /></button></div>)}
            </div>}
            {deepSeekImageBlocked && <div className="composer-warning" role="status"><CircleAlert size={16} aria-hidden="true" /><span>DeepSeek 暂不支持图片分析，请切换其他模型后发送。</span></div>}
            {composerError && <div className="composer-error" role="alert"><span>{composerError}</span><button type="button" onClick={() => setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' }))} aria-label="关闭发送错误"><X size={16} /></button></div>}
            <span className="sr-only" role="status" aria-live="polite">{attachmentStatus}</span>
            <label className="sr-only" htmlFor="agent-prompt">给 Stable 一个任务</label>
            <textarea ref={promptRef} id="agent-prompt" value={prompt} onPaste={handlePromptPaste} onChange={(event) => { setPrompt(event.target.value); if (composerError) setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' })) }} onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undoCopiedDraft()) { event.preventDefault(); return }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
            }} placeholder={running ? '继续输入，发送后将排队等待…' : '给 Stable 一个任务，或选择、拖入、粘贴图片与文件'} />
            <div className="composer-actions">
              <div className="composer-tools">
                <input ref={attachmentInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.yaml,.yml,.html,.log,.xml,.pdf,.docx,.xlsx,.xls,.zip" onChange={(event) => { const files = Array.from(event.target.files || []); addAttachments(files.map((file) => window.stable.files.path(file)).filter(Boolean)); event.target.value = '' }} />
                <button className="composer-tool" type="button" onClick={() => attachmentInputRef.current?.click()} aria-label="添加图片或文件"><Paperclip size={18} aria-hidden="true" /></button>
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
                  <summary className="composer-tool" aria-label={`选择引用资源${selectedReferences.filter((item) => item.kind !== 'skill').length ? `，已选择 ${selectedReferences.filter((item) => item.kind !== 'skill').length} 个` : ''}`}><Database size={18} aria-hidden="true" /></summary>
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
              <details className="composer-menu model-menu" ref={modelMenuRef}>
                <summary aria-label={`当前对话模型：${activeModel?.displayName || '尚未配置'}，打开模型选择`}><Box size={17} aria-hidden="true" /><span>{activeModel?.displayName || '配置模型'}</span><ChevronDown size={14} aria-hidden="true" /></summary>
                <div className="composer-popover model-popover" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); if (modelMenuRef.current) modelMenuRef.current.open = false; modelMenuRef.current?.querySelector<HTMLElement>('summary')?.focus() } }}>
                  <div className="composer-popover-head"><strong>选择模型</strong><span>当前对话 · 从下一条消息生效</span></div>
                  {state.models.items.length ? <fieldset className="model-options"><legend className="sr-only">当前对话使用的模型</legend>{state.models.items.map((item) => {
                    const selected = item.id === activeModel?.id
                    return <label className="model-option" data-active={selected || undefined} key={item.id}>
                      <input type="radio" name={`conversation-model-${activeConversation.id}`} value={item.id} checked={selected} onChange={() => configureModel(item.id)} />
                      <span className="model-option-mark" aria-hidden="true">{selected ? <Check size={15} /> : <span />}</span>
                      <span className="model-option-copy"><strong>{item.displayName}</strong><small>{item.providerId} · {item.model}{profileIsDeepSeek(item) ? ' · 不支持图片' : ' · 可发送图片'}</small></span>
                      {item.id === state.models.defaultModelId && <em>默认</em>}
                    </label>
                  })}</fieldset> : <p className="composer-menu-empty">还没有可用模型，请先在设置页添加。</p>}
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
              <button className={showComposerStop ? 'composer-stop' : 'composer-send'} type="button" onClick={showComposerStop ? stopConversation : send} disabled={!hasComposerContent && !running} aria-label={showComposerStop ? '停止执行' : (hasComposerContent && (running || queue.items.length) ? '加入排队' : '发送任务')} title={showComposerStop ? '停止执行' : (hasComposerContent ? (running ? '加入队列，当前任务结束后自动发送' : '发送任务') : '请输入内容或添加附件后发送')}>
                <span className="composer-action-visual" aria-hidden="true">
                  {showComposerStop ? <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor" /></svg> : <ArrowUp size={20} aria-hidden="true" />}
                </span>
              </button>
              <span className="sr-only" role="status" aria-live="polite">{modelStatus}</span>
            </div>
          </div>
        </DropTarget>}
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
    {imageViewer && <ImageLightbox items={imageViewer.items} index={imageViewer.index} onIndexChange={(index) => setImageViewer((current) => current ? { ...current, index } : current)} onClose={() => setImageViewer(undefined)} />}
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

function MessageTurn({ message, workspace, onCopy, onAutomationDecision, onPreviewAttachment, onPreviewImages, onPreviewLink }: { message: MessageItem; workspace: string; onCopy?: () => void; onAutomationDecision?: (accepted: boolean) => void; onPreviewAttachment?: (item: MessageAttachmentItem) => void; onPreviewImages?: (items: ViewerImageItem[], index: number) => void; onPreviewLink?: (target: Omit<ConversationPreviewTarget, 'requestId'>) => void }) {
  if (message.role === 'user') return <UserTurn content={message.content} attachments={message.attachments} onCopy={onCopy} onPreviewAttachment={onPreviewAttachment} onPreviewImages={onPreviewImages} />
  return <article className="assistant-turn">
    {message.trace?.length ? <RunTrace items={message.trace} status={savedTraceStatus(message.trace)} finalContent={message.content} /> : null}
    <div className="assistant-answer">
      <div className="assistant-mark" aria-hidden="true">S</div>
      <div className="answer-content"><div className="answer-label">Stable</div><MarkdownContent content={message.content} onPreview={onPreviewLink} /><ArtifactLinks content={message.content} workspace={workspace} onOpen={(item) => onPreviewLink?.({ kind: 'file', value: item.path, title: item.name })} /></div>
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

interface ConversationFileItem {
  name: string
  path: string
  detail: string
}

function ConversationFileCard({ item, onOpen }: { item: ConversationFileItem; onOpen: () => void }) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>()
  const [menuError, setMenuError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const isHtml = /\.html?$/i.test(item.path)

  useEffect(() => {
    if (!menuPosition) return
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuPosition(undefined) }
    const closeWithKeyboard = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setMenuPosition(undefined) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithKeyboard)
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeWithKeyboard) }
  }, [menuPosition])

  function openContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const width = 210
    const height = isHtml ? 92 : 50
    setMenuPosition({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) })
  }

  async function openInExternalBrowser() {
    setMenuPosition(undefined)
    setMenuError('')
    try { await window.stable.system.openExternalHtml(item.path) }
    catch (reason) { setMenuError(errorMessage(reason)) }
  }

  return <div className="conversation-file-card-shell">
    <button className="conversation-file-card" type="button" onClick={onOpen} onContextMenu={openContextMenu} title={item.path} aria-label={`在 Stable 内置浏览器预览 ${item.name}`} aria-haspopup="menu">
      <span className="conversation-file-icon"><FileText size={18} aria-hidden="true" /></span>
      <span className="conversation-file-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
    {menuPosition && <div className="conversation-file-menu" role="menu" aria-label={`${item.name} 附件操作`} ref={menuRef} style={{ left: menuPosition.x, top: menuPosition.y }}>
      <button type="button" role="menuitem" onClick={() => { setMenuPosition(undefined); void window.stable.system.showItemInFolder(item.path) }}><FolderOpen size={14} aria-hidden="true" /><span>打开文件所在位置</span></button>
      {isHtml && <button type="button" role="menuitem" onClick={() => void openInExternalBrowser()}><ExternalLink size={14} aria-hidden="true" /><span>用外部浏览器打开</span></button>}
    </div>}
    {menuError && <span className="conversation-file-error" role="alert">{menuError}</span>}
  </div>
}

function useAttachmentImageSource(item: { path?: string; previewUrl?: string }) {
  const [source, setSource] = useState(item.previewUrl || '')
  useEffect(() => {
    if (item.previewUrl) { setSource(item.previewUrl); return }
    if (!item.path) { setSource(''); return }
    let cancelled = false
    void window.stable.agent.imagePreview(item.path).then((value) => { if (!cancelled) setSource(value) }).catch(() => { if (!cancelled) setSource('') })
    return () => { cancelled = true }
  }, [item.path, item.previewUrl])
  return source
}

function AttachmentImage({ item }: { item: { name: string; path?: string; previewUrl?: string } }) {
  const source = useAttachmentImageSource(item)
  return source
    ? <img className="attachment-thumbnail" src={source} alt="" aria-hidden="true" />
    : <span className="attachment-thumbnail attachment-thumbnail-placeholder" aria-hidden="true"><ImageIcon size={18} /></span>
}

function ImageLightbox({ items, index, onIndexChange, onClose }: { items: ViewerImageItem[]; index: number; onIndexChange: (index: number) => void; onClose: () => void }) {
  const item = items[index]
  const source = useAttachmentImageSource(item || {})
  const [zoom, setZoom] = useState(1)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [downloadStatus, setDownloadStatus] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); previousFocus?.focus() }
  }, [])

  useEffect(() => { setZoom(1); setNaturalSize({ width: 0, height: 0 }); setDownloadStatus('') }, [index])

  function changeZoom(delta: number) {
    setZoom((value) => Math.max(0.25, Math.min(4, Math.round((value + delta) * 100) / 100)))
  }

  function navigate(delta: number) {
    if (items.length < 2) return
    onIndexChange((index + delta + items.length) % items.length)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); return }
    if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); return }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.25); return }
    if (event.key === '-') { event.preventDefault(); changeZoom(-0.25); return }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function downloadImage() {
    if (!item?.path) return
    setDownloadStatus('正在选择保存位置')
    try {
      const result = await window.stable.agent.saveImageAs(item.path)
      setDownloadStatus(result.canceled ? '' : `已下载到 ${result.path}`)
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : '图片下载失败')
    }
  }

  const availableWidth = Math.max(120, viewport.width - 128)
  const availableHeight = Math.max(120, viewport.height - 176)
  const fitScale = naturalSize.width && naturalSize.height ? Math.min(1, availableWidth / naturalSize.width, availableHeight / naturalSize.height) : 1
  const imageStyle = naturalSize.width && naturalSize.height ? { width: `${Math.round(naturalSize.width * fitScale * zoom)}px`, height: `${Math.round(naturalSize.height * fitScale * zoom)}px` } : undefined

  return <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`图片预览 ${item?.name || ''}`} ref={dialogRef} onKeyDown={handleKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="image-lightbox-toolbar">
      <button className="image-lightbox-button" type="button" onClick={() => void downloadImage()} disabled={!item?.path} aria-label="下载图片到本地"><Download size={20} aria-hidden="true" /></button>
      <button className="image-lightbox-button" type="button" onClick={onClose} aria-label="关闭图片预览" ref={closeRef}><X size={22} aria-hidden="true" /></button>
    </div>
    {items.length > 1 && <button className="image-lightbox-nav image-lightbox-prev" type="button" onClick={() => navigate(-1)} aria-label="上一张图片"><ArrowLeft size={24} aria-hidden="true" /></button>}
    <div className="image-lightbox-stage">
      {source
        ? <img src={source} alt={item?.name || '预览图片'} draggable={false} style={imageStyle} onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
        : <div className="image-lightbox-loading"><LoaderCircle className="spin" size={28} /><span>正在加载图片</span></div>}
    </div>
    {items.length > 1 && <button className="image-lightbox-nav image-lightbox-next" type="button" onClick={() => navigate(1)} aria-label="下一张图片"><ArrowRight size={24} aria-hidden="true" /></button>}
    <div className="image-lightbox-zoom" aria-label="图片缩放控制">
      <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 0.25} aria-label="缩小图片"><Minus size={20} aria-hidden="true" /></button>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 4} aria-label="放大图片"><Plus size={20} aria-hidden="true" /></button>
    </div>
    <span className="sr-only" role="status" aria-live="polite">{downloadStatus}</span>
  </div>
}

function localArtifactPaths(content: string, workspace: string) {
  const root = workspace.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLocaleLowerCase()
  const pattern = /(?:file:\/\/\/)?([a-z]:[\\/][^\r\n<>|"?*]*?\.[a-z0-9]{1,15})(?=$|[\s`)\]}，。；、])/gi
  const matches = new Map<string, { name: string; path: string }>()
  for (const match of content.matchAll(pattern)) {
    let filePath = match[1].replace(/\//g, '\\')
    try { filePath = decodeURIComponent(filePath) } catch {}
    const normalized = filePath.toLocaleLowerCase()
    if (!normalized.startsWith(`${root}\\`)) continue
    matches.set(normalized, { name: filePath.split('\\').pop() || filePath, path: filePath })
  }
  return [...matches.values()]
}

function ArtifactLinks({ content, workspace, onOpen }: { content: string; workspace: string; onOpen: (item: { name: string; path: string }) => void }) {
  const artifacts = localArtifactPaths(content, workspace)
  if (!artifacts.length) return null
  return <div className="conversation-file-list artifact-links" aria-label="交付文件">
    {artifacts.map((item) => <ConversationFileCard item={{ ...item, detail: '生成文件 · 侧栏预览' }} onOpen={() => onOpen(item)} key={item.path} />)}
  </div>
}

function formatAutomationSchedule(schedule: AutomationSchedule) {
  if (schedule.type === 'once') return `${schedule.date} ${schedule.time}`
  if (schedule.type === 'daily') return `每天 ${schedule.time}`
  if (schedule.type === 'weekly') return `每周 ${schedule.weekdays.map((day) => '日一二三四五六'[day]).join('、')} ${schedule.time}`
  return `每月 ${schedule.day} 日 ${schedule.time}`
}

function UserTurn({ content, attachments = [], pending = false, onCopy, onPreviewAttachment, onPreviewImages }: { content: string; attachments?: MessageItem['attachments']; pending?: boolean; onCopy?: () => void; onPreviewAttachment?: (item: MessageAttachmentItem) => void; onPreviewImages?: (items: ViewerImageItem[], index: number) => void }) {
  const uploadedFiles = attachments.filter((item) => item.kind === 'attachment' && item.path)
  const imageFiles = uploadedFiles.filter(attachmentIsImage)
  const documentFiles = uploadedFiles.filter((item) => !imageFiles.includes(item))
  const staticAttachments = attachments.filter((item) => !uploadedFiles.includes(item))
  return <article className="user-turn" data-pending={pending || undefined}>
    <div className="user-turn-stack">
      {imageFiles.length > 0 && <div className="message-image-gallery" aria-label="随消息上传的图片">
        {imageFiles.map((item, index) => onPreviewImages
          ? <button className="message-image" type="button" onClick={() => onPreviewImages(imageFiles, index)} aria-label={`预览图片 ${item.name}`} key={`${item.path}-${index}`}><AttachmentImage item={item} /></button>
          : <span className="message-image" key={`${item.path}-${index}`}><AttachmentImage item={item} /></span>)}
      </div>}
      <div className="user-bubble"><div className="turn-label">你</div>{content && <p>{content}</p>}
      {documentFiles.length > 0 && <div className="conversation-file-list message-file-cards" aria-label="随消息上传的文件">
        {documentFiles.map((item, index) => <ConversationFileCard item={{ name: item.name, path: item.path!, detail: `上传附件 · ${item.type.toUpperCase()} · ${formatBytes(item.size)}` }} onOpen={() => onPreviewAttachment?.(item)} key={`${item.path}-${index}`} />)}
      </div>}
      {staticAttachments.length > 0 && <div className="message-attachments" aria-label="随消息发送的引用">
        {staticAttachments.map((item, index) => <div className="selection-chip" data-kind={item.kind} key={`${item.kind}-${item.name}-${index}`} title={`${item.name} · ${formatBytes(item.size)}`}>{item.kind === 'attachment' ? <FileText size={14} aria-hidden="true" /> : <ReferenceIcon kind={item.kind} />}<strong>{item.name}</strong></div>)}
      </div>}
      {onCopy && <div className="user-turn-actions"><button type="button" onClick={onCopy} aria-label="复制这条消息到主输入框"><Copy size={15} aria-hidden="true" /></button></div>}
      </div>
    </div>
  </article>
}

function TraceText({ content, live = false }: { content: string; live?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const textId = useId()
  useEffect(() => {
    const element = textRef.current
    if (!element) return
    const measure = () => setOverflow(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 2 + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [content])
  return <div className="trace-text" data-live={live || undefined}>
    <div ref={textRef} id={textId} className="trace-text-content" data-expanded={expanded}>{renderInline(content, textId)}</div>
    {(overflow || expanded) && <button type="button" className="trace-text-toggle" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起摘要' : '展开摘要'}</button>}
  </div>
}

function TraceAction({ item, status, agentName }: { item: AgentTraceItem; status: AgentTraceStatus; agentName?: string }) {
  const itemStatus = traceItemStatus(item, status)
  const statusLabel = item.status === 'running' && status !== 'running'
    ? (status === 'cancelled' ? '已取消' : '已结束')
    : itemStatus === 'running' ? '运行中' : itemStatus === 'completed' ? '已完成' : itemStatus === 'cancelled' ? '已取消' : '执行失败'
  const Icon = item.entity === 'agent' ? Bot : item.kind === 'approval' ? ShieldCheck : item.kind === 'tool' ? Wrench : CircleAlert
  return <details className="trace-action" data-status={itemStatus}>
    <summary>
      <Icon size={15} aria-hidden="true" />
      <span>{agentName && item.entity !== 'agent' ? `${agentName} · ` : ''}{traceActionLabel(item)}</span>
      <span className="trace-action-state">{itemStatus === 'running' && <LoaderCircle className="spin" size={13} aria-hidden="true" />}{statusLabel}</span>
      <ChevronRight className="trace-chevron" size={15} aria-hidden="true" />
    </summary>
    <div className="trace-action-detail">
      {item.inputDetail && <pre>{item.inputDetail}</pre>}
      {item.detail && item.detail !== item.inputDetail && <pre>{item.detail}</pre>}
      {!item.detail && !item.inputDetail && <p>{statusLabel}，没有更多详情。</p>}
    </div>
  </details>
}

function RunTrace({ items, status, active = false, startedAt, endedAt, streaming, finalContent }: { items: AgentTraceItem[]; status: AgentTraceStatus; active?: boolean; startedAt?: number; endedAt?: number; streaming?: { id: string; time: number; content: string }; finalContent?: string }) {
  const [expanded, setExpanded] = useState(active)
  const timelineId = useId()
  const firstEventAt = useMemo(() => items.length ? Math.min(...items.map((item) => item.startedAt ?? item.time)) : Date.now(), [items])
  const lastEventAt = useMemo(() => items.length ? Math.max(...items.map((item) => item.time)) : Date.now(), [items])
  const timerStartedAt = startedAt ?? firstEventAt
  const timerEndedAt = endedAt ?? (status === 'running' ? undefined : lastEventAt)
  const [now, setNow] = useState(() => Date.now())
  const timeline = useMemo(() => {
    const entries = streaming?.content && !items.some((item) => item.id === streaming.id)
      ? [...items, { id: streaming.id, runId: '', kind: 'reasoning' as const, eventType: 'agent/answer' as const, title: '', status: 'running' as const, time: streaming.time, content: streaming.content }]
      : items
    return buildTraceTimeline(entries, finalContent)
  }, [items, streaming, finalContent])
  const agentNames = new Map(items.filter((item) => item.entity === 'agent' && item.sessionId).map((item) => [item.sessionId, item.title]))
  useEffect(() => {
    if (active && status === 'running') { setExpanded(true); return }
    if (status !== 'running') setExpanded(false)
  }, [active, status])
  useEffect(() => {
    setNow(Date.now())
    if (status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status, timerStartedAt])
  const elapsed = formatElapsedTime(Math.max(0, (timerEndedAt ?? now) - timerStartedAt))
  return <section className="run-trace" data-status={status}>
    <button className="trace-summary" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={timelineId} aria-label={`执行记录，${expanded ? '已展开' : '已折叠'}`}>
      {status === 'running' && <LoaderCircle className="spin" size={14} aria-hidden="true" />}
      <span className="trace-elapsed" role="timer" aria-label={`执行时长 ${elapsed}`}>{status === 'running' ? '思考中 · ' : '用时 '}{elapsed}</span>
      {status !== 'running' && status !== 'completed' && <span className="trace-run-state">{status === 'failed' ? '任务受阻' : '已取消'}</span>}
      <ChevronRight className="trace-chevron" data-open={expanded} size={15} aria-hidden="true" />
    </button>
    {expanded && <div className="trace-timeline" id={timelineId}>
      {timeline.map((item) => item.eventType === 'agent/answer'
        ? <TraceText key={item.id} content={item.content!} live={item.id === streaming?.id} />
        : <TraceAction key={item.id} item={item} status={status} agentName={item.parentSessionId ? agentNames.get(item.sessionId) || '子 Agent' : undefined} />)}
      {!timeline.length && <p className="trace-waiting">{status === 'running' ? '正在准备任务…' : '本次任务没有额外执行记录。'}</p>}
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
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/[^)\s]+|[A-Za-z]:[\\/][^)\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15})\)|https?:\/\/[^\s<]+|[A-Za-z]:[\\/][^\r\n<>|"?*]+?\.[A-Za-z0-9]{1,15}(?=$|[\s`)\]}，。；、]))/gi
  return text.split(token).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/)
    if (link && /^https?:\/\//i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <a href={link[2]} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{link[1]}</a>
    if (link && /^[A-Za-z]:[\\/].*\.[A-Za-z0-9]{1,15}$/i.test(link[2])) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'file', value: link[2], title: link[1] })} key={`${keyPrefix}-${index}`}>{link[1]}</button>
      : <Fragment key={`${keyPrefix}-${index}`}>{link[1]}</Fragment>
    if (/^https?:\/\//i.test(part)) return onPreview
      ? <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'web', value: part, title: new URL(part).hostname })} key={`${keyPrefix}-${index}`}>{part}</button>
      : <a href={part} target="_blank" rel="noreferrer" key={`${keyPrefix}-${index}`}>{part}</a>
    if (/^[A-Za-z]:[\\/].*\.[A-Za-z0-9]{1,15}$/i.test(part) && onPreview) return <button className="markdown-preview-link" type="button" onClick={() => onPreview({ kind: 'file', value: part, title: part.split(/[/\\]/).pop() || '文件' })} key={`${keyPrefix}-${index}`}>{part}</button>
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
  })
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

function PageLead({ title, copy, action, headingId }: { title: string; copy: string; action: React.ReactNode; headingId?: string }) {
  return <div className="page-lead"><div><h2 id={headingId}>{title}</h2><p>{copy}</p></div>{action}</div>
}

function ResourceRow({ title, detail, enabled, onToggle, onRemove }: { title: string; detail: string; enabled: boolean; onToggle: (enabled: boolean) => void; onRemove: () => void }) {
  return <article className="resource-row">
    <div className="resource-main"><strong>{title}</strong><span>{detail}</span></div>
    <label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} /><span aria-hidden="true" /><em>{enabled ? '已启用' : '未启用'}</em></label>
    <button className="icon-button" onClick={onRemove} aria-label={`移出 ${title}`}><Trash2 size={17} /></button>
  </article>
}

type AccountModuleId = 'appearance' | 'account' | 'updates' | 'agent-history'

const ACCOUNT_MODULES: Array<{ id: AccountModuleId; label: string; detail: string; icon: typeof Home }> = [
  { id: 'appearance', label: '主题设置', detail: '深色或浅色界面', icon: Sun },
  { id: 'account', label: '账号情况', detail: '身份、额度与用量', icon: ShieldCheck },
  { id: 'updates', label: '软件更新', detail: '版本与安装状态', icon: RotateCw },
  { id: 'agent-history', label: 'Agent 对话记录', detail: '全局对话提醒', icon: MessageSquareText },
]

function AccountDock({ state, replaceState, updateTheme, action }: { state: BootstrapData; replaceState: (state: BootstrapData) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [activeModule, setActiveModule] = useState<AccountModuleId | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const account = state.cloud.account
  const displayName = account?.displayName || 'Stable 用户'
  const avatar = displayName.trim().slice(0, 1).toUpperCase() || 'S'
  const selected = ACCOUNT_MODULES.find((item) => item.id === activeModule)
  const updateReady = ['available', 'downloading', 'downloaded'].includes(state.update.status)

  useEffect(() => {
    if (!open) return
    const closeFromOutside = (event: globalThis.PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setActiveModule(null)
      }
    }
    const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (activeModule) setActiveModule(null)
      else {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeFromOutside)
    window.addEventListener('keydown', closeFromKeyboard)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      window.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [activeModule, open])

  function toggleMenu() {
    setOpen((current) => {
      if (current) setActiveModule(null)
      return !current
    })
  }

  return <div className="rail-account-dock" ref={dockRef}>
    {open && <section className="account-menu-popover" id="account-menu-popover" aria-label="账号与设置菜单">
      <div className="account-menu-identity">
        <span className="account-avatar" aria-hidden="true">{avatar}</span>
        <span><strong>{displayName}</strong><small>{account ? `@${account.username}` : '本地开发模式'}</small></span>
      </div>
      <nav aria-label="账号设置模块">
        {ACCOUNT_MODULES.map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" data-active={activeModule === id || undefined} data-update-ready={id === 'updates' && updateReady || undefined} aria-pressed={activeModule === id} onClick={() => setActiveModule(id)}>
          <Icon size={17} aria-hidden="true" />
          <span><strong>{label}</strong><small>{detail}</small></span>
          {id === 'updates' && updateReady && <i className="update-dot" aria-label="发现可用更新" />}
          <ChevronRight size={15} aria-hidden="true" />
        </button>)}
      </nav>
      <div className="rail-version" aria-label={`Stable 版本 ${state.appVersion}`}>Stable v{state.appVersion}</div>
    </section>}

    {open && selected && <section className="account-content-popover" role="dialog" aria-labelledby="account-module-title">
      <header>
        <span><strong id="account-module-title">{selected.label}</strong><small>{selected.detail}</small></span>
        <button type="button" className="icon-button" onClick={() => setActiveModule(null)} aria-label={`关闭${selected.label}`}><X size={17} aria-hidden="true" /></button>
      </header>
      <div className="account-content-body">
        <AccountModuleContent module={selected.id} state={state} replaceState={replaceState} updateTheme={updateTheme} action={action} />
      </div>
    </section>}

    <button ref={triggerRef} className="rail-account-trigger" type="button" aria-label={`打开${displayName}的账号菜单${updateReady ? '，发现可用更新' : ''}`} aria-expanded={open} aria-controls="account-menu-popover" onClick={toggleMenu}>
      <span className="account-avatar" aria-hidden="true">{avatar}</span>
      <span className="rail-account-name">{displayName}</span>
      {updateReady && <i className="update-dot" aria-label="发现可用更新" />}
    </button>
  </div>
}

function AccountModuleContent({ module, state, replaceState, updateTheme, action }: { module: AccountModuleId; state: BootstrapData; replaceState: (state: BootstrapData) => void; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  if (module === 'appearance') return <ThemeSettingsModule state={state} updateTheme={updateTheme} action={action} />
  if (module === 'account') return <CloudAccountModule state={state} replaceState={replaceState} action={action} />
  if (module === 'updates') return <UpdateSettingsModule state={state} action={action} />
  return <AgentHistoryModule state={state} action={action} />
}

function ThemeSettingsModule({ state, updateTheme, action }: { state: BootstrapData; updateTheme: (theme: ThemeMode) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  function setTheme(theme: ThemeMode) {
    void action('正在切换主题', async () => {
      const saved = await window.stable.appearance.setTheme(theme)
      document.documentElement.dataset.theme = saved
      updateTheme(saved)
    })
  }
  return <div className="theme-options account-theme-options">
    {([
      { id: 'dark' as const, label: '黑色', detail: '深色背景，适合长时间工作', icon: Moon },
      { id: 'light' as const, label: '白色', detail: '暖白背景，适合长时间查看', icon: Sun },
    ]).map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" className="theme-option" data-active={state.theme === id || undefined} aria-pressed={state.theme === id} onClick={() => setTheme(id)}>
      <span className="theme-sample" data-preview={id} aria-hidden="true"><span /><span /></span>
      <span className="theme-option-copy"><span><Icon size={17} aria-hidden="true" />{label}</span><small>{detail}</small></span>
      {state.theme === id && <Check className="theme-selected" size={17} aria-hidden="true" />}
    </button>)}
  </div>
}

function formatCloudMoney(micros: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(micros || 0) / 1_000_000)
}

function CloudAccountModule({ state, replaceState, action }: { state: BootstrapData; replaceState: (state: BootstrapData) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const account = state.cloud.account
  const quota = state.cloud.quota
  const usage = state.cloud.usage?.totals
  if (!account) return <div className="account-module-empty"><Shield size={22} aria-hidden="true" /><strong>当前未连接云端账号</strong><span>本地开发模式不会显示账号额度与云端用量。</span></div>
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
      : update.status === 'available' ? `发现新版本 v${update.availableVersion}，等待下载`
        : update.status === 'downloading' ? `正在下载 ${update.progress}%`
          : update.status === 'downloaded' ? `v${update.availableVersion} 已下载，等待安装`
            : update.status === 'installing' ? `正在打开 v${update.availableVersion} 安装进度窗口`
              : update.status === 'error' ? update.error : '启动时自动检查更新，不会自动下载'
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
    <p>Stable 启动时只检查新版本；只有你点击“下载更新”后才会下载，安装继续使用现有独立进度窗口。</p>
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

function Empty({ icon: Icon, title, detail }: { icon: typeof Database; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={26} strokeWidth={1.5} /><h2>{title}</h2><p>{detail}</p></div>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
