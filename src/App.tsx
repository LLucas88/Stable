import { useFileContextMenu } from './components/FileContextMenu'
import { ConversationActivity } from './ConversationActivity'
import { DesignControls, DesignMessageParameters, DEFAULT_DESIGN } from './DesignControls'
import type { DesignRequest } from './types'
import './styles/design-activity.css'
import { cloudAccessHint } from './settings/CloudAccessSettings'
import { errorMessage, formatBytes, formatAutomationSchedule } from './shared/format'
import { type ConversationPreviewTarget } from './shared/conversation-preview'
import { DropTarget, Empty } from './components/ResourcePrimitives'
import { MarkdownContent, renderInline } from './components/MarkdownContent'
import { DataPage } from './pages/DataPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { SkillsPage } from './pages/SkillsPage'
import { SkillQuickPicker } from './components/SkillQuickPicker'
import { AutomationsPage } from './pages/AutomationsPage'
import './styles/sidebar-layout.css'
import { ContextUsageButton } from './ContextUsageButton'
import { TemplateLibrary } from './TemplateLibrary'
import { type AccountModuleId, AccountDock, SettingsNavigation, SettingsContent, UpdateProgressButton } from './settings/SettingsWorkspace'

import { ImportedConversationContinuation } from './imports/DataImport'
import { EffortSlider } from './EffortSlider'
import { ModelProviderIcon } from './ModelProviderIcon'
import { CloseWindowDialog } from './CloseWindowDialog'
import { useTransientScrollbar } from './use-transient-scrollbar'
import { SidebarActionMenu } from './SidebarActionMenu'
import { RemoveDialog } from './RemoveDialog'
import { ProjectSelector } from './ProjectSelector'
import { BrowserPanel } from './BrowserPanel'
import { SkillMarket } from './SkillMarket'
import { RenameConversationDialog } from './RenameConversationDialog'
import { AnswerToolbar } from './AnswerTools'
import { ConversationTools } from './ConversationTools'

import type { AnswerChapter } from './types'
import { useConversationScroll } from './use-conversation-scroll'
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Palette, Globe, Gift, ArrowLeft, ArrowRight, ArrowUp, AtSign, BookOpenText, Bot, Box, Braces, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, Copy, Database, Download, ExternalLink, FilePlus2, FileText, FileSpreadsheet, FlaskConical, FolderInput, FolderClosed, FolderOpen, Home, Library, ListTree, Image as ImageIcon, Laptop2, LoaderCircle, MessageSquareText, Minus, MoreHorizontal, SquarePen, Network, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Pin, PinOff, Plus, Share2, Shield, ShieldCheck, ShieldAlert, TriangleAlert, Info, Sparkles, Trash2, Search, UsersRound, Wifi, Workflow, Wrench, Terminal, X } from 'lucide-react'
import logoUrl from '../build/stable_logo_transparent.png'
import launchLogoUrl from '../build/stable_launch_logo.png'
import conversationStartAnimationUrl from './assets/bloub-2.mp4'
import { ReportPage } from './ReportPage'
import { WorkflowStudio } from './WorkflowStudio'
import { formatElapsedTime } from './duration'
import { buildTraceTimeline, groupTraceTimeline, traceGroupLabel, savedTraceStatus, traceCommand, traceItemStatus, traceToolInput, traceToolIcon, latestTraceTool } from './trace-timeline'
import { MessageOutbox, type OutboxEntry, type OutboxResult } from './message-outbox'
import { readComposerValue, writeComposerValue, useComposerValue } from './composer-storage'
import { taskErrorMessage } from './task-feedback'
import { ClarificationCard } from './ClarificationCard'
import { clarificationDisplay, clarificationPendingContent, isClarificationQuestion } from './clarification-display'
import { clarificationContinuation, groupConversationTurns, conversationTurnTrace, type LiveConversationTurn } from './conversation-turns'
import { ApprovalComposer } from './ApprovalComposer'
import { useComposerAutosize } from './use-composer-autosize'
import { useMessagePrediction } from './use-message-prediction'
import { useConversationUnread } from './use-conversation-unread'
import type { ClarificationResponse, AgentAttachment, AgentCapability, AgentPermissionMode, AgentReference, AgentReferenceKind, AgentState, AgentTraceItem, AgentTraceStatus, AutomationState, BootstrapData, ConversationItem, ConversationSearchResult, MessageItem, Page, TeamState, WendingCliStatus } from './types'

type WorkspaceMode = 'work' | 'lab' | 'design'
type ComposerMessage = { design?: DesignRequest; prompt: string; attachments: AgentAttachment[]; references: AgentReference[]; clarificationResponse?: ClarificationResponse }
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
  { id: 'market', label: '技能市场', icon: Braces },
  { id: 'templates', label: '模板库', icon: BookOpenText },
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

function attachmentIsImage(item: { name?: string; path?: string; type?: string; mediaType?: string }) {
  if (String(item.mediaType || '').startsWith('image/')) return true
  return /\.(?:png|jpe?g|webp)$/i.test(String(item.path || item.name || '')) || /^(?:png|jpe?g|webp)$/i.test(String(item.type || ''))
}

export function App() {
  const requestedPage = new URLSearchParams(window.location.search).get('page') as Page | null
  const initialPage = requestedPage && PAGE_IDS.includes(requestedPage) ? requestedPage : 'agent'
  const [page, setPage] = useState<Page>(initialPage)
  const [settingsModule, setSettingsModule] = useState<AccountModuleId | null>(null)
  useEffect(() => window.stable.agent.onTaskOpen?.(agent => {setState(current=>current?{...current,...agent}:current);setSettingsModule(null);setPage('agent');setMode('work')}), [])

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
  const composerDraftIds = useRef<string[]>([])
  const [activityView, setActivityView] = useState(false)
  const [activityCount, setActivityCount] = useState(0)
  const [conversationTasksTarget, setConversationTasksTarget] = useState<HTMLDivElement | null>(null)
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [conversationSearchResults, setConversationSearchResults] = useState<ConversationSearchResult[]>([])
  const [conversationSearchLoading, setConversationSearchLoading] = useState(false)
  const [searchHasMore,setSearchHasMore]=useState(false)
  const searchQueryRef=useRef(conversationSearchQuery);searchQueryRef.current=conversationSearchQuery
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

  useEffect(() => {
    if (state?.cloud.status !== 'checking') return
    let cancelled = false
    void window.stable.cloud.startup().then(value => {
      if (!cancelled) setState(value)
    }).catch(reason => {
      if (!cancelled) setState(current => current ? { ...current, cloud: { ...current.cloud, status: 'unavailable', error: errorMessage(reason) } } : current)
    })
    return () => { cancelled = true }
  }, [state?.cloud.status])

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
        if (!cancelled) {setConversationSearchResults(results);setSearchHasMore(results.length===30)}
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

  async function openDesign() {
    if (creatingConversationRef.current) return
    creatingConversationRef.current = true
    setSettingsModule(null); setMode('design'); setPage('agent')
    await action('正在打开 Design', async () => {
      try {
        const previous = state?.conversations.find(item => item.design && !item.archivedAt)
        const agent = previous ? await window.stable.agent.select(previous.id) : await window.stable.agent.create(DEFAULT_DESIGN)
        setState(current => current ? { ...current, ...agent } : current)
      } finally { creatingConversationRef.current = false }
    })
  }

  useEffect(() => {
    if (page === 'agent' && state) setMode(state.conversations.find(item=>item.id===state.activeConversationId)?.design ? 'design' : 'work')
  }, [state?.activeConversationId, page])

  function selectMode(next: WorkspaceMode) {
    setSettingsModule(null)
    setMode(next)
    setPage(next === 'work' ? 'agent' : 'workflows')
    if (next === 'work' && state?.conversations.find(item=>item.id===state.activeConversationId)?.design) {
      void action('正在打开对话', async () => {
        const previous = state.conversations.find(item=>!item.design && !item.archivedAt)
        const agent = previous ? await window.stable.agent.select(previous.id) : await window.stable.agent.create()
        setState(current=>current?{...current,...agent}:current)
      })
    }
  }

  function navigate(id: PrimaryNavId, design?: DesignRequest) {
    setSettingsModule(null)
    if (settingsModule && id === 'agent') { setPage('agent'); return }
    if (id === 'agent') {
      if (creatingConversationRef.current) return
      creatingConversationRef.current = true
      void action('正在新建对话', async () => {
        try {
          const draftId = composerDraftIds.current.find(id => state?.conversations.some(item => item.id === id && Boolean(item.design) === Boolean(design) && !item.messageCount && !item.archivedAt))
          const agent = draftId ? await window.stable.agent.select(draftId) : await window.stable.agent.create(design)
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
    setSettingsModule(null)
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

  return (
    <><div className="window-shell">
      <WindowTitlebar railCollapsed={railCollapsed} searchOpen={conversationSearchOpen} searchButtonRef={conversationSearchButtonRef} onToggleRail={() => setRailCollapsed((current) => !current)} onSearch={openConversationSearch} />
      <div className="app-shell" data-rail-collapsed={railCollapsed || undefined} style={{ '--rail-width': `${railCollapsed ? 0 : railWidth}px` } as CSSProperties}>
      {!railCollapsed && <aside className="side-rail" id="stable-main-navigation" aria-label="主导航">
        <div className="rail-icon-dock">
        <nav className="rail-nav" aria-label={mode === 'lab' ? '实验室模块' : '工作模块'}>
          {(mode === 'lab' ? LAB_NAV : WORK_NAV).map(({ id, label, icon: Icon }) => {
            const active = !settingsModule && (id === 'repository' ? isRepositoryPage(page) : page === id)
            return <button key={id} className="rail-button" data-active={active || undefined} onClick={() => { if(id === 'agent') setMode('work'); navigate(id) }} disabled={id === 'agent' && busy === '正在新建对话'} data-tooltip={id === 'agent' ? '新建任务对话' : label} aria-label={label} aria-current={active ? 'page' : undefined}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          })}
        </nav>
        <div className="rail-mode-switch" role="tablist" aria-label="Stable 工作区">
          <button type="button" role="tab" aria-label="工作" data-tooltip="工作" aria-selected={mode === 'work'} data-active={mode === 'work' || undefined} onClick={() => selectMode('work')}><BriefcaseBusiness size={14} aria-hidden="true" /><span>工作</span></button>
          <button type="button" role="tab" aria-label="实验室" data-tooltip="实验室" aria-selected={mode === 'lab'} data-active={mode === 'lab' || undefined} onClick={() => selectMode('lab')}><FlaskConical size={14} aria-hidden="true" /><span>实验室</span></button>
        </div>
        <button type="button" className="rail-design-button" aria-label="Design" data-tooltip="Design · 图像创作" data-active={mode === 'design' || undefined} onClick={() => void openDesign()}><Palette size={21}/><span>Design</span></button>
        <div className="rail-bottom-controls">
          <UpdateProgressButton state={state} action={action} onOpen={() => setSettingsModule('updates')} />
          <AccountDock state={state} onSelect={module => { setSettingsModule(module); setRailCollapsed(false) }} />
        </div>
        </div>
        {settingsModule && <SettingsNavigation activeModule={settingsModule} onSelect={setSettingsModule} />}
        <section className="rail-task-pane" aria-label="项目与任务" hidden={Boolean(settingsModule)}>
          <header className="rail-task-header">
            <button type="button" className="rail-new-chat" data-active={page === 'agent' && state.conversations.some(item => item.id === state.activeConversationId && item.messageCount === 0) || undefined} disabled={busy === '正在新建对话'} onClick={() => navigate('agent', mode === 'design' ? DEFAULT_DESIGN : undefined)}><SquarePen size={18} aria-hidden="true" /><span>新聊天</span></button>
            <button type="button" className="rail-task-activity" aria-label="查看活动" title="查看活动" aria-pressed={activityView} onClick={() => setActivityView(value=>!value)}><Bell size={18}/>{activityCount > 0 && <i aria-label={`${activityCount} 条未读活动`}/>}</button>
          </header>
          <div className="rail-conversation-tasks-slot" ref={setConversationTasksTarget} aria-label="对话任务" />
        </section>
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

      <main className="main-frame" id="stable-main-frame" data-settings-open={Boolean(settingsModule) || undefined}>
        {settingsModule && <SettingsContent module={settingsModule} state={state} replaceState={setState} updateTheme={theme => update('theme', theme)} action={action} onSelect={setSettingsModule} onOpenImported={agent => { setState(current => current ? { ...current, ...agent } : current); setSettingsModule(null); setPage('agent'); setMode('work') }} />}
        <div className="page-stage" data-page="agent" hidden={page !== 'agent'}>
          <AgentPage onOpenAccount={() => { setSettingsModule('account'); setRailCollapsed(false) }} onDraftsChange={ids => { composerDraftIds.current = ids }} active={page === 'agent' && !settingsModule} state={state} prefill={agentPrefill} consumePrefill={() => setAgentPrefill('')} updateAgent={(agent) => setState((current) => current ? { ...current, ...agent } : current)} updateAutomations={(automations) => update('automations', automations)} updateTeam={(team) => update('team', team)} action={action} openConversation={() => { setSettingsModule(null); setPage('agent') }} activityView={activityView} onActivityCount={setActivityCount} conversationTasksTarget={conversationTasksTarget} />
        </div>
        <div className="page-stage" data-page="workflows" hidden={page !== 'workflows'}>
          <WorkflowStudio state={state} update={(items) => update('workflows', items)} action={action} busy={busy} />
        </div>
        {isRepositoryPage(page) && <RepositoryPage activeTab={page} onTabChange={selectRepositoryTab} state={state} update={update} action={action} />}
        {page !== 'agent' && page !== 'workflows' && !isRepositoryPage(page) && <div className="page-stage" data-page={page} key={page}>
          {page === 'automations' && <AutomationsPage state={state.automations} update={(automations) => update('automations', automations)} goChat={() => { setAgentPrefill('帮我创建一个定时任务：'); setPage('agent') }} action={action} />}
          {page === 'team' && <TeamPage state={state} updateTeam={(team) => update('team', team)} action={action} />}
          {page === 'templates' && <TemplateLibrary skills={state.skills} onUse={agent => { setState(current => current ? { ...current, ...agent } : current); setAgentPrefill(agent.draftPrompt || ''); setPage('agent') }}/> }
          {page === 'market' && <SkillMarket renderContent={content => <MarkdownContent content={content}/>} onUse={agent => { setState(current => current ? { ...current, ...agent } : current); setAgentPrefill(agent.draftPrompt || ''); setPage('agent') }}/> }
          {page === 'mcp-cli' && <McpCliPage onUseWending={openWendingConversation} />}
        </div>}

      </main>

        {confirmation && <ConfirmModal value={confirmation} onCancel={() => resolveConfirmation(false)} onConfirm={() => resolveConfirmation(true)} />}
        {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={18} /></button></div>}
      </div>
      {conversationSearchOpen && <ConversationSearch query={conversationSearchQuery} results={conversationSearchResults} loading={conversationSearchLoading} error={conversationSearchError} activeConversationId={state.activeConversationId} onQueryChange={setConversationSearchQuery} hasMore={searchHasMore} onMore={()=>{const query=conversationSearchQuery;setConversationSearchLoading(true);void window.stable.agent.search(query,conversationSearchResults.length).then(results=>{if(searchQueryRef.current!==query)return;setConversationSearchResults(current=>[...new Map([...current,...results].map(i=>[i.id,i])).values()]);setSearchHasMore(results.length===30)}).catch(reason=>setConversationSearchError(errorMessage(reason))).finally(()=>setConversationSearchLoading(false))}} onSelect={selectConversationSearchResult} onClose={() => closeConversationSearch()} />}
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
      <div className="extension-market-note"><ShieldCheck size={18} aria-hidden="true" /><span>点击“使用”创建独立任务；首次登录后，再次使用直接选择品牌。仅预填提示词，不会自动发送或执行业务任务。</span></div>
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
            <p className="extension-login-status">首次登录后全局记住账号，品牌按对话分别保存</p>
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
  if (!onToggleRail || !onSearch) return <><div className="window-titlebar" aria-hidden="true" /><CloseWindowDialog/></>
  return <div className="window-titlebar"><CloseWindowDialog/>
    <div className="window-titlebar-tools" aria-label="窗口工具">
      <button type="button" onClick={onToggleRail} aria-controls="stable-main-navigation" aria-expanded={!railCollapsed} aria-label={railCollapsed ? '展开侧边导航栏' : '收起侧边导航栏'} title={railCollapsed ? '展开侧边导航栏' : '收起侧边导航栏'}>
        {railCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
      </button>
      <button ref={searchButtonRef} type="button" onClick={onSearch} aria-haspopup="dialog" aria-expanded={searchOpen} aria-label="搜索对话记录" title="搜索对话记录"><Search size={17} aria-hidden="true" /></button>
    </div>
  </div>
}

function ConversationSearch({ query, results, loading, error, activeConversationId, onQueryChange, onSelect, onClose, hasMore, onMore }: {
  query: string
  results: ConversationSearchResult[]
  hasMore?:boolean
  onMore?:()=>void
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
        {hasMore&&<button type="button" disabled={loading} onClick={onMore}>加载更多结果</button>}
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


const PERMISSION_OPTIONS: Array<{ id: AgentPermissionMode; label: string; risk: string; icon: typeof Shield; detail: string }> = [
  { id: 'request', label: '请求批准', risk: '较低风险', icon: ShieldCheck, detail: '收到的审批请求由你确认；已有精确对话授权可复用。' },
  { id: 'auto', label: '帮我批准', risk: '中等风险', icon: ShieldAlert, detail: '收到的审批请求交给审批 Agent；无法判断时由你确认。' },
  { id: 'full', label: '完全访问', risk: '高风险', icon: TriangleAlert, detail: '自动允许收到的全部审批请求，包括删除和敏感操作；仍受运行时沙箱限制。' },
]

function PermissionOption({ item, selected, onSelect }: { item: typeof PERMISSION_OPTIONS[number]; selected: boolean; onSelect: () => void }) {
  const [help, setHelp] = useState<'hover' | 'pinned' | null>(null)
  const helpId = useId()
  const Icon = item.icon
  return <div className="permission-option" data-active={selected || undefined}>
    <button type="button" className="permission-select" aria-pressed={selected} onClick={onSelect}>
      <Icon size={17} aria-label={item.risk} /><span>{item.label}</span>
    </button>
    <span className="permission-help" onMouseEnter={() => setHelp(current => current || 'hover')} onMouseLeave={() => setHelp(current => current === 'pinned' ? current : null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHelp(null) }} onKeyDown={event => { if (event.key === 'Escape' && help) { event.preventDefault(); event.stopPropagation(); setHelp(null) } }}>
      <button type="button" className="permission-info" aria-label={`${item.label}说明`} aria-describedby={help ? helpId : undefined} aria-expanded={Boolean(help)} onFocus={() => setHelp(current => current || 'hover')} onClick={() => setHelp(current => current === 'pinned' ? null : 'pinned')}><Info size={15} aria-hidden="true" /></button>
      {help && <span id={helpId} className="permission-tooltip" role="tooltip">{item.risk}：{item.detail}</span>}
    </span>
  </div>
}

interface AgentTraceRun {
  submittedAt?: number
  deliveryId?: string
  continuationOf?: string
  runId: string
  items: AgentTraceItem[]
  status: AgentTraceStatus
  startedAt: number
  endedAt?: number
}

type MessageAttachmentItem = NonNullable<MessageItem['attachments']>[number]
type ViewerImageItem = { name: string; path?: string; previewUrl?: string }

interface ImageViewerTarget {
  items: ViewerImageItem[]
  index: number
}

function AgentPage({ onOpenAccount, onDraftsChange, active, state, prefill, consumePrefill, updateAgent, updateAutomations, updateTeam, action, openConversation, conversationTasksTarget, activityView = false, onActivityCount }: { activityView?: boolean; onActivityCount?: (count: number) => void; onOpenAccount: () => void; onDraftsChange?: (ids: string[]) => void; active: boolean; state: BootstrapData; prefill: string; consumePrefill: () => void; updateAgent: (value: AgentState) => void; updateAutomations: (value: AutomationState) => void; updateTeam: (value: TeamState) => void; action: (label: string, run: () => Promise<void>) => Promise<void>; openConversation: () => void; conversationTasksTarget: HTMLDivElement | null }) {
  const composerKey = `stable-composer-v1:${state.paths.userData}`
  const [promptMap, setPromptMap, promptSaveError] = useComposerValue<Record<string, string>>(composerKey + ':prompts', {})
  const prompt = promptMap[state.activeConversationId] || ''
  function setPrompt(next: string | ((current: string) => string)) {
    const id = state.activeConversationId
    setPromptMap(current => ({ ...current, [id]: typeof next === 'function' ? next(current[id] || '') : next }))
  }
  const [pendingMap, setPendingMap] = useState<Record<string, { content: string; attachments: NonNullable<MessageItem['attachments']>; design?: DesignRequest } | undefined>>({})
  const [attachmentMap, setAttachmentMap, attachmentSaveError] = useComposerValue<Record<string, AgentAttachment[]>>(composerKey + ':attachments', {})
  const attachmentMapRef = useRef(attachmentMap)
  attachmentMapRef.current = attachmentMap
  const uploadsPending = useRef<Record<string, number>>({})
  const [referenceMap, setReferenceMap, referenceSaveError] = useComposerValue<Record<string, AgentReference[]>>(composerKey + ':references', {})
  const referenceMapRef = useRef(referenceMap)
  referenceMapRef.current = referenceMap
  const skillSaves = useRef<Record<string, Promise<unknown>>>({})
  const [composerErrorMap, setComposerErrorMap] = useState<Record<string, string>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileTasksTarget, setMobileTasksTarget] = useState<HTMLElement | null>(null)
  useTransientScrollbar(conversationTasksTarget)
  useTransientScrollbar(mobileTasksTarget)
  const [recentCollapsed,setRecentCollapsed]=useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<Record<string, boolean>>({})
  const [projectMenuId,setProjectMenuId]=useState('')
  const menuAnchor=useRef<HTMLElement|null>(null)
  const [menuMobile,setMenuMobile]=useState(false)
  const [removeTarget,setRemoveTarget]=useState<{kind:'conversation'|'project';id:string;name:string}>()
  const [projectOverlay,setProjectOverlay]=useState(false)
  const [conversationMenuId, setConversationMenuId] = useState('')
  const [browserPanels, setBrowserPanels] = useState<Record<string, { open: boolean; target?: ConversationPreviewTarget }>>({})
  const browserPanel = browserPanels[state.activeConversationId]
  const [imageViewer, setImageViewer] = useState<ImageViewerTarget>()
  const [olderPages, setOlderPages] = useState<Record<string, { messages: MessageItem[]; beforeCursor: number | null }>>({})
  const [chapterState, setChapterState] = useState<{ id: string; items: AnswerChapter[] }>({ id: '', items: [] })
  const [chapterError, setChapterError] = useState('')
  const chapters = chapterState.id === state.activeConversationId ? chapterState.items : []
  useEffect(() => {
    let disposed = false
    const id = state.activeConversationId
    setChapterError('')
    void window.stable.agent.chapters?.(id).then(items => { if (!disposed) setChapterState({ id, items }) }).catch(error => { if (!disposed) setChapterError(String(error)) })
    return () => { disposed = true }
  }, [state.activeConversationId])
  async function changeChapter(messageId: string, title: string | null) {
    const id = state.activeConversationId
    const items = await window.stable.agent.setChapter(id, messageId, title)
    if (activeConversationIdRef.current === id) { setChapterState({ id, items }); setChapterError('') }
  }
  async function forkAnswer(message: MessageItem) {
    const next = await window.stable.agent.forkAnswer(state.activeConversationId, message.id)
    updateAgent(next); openConversation()
    window.requestAnimationFrame(() => promptRef.current?.focus())
  }
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [cancelledMessages, setCancelledMessages] = useState<Record<string, MessageItem[]>>({})
  const olderPage = olderPages[state.activeConversationId]
  const visibleMessages = [...new Map([...(olderPage?.messages || []), ...state.messages, ...(cancelledMessages[state.activeConversationId] || [])].map(item => [item.id, item])).values()].sort((a, b) => a.seq !== undefined && b.seq !== undefined ? a.seq - b.seq : a.createdAt.localeCompare(b.createdAt))
  const beforeCursor = olderPage ? olderPage.beforeCursor : state.beforeCursor
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [modelStatus, setModelStatus] = useState('')
  const [switchingModel, setSwitchingModel] = useState(false)
  const modelSwitchPending = useRef(false)
  useEffect(() => {
    let disposed = false
    if (window.stable.model?.discover) {
      void window.stable.model.discover().then(result => {
        if (!disposed) updateAgent({ ...stateRef.current, models: result.catalog })
      }).catch(() => { /* Keep the existing catalog if background discovery fails. */ })
    }
    return () => { disposed = true }
  }, [])
  const [attachmentStatusMap, setAttachmentStatusMap] = useState<Record<string, string>>({})
  const [traceMap, setTraceMap] = useState<Record<string, AgentTraceRun | undefined>>({})
  const [streamingAnswerMap, setStreamingAnswerMap] = useState<Record<string, { id: string; runId: string; turn: number; step: number; time: number; content: string } | undefined>>({})
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const { unread, approvalUnread, markRead, markCompleted, markApproval, clearApprovals } = useConversationUnread(state.activeConversationId, active)
  useEffect(() => { onActivityCount?.(new Set([...unread, ...approvalUnread]).size) }, [unread, approvalUnread, onActivityCount])
  const completedUnreadCount = state.conversations.filter((item) => unread.has(item.id) && !runningMap[item.id]).length
  useEffect(() => {
    // Optional chaining keeps development/older preview bridges compatible.
    void window.stable.appearance.setCompletedCount?.(completedUnreadCount).catch(() => {})
  }, [completedUnreadCount])
  const [, refreshOutbox] = useState(0)
  const outboxRef = useRef<MessageOutbox<ComposerMessage>>()
  const [queueSaveError, setQueueSaveError] = useState('')
  if (!outboxRef.current) {
    outboxRef.current = new MessageOutbox({ run: runQueuedMessage, steer: steerQueuedMessage, changed: () => {
      setQueueSaveError(writeComposerValue(composerKey + ':outbox', outboxRef.current!.serialize()))
      refreshOutbox((value) => value + 1)
    } })
    outboxRef.current.restore(readComposerValue(composerKey + ':outbox', {}), state.conversations.map(item => item.id))
  }
  const outbox = outboxRef.current
  const queue = outbox.snapshot(state.activeConversationId)
  const [queueEdit, setQueueEdit] = useState<{ conversationId: string; id: string; text: string }>()
  const cancelledDrafts = useRef<Record<string, ComposerMessage | undefined>>({})
  const cancelBeforeDispatchRef = useRef<Record<string, boolean>>({})
  const previewRequestRef = useRef(0)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  useComposerAutosize(promptRef, prompt, active)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const dataMenuRef = useRef<HTMLDetailsElement>(null)
  const skillMenuRef = useRef<HTMLDetailsElement>(null)
  const teamMenuRef = useRef<HTMLDetailsElement>(null)
  const [showModelList,setShowModelList]=useState(false)
  const addMenuRef = useRef<HTMLDetailsElement>(null)
  const capabilityMenuRef = useRef<HTMLDetailsElement>(null)
  const permissionMenuRef = useRef<HTMLDetailsElement>(null)
  const modelMenuRef = useRef<HTMLDetailsElement>(null)
  const activeConversationIdRef = useRef(state.activeConversationId)
  const stateRef = useRef(state)
  const activeConversation = state.conversations.find((item) => item.id === state.activeConversationId) || state.conversations[0]
  const designMode = Boolean(activeConversation?.design)
  const [designInputModes, setDesignInputModes] = useState<Record<string, 'generate' | 'chat'>>({})
  const designInputMode = designInputModes[state.activeConversationId] || (activeConversation?.messageCount ? 'chat' : 'generate')
  const imageMode = designMode && designInputMode === 'generate'
  const changeDesignMode = (mode: 'generate' | 'chat') => setDesignInputModes(current=>({...current,[state.activeConversationId]:mode}))
  const [designDrafts, setDesignDrafts] = useState<Record<string, DesignRequest>>({})
  const design: DesignRequest = { ...(designDrafts[state.activeConversationId] || activeConversation?.design || DEFAULT_DESIGN), mode: 'generate' }
  function insertDesignReference(index: number) {
    setPrompt(current => current.replace(/@$/, '') + `@图${index + 1} `)
    promptRef.current?.focus()
  }
  function changeDesign(value: DesignRequest) {
    const id = state.activeConversationId
    setDesignDrafts(current=>({...current,[id]:value}))
  }
  const running = Boolean(runningMap[state.activeConversationId])
  const pendingPrompt = pendingMap[state.activeConversationId]
  const liveTrace = traceMap[state.activeConversationId]
  const pendingQuestion = !running && state.messages.at(-1)?.role === 'assistant' ? [...(state.messages.at(-1)?.trace || [])].reverse().find(item => item.clarification?.status === 'waiting')?.clarification : undefined
  const [hiddenQuestionId, setHiddenQuestionId] = useState('')
  useEffect(() => { setHiddenQuestionId('') }, [state.activeConversationId, active])
  const pendingApproval = running ? liveTrace?.items.find((item) => item.kind === 'approval' && item.status === 'running' && item.requestId) : undefined
  const streamingAnswer = streamingAnswerMap[state.activeConversationId]
  const localAttachments = attachmentMap[state.activeConversationId] || []
  const attachments = [...(state.catchAttachments || []).filter((item) => !queue.running && !queue.items.some((entry) => entry.payload.attachments.some((attachment) => attachment.path === item.path)) && !localAttachments.some((entry) => entry.path === item.path)), ...localAttachments]
  const loadScrollAnchor = async (seq: number) => {
    const id = stateRef.current.activeConversationId
    let cursor = stateRef.current.beforeCursor
    const messages: MessageItem[] = []
    while (cursor && cursor > seq && stateRef.current.activeConversationId === id) {
      const page = await window.stable.agent.messages(id, cursor)
      messages.unshift(...page.messages)
      if (page.beforeCursor === cursor) break
      cursor = page.beforeCursor
    }
    if (messages.length && stateRef.current.activeConversationId === id) setOlderPages(current => ({ ...current, [id]: { messages, beforeCursor: cursor ?? null } }))
  }
  const { scrollRef, awayFromBottom, scrollToBottom, scrollToMessage } = useConversationScroll(state.activeConversationId, `${state.messages.length}:${pendingPrompt?.content}:${liveTrace?.items.length}:${streamingAnswer?.content}:${running}`, active, loadScrollAnchor)
  const imageAttachments = attachments.filter(attachmentIsImage)
  const annotationAttachments = attachments.filter(item => item.annotation)
  const documentAttachments = attachments.filter((item) => !attachmentIsImage(item) && !item.annotation)
  const selectedReferences = (referenceMap[state.activeConversationId] || []).filter(item => item.kind !== 'data' && item.kind !== 'knowledge')
  const hasComposerContent = Boolean(prompt.trim() || attachments.length || selectedReferences.length)
  const showComposerStop = Boolean(pendingQuestion) || (running && !hasComposerContent)
  const composerError = composerErrorMap[state.activeConversationId] || promptSaveError || attachmentSaveError || referenceSaveError || queueSaveError || ''
  const activePermission = PERMISSION_OPTIONS.find((item) => item.id === activeConversation?.permissionMode) || PERMISSION_OPTIONS[0]
  const defaultModel = state.models.items.find((item) => item.id === state.models.defaultModelId) || state.models.items[0]
  const activeModel = state.models.items.find((item) => item.id === activeConversation?.modelId) || (activeConversation?.modelId?.startsWith('chatgpt:') ? { id: activeConversation.modelId, providerId: 'chatgpt', displayName: 'ChatGPT（请重新登录）', model: activeConversation.modelId.split(':').at(-1) || '', baseURL: 'https://api.openai.com/v1', hasApiKey: false, reasoningOptions: [] } : defaultModel)
  const latestMessage = state.messages.at(-1)
  const prediction = useMessagePrediction({
    conversationId: state.activeConversationId, messageId: latestMessage?.id, modelId: activeModel?.id,
    eligible: active && state.messagePredictionsEnabled !== false && latestMessage?.role === 'assistant'
      && !activeConversation?.archivedAt && !running && !queue.running && !queue.items.length && !queue.paused
      && !pendingQuestion && !pendingApproval && !composerError && !prompt && !attachments.length
      && !selectedReferences.some(item => item.kind !== 'skill') && latestMessage?.automationProposal?.status !== 'pending',
    onAccept: setPrompt,
  })
  const capabilityOptions = activeModel?.reasoningOptions || []
  const activeCapability = capabilityOptions.find(item => item.id === activeConversation?.capability) || { id: 'auto', label: '默认' }
  const attachmentStatus = attachmentStatusMap[state.activeConversationId] || ''
  const conversationIsEmpty = visibleMessages.length === 0 && !pendingPrompt && !liveTrace
  const reduceConversationMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [skillSearch,setSkillSearch] = useState('')
  const enabledSkills = state.skills.filter((item) => item.enabled)
  const searchedSkills = enabledSkills.filter(item=>`${item.name} ${item.description||''}`.toLocaleLowerCase().includes(skillSearch.trim().toLocaleLowerCase()))
  const scripts = state.library.filter((item) => item.kind === 'script')
  const draftIds = state.conversations.filter(item => promptMap[item.id]?.trim() || attachmentMap[item.id]?.length).map(item => item.id)
  const draftIdsKey = JSON.stringify(draftIds)
  useEffect(() => { onDraftsChange?.(draftIds) }, [draftIdsKey, onDraftsChange])
  const listedConversations = state.conversations.filter(item => item.messageCount > 0 || draftIds.includes(item.id) || Boolean(runningMap[item.id]) || Boolean(cancelledMessages[item.id]?.length))
  const pinnedConversations = listedConversations.filter((item) => item.pinned && !item.archivedAt)
  const remoteTeamDevices = state.team.devices.filter((item) => item.id !== state.team.profile?.deviceId)
  activeConversationIdRef.current = state.activeConversationId
  stateRef.current = state

  useEffect(() => {
    setSidebarOpen(false)
    const id = state.activeConversationId
    const current = referenceMapRef.current
    if (current[id] === undefined) {
      const refs = state.skillReferences ?? (state.draftReference ? [state.draftReference] : [])
      referenceMapRef.current = { ...current, [id]: refs }
      setReferenceMap(referenceMapRef.current)
    }
  }, [state.activeConversationId])

  useEffect(() => {
    if (!active || !prefill || running) return
    setPrompt(prefill); consumePrefill()
    window.requestAnimationFrame(() => { promptRef.current?.focus(); promptRef.current?.setSelectionRange(prefill.length, prefill.length) })
  }, [active, prefill, running])

  useEffect(() => { setModelStatus(''); if (modelMenuRef.current) modelMenuRef.current.open = false }, [state.activeConversationId])

  useEffect(()=>{setConversationMenuId('');setProjectMenuId('')},[state.activeConversationId,active])

  function setAttachments(next: AgentAttachment[] | ((current: AgentAttachment[]) => AgentAttachment[])) {
    const id = state.activeConversationId
    const current = attachmentMapRef.current
    attachmentMapRef.current = { ...current, [id]: typeof next === 'function' ? next(current[id] || []) : next }
    setAttachmentMap(attachmentMapRef.current)
  }

  function mergeAttachments(inspected: AgentAttachment[]) {
    const merged = [...(attachmentMapRef.current[state.activeConversationId] || [])]
    for (const item of attachments.filter(item => item.type === 'catch')) if (!merged.some(existing => existing.path === item.path)) merged.push(item)
    for (const item of inspected) if (!merged.some(existing => existing.path === item.path)) merged.push(item)
    if (merged.length > 8) throw new Error('一次最多添加 8 个临时附件。')
    if (merged.filter(attachmentIsImage).reduce((sum, item) => sum + item.size, 0) > 10 * 1024 * 1024) throw new Error('本次图片总大小不能超过 10 MB。')
    setAttachments(merged)
  }

  function setAttachmentStatus(value: string) {
    setAttachmentStatusMap((current) => ({ ...current, [state.activeConversationId]: value }))
  }

  function setReferences(next: AgentReference[] | ((current: AgentReference[]) => AgentReference[])) {
    const id = state.activeConversationId
    const current = referenceMapRef.current[id] || []
    const refs = typeof next === 'function' ? next(current) : next
    referenceMapRef.current = { ...referenceMapRef.current, [id]: refs }
    setReferenceMap(referenceMapRef.current)
    const ids = (items: AgentReference[]) => items.filter(item => item.kind === 'skill').map(item => item.id)
    if (JSON.stringify(ids(current)) !== JSON.stringify(ids(refs)) && window.stable.agent.setSkillReferences) {
      // Serialize saves; a send waits for its conversation's outstanding selection.
      const save = (skillSaves.current[id] || Promise.resolve()).catch(() => {}).then(() => window.stable.agent.setSkillReferences(id, ids(refs)))
      skillSaves.current[id] = save
      void save.catch(error => setComposerErrorMap(all => ({ ...all, [id]: errorMessage(error) })))
    }
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
        deliveryId: current?.deliveryId,
        submittedAt: current?.submittedAt,
        continuationOf: current?.continuationOf,
        items,
        status,
        startedAt: sameRun || awaitingFirstEvent ? current.startedAt : event.time,
        ...(terminal ? { endedAt: event.time } : {}),
      } }
    })
  }), [])

  useEffect(() => {
    if (!active) return
    const stopPaste = window.stable.editor?.onPasteIntoComposer((text) => {
      const element = promptRef.current
      if (!element || !text) return
      const start = element.selectionStart, end = element.selectionEnd
      setPrompt((current) => `${current.slice(0, start)}${text}${current.slice(end)}`)
      window.requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + text.length, start + text.length) })
    })
    const stopSelect = window.stable.editor?.onSelectAllMessages(() => {
      const content = scrollRef.current?.querySelector('.conversation-stream')
      if (!content) return
      const selection = window.getSelection(), range = document.createRange()
      range.selectNodeContents(content)
      selection?.removeAllRanges(); selection?.addRange(range)
    })
    return () => { stopPaste?.(); stopSelect?.() }
  }, [active])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const menu of [addMenuRef.current, dataMenuRef.current, skillMenuRef.current, teamMenuRef.current, capabilityMenuRef.current, permissionMenuRef.current, modelMenuRef.current]) {
        if (menu?.open && !menu.contains(event.target as Node)) menu.open = false
      }
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => document.removeEventListener('pointerdown', closeOutside, true)
  }, [])

  function openConversationPreview(target: Omit<ConversationPreviewTarget, 'requestId'>) {
    previewRequestRef.current += 1
    const request = { ...target, requestId: previewRequestRef.current }
    setBrowserPanels(current => ({ ...current, [state.activeConversationId]: { open: true, target: request } }))
  }

  function replaceConversation(run: () => Promise<AgentState>, label: string) {
    setSidebarOpen(false)
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
    if (!activeConversation || modelSwitchPending.current || modelId === activeConversation.modelId) return
    const selected = state.models.items.find((item) => item.id === modelId)
    if (!selected) return
    modelSwitchPending.current = true; setSwitchingModel(true)
    void action('正在切换对话模型', async () => {
      try {
        updateAgent(await window.stable.agent.configureModel(activeConversation.id, modelId))
        setModelStatus(`已切换至 ${selected.displayName}，从下一条消息生效。`)
      } finally { modelSwitchPending.current = false; setSwitchingModel(false) }
    })
  }


  function togglePin(item: ConversationItem) {
    setConversationMenuId('')
    void action(item.pinned ? '正在取消置顶对话' : '正在置顶对话', async () => updateAgent(await window.stable.agent.pin(item.id, !item.pinned)))
  }

  function addAttachments(paths: string[]) {
    if (!paths.length) return
    const id = state.activeConversationId
    uploadsPending.current[id] = (uploadsPending.current[id] || 0) + 1
    void action('正在读取临时附件', async () => {
      try {
        const inspected = await window.stable.agent.inspectAttachments(paths)
        mergeAttachments(inspected)
        setAttachmentStatus(`已添加 ${inspected.length} 个附件。`)
      } finally { uploadsPending.current[id] -= 1 }
    })
  }

  async function addPastedAttachments(files: File[]) {
    const id = state.activeConversationId
    uploadsPending.current[id] = (uploadsPending.current[id] || 0) + 1
    const saved: AgentAttachment[] = []
    setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' }))
    setAttachmentStatus('正在读取剪贴板附件。')
    try {
      // Explorer copies carry real file paths; screenshots carry only image bytes.
      const entries = files.map(file => ({ file, path: window.stable.files.path(file) }))
      const paths = [...new Set(entries.map(item => item.path).filter(Boolean))]
      const inspected = paths.length ? await window.stable.agent.inspectAttachments(paths) : []
      const images = entries.filter(item => !item.path).map(item => item.file)
      if (images.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) throw new Error('无法读取剪贴板文件路径，请从资源管理器复制文件后粘贴。')
      for (let index = 0; index < images.length; index += 1) {
        const file = images[index]
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
        const name = file.name && !/^image\.(?:png|jpe?g|webp)$/i.test(file.name) ? file.name : `粘贴截图-${Date.now()}-${index + 1}.${extension}`
        saved.push(await window.stable.agent.savePastedImage(state.activeConversationId, name, file.type, new Uint8Array(await file.arrayBuffer())))
      }
      mergeAttachments([...inspected, ...saved])
      setAttachmentStatus(`已从剪贴板添加 ${inspected.length + saved.length} 个附件。`)
    } catch (error) {
      for (const item of saved) void window.stable.agent.discardDraftImage(item.path).catch(() => {})
      setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: errorMessage(error) }))
      setAttachmentStatus('剪贴板附件未添加。')
    } finally { uploadsPending.current[id] -= 1 }
  }

  function handlePromptPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile()).filter((item): item is File => Boolean(item))
    if (!files.length) return
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    if (pastedText) {
      const start = event.currentTarget.selectionStart
      const end = event.currentTarget.selectionEnd
      setPrompt((current) => `${current.slice(0, start)}${pastedText}${current.slice(end)}`)
    }
    void addPastedAttachments(files)
  }

  function removeAttachment(item: AgentAttachment) {
    if (item.type === 'catch') {
      const conversationId = state.activeConversationId
      void action('正在移除 Catch 附件', async () => {
        const next = await window.stable.agent.discardCatch(conversationId)
        setAttachmentMap((current) => ({ ...current, [conversationId]: (current[conversationId] || []).filter((entry) => entry.path !== item.path) }))
        if (activeConversationIdRef.current === conversationId) updateAgent(next)
      })
      return
    }
    setAttachments((current) => current.filter((entry) => entry.path !== item.path))
    setAttachmentStatus(`已移除附件 ${item.name}。`)
    if (item.draft) void window.stable.agent.discardDraftImage(item.path).catch(() => {})
  }

  function addSkillFolder() {
    const id = state.activeConversationId
    uploadsPending.current[id] = (uploadsPending.current[id] || 0) + 1
    void action('正在读取 Skill 文件夹', async () => {
      try {
        const inspected = await window.stable.agent.selectSkillFolder()
        if (!inspected.length) return
        mergeAttachments(inspected)
      } finally { uploadsPending.current[id] -= 1 }
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

  function previewMessageAttachment(item: NonNullable<MessageItem['attachments']>[number]) {
    if (item.kind === 'attachment' && item.path) openConversationPreview({ kind: 'file', value: item.path, title: item.name })
  }

  function openImageViewer(items: ViewerImageItem[], index: number) {
    setImageViewer({ items, index })
  }

  async function copyUserMessage(message: MessageItem) {
    await action('正在复制消息', async () => {
      const reply = clarificationDisplay(message.content)
      await window.stable.clipboard.writeText(reply ? `${reply.question}\n${reply.answer}` : message.content)
    })
  }

  function ConversationRow({ item, mobile }: { item: ConversationItem; mobile:boolean }) {
    const menuOpen = conversationMenuId === item.id && menuMobile === mobile
    const activity = approvalUnread.has(item.id) && !(active && item.id === activeConversation.id) ? 'approval' : runningMap[item.id] ? 'running' : unread.has(item.id) ? 'unread' : undefined
    const activityLabel = activity === 'approval' ? '有待查看的审批请求' : activity === 'running' ? '任务执行中' : activity === 'unread' ? '已完成，未读' : ''
    return <article className="conversation-list-item" data-conversation-id={item.id} data-activity={activity} data-active={item.id === activeConversation.id || undefined} data-pinned={item.pinned || undefined} key={item.id}>
      <button className="conversation-pin-action" type="button" onClick={() => togglePin(item)} aria-label={item.pinned ? `取消置顶 ${item.title}` : `置顶 ${item.title}`}><span>{item.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}</span></button>
      <button className="conversation-select" type="button" onClick={() => selectConversation(item)} onDoubleClick={() => { setEditingId(item.id); setEditingTitle(item.title) }}>
        <ConversationTitle title={item.title + (item.deletionState === 'pending' ? ' · 删除待同步' : '')} />{item.waitingForInput && <span className="conversation-input-badge">需要用户回答</span>}{activityLabel && <span className="sr-only">{activityLabel}</span>}
      </button>
      {activity && <span className="conversation-activity" title={activityLabel} aria-hidden="true">
        {activity === 'running' ? <span className="conversation-spinner spin" /> : <span className={activity === 'approval' ? 'conversation-approval-dot' : 'conversation-unread-dot'} />}
      </span>}
      <div className="conversation-item-actions" data-conversation-menu={item.id}>
        <button type="button" aria-label={`更多操作 ${item.title}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={event => {menuAnchor.current=event.currentTarget;setMenuMobile(Boolean(event.currentTarget.closest('.conversation-sidebar-mobile')));setProjectMenuId('');setConversationMenuId(current=>current===item.id?'':item.id)}}><MoreHorizontal size={16} aria-hidden="true" /></button>
        {menuOpen && menuAnchor.current && <SidebarActionMenu anchor={menuAnchor.current} label={`任务操作 ${item.title}`} onClose={()=>setConversationMenuId('')}>
          <button type="button" role="menuitem" onClick={() => togglePin(item)}>{item.pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{item.pinned ? '取消置顶任务' : '置顶任务'}</span></button>
          <button type="button" role="menuitem" onClick={() => { setConversationMenuId(''); void action('正在打开资源管理器', async () => { await window.stable.agent.openWorkspace(item.id) }) }}><FolderOpen size={14} /><span>在资源管理器打开</span></button>
          <button type="button" role="menuitem" disabled aria-disabled="true"><ListTree size={14} /><span>文件管理</span><small>暂不可用</small></button>
          <button type="button" role="menuitem" disabled aria-disabled="true"><Share2 size={14} /><span>分享</span><small>暂不可用</small></button>
          <button type="button" role="menuitem" onClick={() => { setConversationMenuId(''); setEditingId(item.id); setEditingTitle(item.title) }}><Pencil size={14} /><span>重命名</span></button>
          <button className="danger" type="button" role="menuitem" disabled={Boolean(runningMap[item.id])} onClick={() => { setConversationMenuId(''); setRemoveTarget({kind:'conversation',id:item.id,name:item.title}) }}><Trash2 size={14} /><span>删除任务</span></button>
        </SidebarActionMenu>}
      </div>
    </article>
  }

  function LimitedTaskRows(items: ConversationItem[], groupId: string, mobile: boolean) {
    const expanded = expandedTaskGroups[groupId] || false
    return <>
      {(expanded ? items : items.slice(0, 5)).map(item => ConversationRow({ item, mobile }))}
      {items.length > 5 && <button className="task-group-expand" type="button" aria-expanded={expanded} onClick={() => { setExpandedTaskGroups(current => ({ ...current, [groupId]: !expanded })); setConversationMenuId('') }}>{expanded ? '收起显示' : '展开显示'}</button>}
    </>
  }

  function ConversationTaskSections(mobile=false) {
    if (activityView) {
      const activityRunning = Object.fromEntries(listedConversations.map(item => [item.id, Boolean(runningMap[item.id] || traceMap[item.id]?.status === 'running')]))
      const pendingApprovals = new Set([...approvalUnread, ...Object.entries(traceMap).filter(([, value]) => value?.status === 'running' && value.items.some(item => item.kind === 'approval' && item.status === 'running')).map(([id]) => id)])
      return <ConversationActivity items={listedConversations} projects={state.projects || []} activeId={state.activeConversationId} running={activityRunning} unread={unread} approvals={pendingApprovals} summaries={Object.fromEntries(Object.entries(streamingAnswerMap).filter(([, value]) => value?.content).map(([id, value]) => [id, value!.content]))} onSelect={selectConversation} onReadAll={() => listedConversations.forEach(item => markRead(item.id))} />
    }
    return <>
      {pinnedConversations.length > 0 && <section className="conversation-pinned" aria-label="置顶任务">
        <div className="conversation-section-head"><span>置顶</span></div>
        <div className="conversation-list">{LimitedTaskRows(pinnedConversations, 'pinned', mobile)}</div>
      </section>}
      <section className="conversation-history-card" aria-label="任务清单">
        {(state.projects||[]).length>0&&<div className="conversation-section-head"><span>项目</span></div>}
        <div className="conversation-list">
          {state.team.conversationOffers.map((offer) => <article className="team-offer-card" key={offer.id}>
            <div><small>来自 {offer.sourceDeviceName}</small><strong>{offer.title}</strong><span>{offer.messageCount} 条问答消息</span></div>
            <div><button type="button" onClick={() => decideConversation(offer.id, false)}>拒绝</button><button type="button" className="primary" onClick={() => decideConversation(offer.id, true)}>接收</button></div>
          </article>)}
          {(state.projects||[]).map(project=>{
            const items=listedConversations.filter(item=>item.projectId===project.id&&!item.pinned&&!item.archivedAt)
            const menuOpen=projectMenuId===project.id&&menuMobile===mobile
            const collapsed=collapsedProjects[project.id] || false
            const listId=`project-tasks-${mobile ? 'mobile' : 'rail'}-${project.id}`
            return <section className="sidebar-project" key={project.id} aria-label={'项目 '+project.name}>
              <div className="sidebar-project-heading" data-pinned={project.pinned||undefined}>
                <button className="sidebar-project-title" type="button" title={project.rootPath} aria-expanded={!collapsed} aria-controls={listId} onClick={() => { setCollapsedProjects(current => ({ ...current, [project.id]: !collapsed })); setConversationMenuId(''); setProjectMenuId('') }}>{collapsed ? <FolderClosed size={16} strokeWidth={1.6} /> : <FolderOpen size={16} strokeWidth={1.6} />}<span>{project.name}</span>{project.pinned&&<Pin size={13}/>}</button>
                <button className="sidebar-project-more" type="button" aria-label={'项目操作 '+project.name} aria-haspopup="menu" aria-expanded={menuOpen} onClick={event=>{menuAnchor.current=event.currentTarget;setMenuMobile(Boolean(event.currentTarget.closest('.conversation-sidebar-mobile')));setConversationMenuId('');setProjectMenuId(current=>current===project.id?'':project.id)}}><MoreHorizontal size={17}/></button>
                <button className="sidebar-project-new" type="button" aria-label={'在 '+project.name+' 中新建对话'} onClick={()=>void action('正在新建对话',async()=>{setCollapsedProjects(current => ({ ...current, [project.id]: false }));updateAgent(await window.stable.projects.open(project.id));openConversation()})}><SquarePen size={16}/></button>
                {menuOpen&&menuAnchor.current&&<SidebarActionMenu anchor={menuAnchor.current} label={'项目操作 '+project.name} onClose={()=>setProjectMenuId('')}>
                  <button type="button" role="menuitem" onClick={()=>{setProjectMenuId('');void action('正在保存项目排序',async()=>updateAgent(await window.stable.projects.manage(project.id,project.pinned?'unpin':'pin')))}}>{project.pinned?<PinOff size={15}/>:<Pin size={15}/>}<span>{project.pinned?'取消置顶':'置顶'}</span></button>
                  <button type="button" role="menuitem" onClick={()=>{setProjectMenuId('');void action('正在打开项目目录',async()=>{await window.stable.projects.manage(project.id,'open')})}}><FolderOpen size={15}/><span>在资源管理器中打开</span></button>
                  <button type="button" role="menuitem" className="danger" disabled={state.conversations.some(item=>item.projectId===project.id&&runningMap[item.id])} onClick={()=>{setProjectMenuId('');setRemoveTarget({kind:'project',id:project.id,name:project.name})}}><X size={15}/><span>移除项目</span></button>
                </SidebarActionMenu>}
              </div>
              <div id={listId} hidden={collapsed}>{items.length ? LimitedTaskRows(items, `project:${project.id}`, mobile) : <p className="sidebar-project-empty">暂无聊天</p>}</div>
            </section>
          })}
        </div>
        <div className="conversation-section-head recent-heading">
          <button type="button" className="recent-toggle" aria-label={recentCollapsed?'展开最近对话':'收起最近对话'} aria-expanded={!recentCollapsed} onClick={()=>{setRecentCollapsed(value=>!value);setConversationMenuId('')}}><span>最近</span><ChevronDown size={14} data-collapsed={recentCollapsed||undefined}/></button>
          <button type="button" className="recent-new" aria-label="新建对话" onClick={()=>{setRecentCollapsed(false);replaceConversation(()=>window.stable.agent.create(),'正在新建对话');openConversation()}}><SquarePen size={17}/></button>
        </div>
        {!recentCollapsed&&<div className="conversation-list recent-conversations">
          {LimitedTaskRows(listedConversations.filter((item) => !item.pinned && !item.archivedAt && !(state.projects||[]).some(project=>project.id===item.projectId)), 'recent', mobile)}
        </div>}
      </section>
    </>
  }

  useEffect(() => {
    const id = state.activeConversationId, draft = cancelledDrafts.current[id]
    if (!draft || running || queue.running) return
    delete cancelledDrafts.current[id]
    if (draft.design) {
      setDesignDrafts(current=>({...current,[id]:draft.design!}))
      setDesignInputModes(current=>({...current,[id]:'generate'}))
    }
    setPrompt(current => current.trim() ? current + '\n\n' + draft.prompt : draft.prompt)
    setAttachmentMap(current => ({ ...current, [id]: [...(current[id] || []), ...draft.attachments.filter(item => !(current[id] || []).some(existing => existing.path === item.path))] }))
    const refs = referenceMapRef.current[id] || []
    referenceMapRef.current = { ...referenceMapRef.current, [id]: [...refs, ...draft.references.filter(item => !refs.some(existing => existing.id === item.id && existing.kind === item.kind))] }
    setReferenceMap(referenceMapRef.current)
  }, [state.activeConversationId, running, queue.running])

  async function acceptHtmlEditRequest(request:{prompt:string;send:boolean;attachments:any[]}) {
    const conversationId=state.activeConversationId
    setPrompt(current=>current.trim()?current+'\n\n'+request.prompt:request.prompt)
    setAttachmentMap(current=>({...current,[conversationId]:[...(current[conversationId]||[]),...request.attachments.filter(item=>!(current[conversationId]||[]).some(existing=>existing.path===item.path))]}))
    window.requestAnimationFrame(()=>promptRef.current?.focus())
  }

  function send() {
    if (uploadsPending.current[state.activeConversationId]) { setComposerErrorMap(current => ({ ...current, [state.activeConversationId]: '附件仍在读取，请完成后再发送。' })); return }
    if (cloudAccessHint(state.cloud.status) && activeModel?.providerId !== 'chatgpt') { onOpenAccount(); return }
    if (pendingQuestion && !prompt.trim()) return
    if (!prompt.trim() && !attachments.length && !selectedReferences.length) return
    const conversationId = state.activeConversationId
    try {
      const pendingQueue = outbox.snapshot(conversationId)
      if (!pendingQueue.running && !pendingQueue.items.length) outbox.resume(conversationId)
      const dispatch = pendingQuestion ? outbox.reply.bind(outbox) : outbox.enqueue.bind(outbox)
      void Promise.resolve(dispatch(conversationId, {
        ...(imageMode ? {design:{...design}} : {}),
        prompt: prompt.trim() || '请读取并分析本次引用的资源与附件。',
        attachments: attachments.map((item) => ({ ...item })),
        references: selectedReferences.map((item) => ({ ...item })),
        ...(pendingQuestion ? { clarificationResponse: { id: pendingQuestion.id, source: 'custom' as const, text: prompt.trim() } } : {}),
      })).catch(error => setComposerErrorMap(current => ({ ...current, [conversationId]: errorMessage(error) })))
      setPrompt(''); setAttachments([]); setReferences(current => current.filter(item => item.kind === 'skill'))
      if (imageMode) changeDesignMode('chat')
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
    setPendingMap((current) => ({ ...current, [conversationId]: { content: clarificationPendingContent(value, entry.payload.clarificationResponse, activeConversationIdRef.current === conversationId ? stateRef.current.messages : []), attachments: messageAttachments } }))
    setTraceMap((current) => ({ ...current, [conversationId]: { runId: '', deliveryId: entry.id, submittedAt: Date.now(), items: [], status: 'running', startedAt: Date.now(), ...clarificationContinuation(activeConversationIdRef.current === conversationId ? stateRef.current.messages : [], entry.payload.clarificationResponse?.id) } }))
    setStreamingAnswerMap((current) => ({ ...current, [conversationId]: undefined }))
    setRunningMap((current) => ({ ...current, [conversationId]: true }))
    markRead(conversationId)
    let completed = false
    let terminalStatus: AgentTraceStatus = 'failed'
    let previousMessageIds: Set<string> | undefined
    let dispatched = false
    let retainedCancellation = false
    let retainedQuestion = false
    const startedAt = Date.now()
    const retainCancelledMessage = () => {
      retainedCancellation = true
      const time = Date.now()
      setCancelledMessages(current => ({ ...current, [conversationId]: [...(current[conversationId] || []),
        { id: entry.id, role: 'user', content: value, attachments: messageAttachments, createdAt: new Date(startedAt).toISOString() },
        { id: `${entry.id}-cancelled`, role: 'assistant', content: '', createdAt: new Date(time).toISOString(), trace: [{ id: 'runtime', runId: entry.id, kind: 'status', title: '已取消', status: 'cancelled', startedAt, time }] },
      ] }))
    }
    try {
      await skillSaves.current[conversationId]
      const before = await window.stable.agent.state(conversationId)
      previousMessageIds = new Set(before.messages.map((item) => item.id))
      const continuation = clarificationContinuation(before.messages, entry.payload.clarificationResponse?.id)
      if (continuation) setTraceMap(current => ({ ...current, [conversationId]: current[conversationId] ? { ...current[conversationId]!, ...continuation } : undefined }))
      setPendingMap(current => ({ ...current, [conversationId]: { content: clarificationPendingContent(value, entry.payload.clarificationResponse, before.messages), attachments: messageAttachments, design: entry.payload.design } }))
      const conversation = before.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error('找不到这个对话。')
      await window.stable.agent.configure(conversationId, conversation.capability, [])
      if (cancelBeforeDispatchRef.current[conversationId]) {
        terminalStatus = 'cancelled'
        cancelledDrafts.current[conversationId] = entry.payload
        retainCancelledMessage()
        return { accepted: false, continue: false, cancelled: true }
      }
      dispatched = true
      if (entry.payload.design) await window.stable.agent.configureDesign(conversationId, entry.payload.design)
      const result = await window.stable.agent.run(conversationId, value, currentAttachments, currentReferences, entry.id, entry.payload.clarificationResponse, entry.payload.design)
      updateAgentForConversation(result, conversationId)
      completed = true
      const lastAnswer = [...result.messages].reverse().find((item) => item.role === 'assistant')
      const waiting = lastAnswer?.trace?.some(item => item.clarification?.status === 'waiting')
      if (!waiting && lastAnswer && !previousMessageIds.has(lastAnswer.id) && (!lastAnswer.trace?.length || savedTraceStatus(lastAnswer.trace) === 'completed')) markCompleted(conversationId)
      return { accepted: true, continue: !waiting && (!lastAnswer?.trace?.length || savedTraceStatus(lastAnswer.trace) === 'completed') }
    } catch (error) {
      let messageAccepted = dispatched
      try {
        const recovered = await window.stable.agent.state(conversationId)
        messageAccepted = Boolean(dispatched && previousMessageIds && recovered.messages.some((item) => item.role === 'user' && !previousMessageIds!.has(item.id)))
        retainedQuestion = !messageAccepted && !!clarificationContinuation(recovered.messages, entry.payload.clarificationResponse?.id)
        updateAgentForConversation(recovered, conversationId)
        completed = recovered.messages.some(item => item.role === 'assistant' && !previousMessageIds?.has(item.id) && item.trace?.some(event => event.id === 'runtime' && event.runId === entry.id && ['failed', 'cancelled'].includes(event.status)))
      } catch { /* do not resend a possibly accepted message without a confirmed receipt */ }
      if (cancelBeforeDispatchRef.current[conversationId] && !messageAccepted) {
        terminalStatus = 'cancelled'
        cancelledDrafts.current[conversationId] = entry.payload
        retainCancelledMessage()
        return { accepted: false, continue: false, cancelled: true }
      }
      const detail = errorMessage(error)
      const feedback = taskErrorMessage(detail)
      if (!feedback) terminalStatus = 'cancelled'
      setComposerErrorMap((current) => ({ ...current, [conversationId]: completed ? '' : feedback }))
      return { accepted: messageAccepted, continue: false, error: detail }
    } finally {
      setPendingMap((current) => ({ ...current, [conversationId]: undefined }))
      setTraceMap((current) => {
        const trace = current[conversationId]
        return { ...current, [conversationId]: completed || !trace || retainedCancellation || retainedQuestion ? undefined : { ...trace, status: trace.status === 'running' ? terminalStatus : trace.status, endedAt: trace.endedAt || Date.now() } }
      })
      setStreamingAnswerMap((current) => ({ ...current, [conversationId]: undefined }))
      setRunningMap((current) => ({ ...current, [conversationId]: false }))
    }
  }

  async function steerQueuedMessage(conversationId: string, entry: OutboxEntry<ComposerMessage>) {
    if (entry.payload.design) throw new Error('Design 参数随排队消息在下一轮生效，请等待当前任务完成。')
    await skillSaves.current[conversationId]
    const result = await window.stable.agent.steer(conversationId, entry.id, entry.payload.prompt, entry.payload.attachments, entry.payload.references)
    updateAgentForConversation(result, conversationId)
  }

  function stopConversation() {
    cancelBeforeDispatchRef.current[activeConversation.id] = true
    outbox.pause(activeConversation.id)
    void window.stable.agent.cancel(activeConversation.id).then(async () => {
      if (pendingQuestion) updateAgentForConversation(await window.stable.agent.state(activeConversation.id), activeConversation.id)
    }).catch((error) => setComposerErrorMap((current) => ({ ...current, [activeConversation.id]: taskErrorMessage(errorMessage(error)) })))
  }

  function updateAgentForConversation(result: AgentState, conversationId: string) {
    if (activeConversationIdRef.current === conversationId) updateAgent(result)
    else updateAgent({ ...result, activeConversationId: activeConversationIdRef.current, messages: stateRef.current.messages, catchAttachments: stateRef.current.catchAttachments, draftReference: stateRef.current.draftReference, skillReferences: stateRef.current.skillReferences, beforeCursor: stateRef.current.beforeCursor, paths: stateRef.current.paths, deliveries: stateRef.current.deliveries, recoveryText: stateRef.current.recoveryText, recoveryDiagnostic: stateRef.current.recoveryDiagnostic })
  }

  const pendingMessage: MessageItem | undefined = pendingPrompt && !state.messages.some(message => message.role === 'user' && message.content === pendingPrompt.content)
    ? { id: `pending:${liveTrace?.deliveryId || ''}`, role: 'user', content: pendingPrompt.content, attachments: pendingPrompt.attachments, trace: pendingPrompt.design ? [{id:'design-request',runId:'design-request',kind:'context',title:'图片生成参数',status:'completed',time:Date.now(),designRequest:pendingPrompt.design}] : undefined, createdAt: new Date(liveTrace?.submittedAt || Date.now()).toISOString() } : undefined
  const conversationTurns = groupConversationTurns([...visibleMessages, ...(pendingMessage ? [pendingMessage] : [])], liveTrace ? { ...liveTrace, status: running && liveTrace.status === 'completed' ? 'running' : liveTrace.status, streaming: running ? streamingAnswer : undefined } : undefined)

  if (!activeConversation) return <section className="agent-layout reveal"><Empty icon={MessageSquareText} title="正在准备对话" detail="Stable 正在创建第一个独立任务。" /></section>

  return <section className="agent-layout reveal" data-sidebar-open={sidebarOpen || undefined}>
    {conversationTasksTarget && createPortal(ConversationTaskSections(), conversationTasksTarget)}
    <aside ref={setMobileTasksTarget} className="conversation-sidebar conversation-sidebar-mobile" aria-label="对话任务">
      {ConversationTaskSections(true)}
    </aside>
    <div className="conversation-workspace">
    <div className="conversation" data-empty={conversationIsEmpty || undefined}>
      <header className="conversation-topbar">
        <button className="conversation-sidebar-toggle" type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="打开对话列表"><PanelLeftOpen size={18} /></button>
        <div><strong>{activeConversation.title}</strong></div>
        <ConversationTools key={state.activeConversationId} conversationId={state.activeConversationId} running={running} active={active} autoOpenWending={prefill === WENDING_CLI_PREFILL} chapters={chapters} chapterError={chapterError} onChange={changeChapter} onJump={chapter => scrollToMessage(chapter.messageId, chapter.seq)} onBrowser={() => setBrowserPanels(current => ({ ...current, [state.activeConversationId]: { ...current[state.activeConversationId], open: true } }))} />
      </header>
      <div className="message-scroll" ref={scrollRef}>
        <div className="conversation-stream">

          {beforeCursor && <button className="history-load-more" disabled={loadingOlder} onClick={() => void action('正在读取更早消息', async () => {
            const id = state.activeConversationId, element = scrollRef.current, height = element?.scrollHeight || 0, top = element?.scrollTop || 0
            setLoadingOlder(true)
            try { const page = await window.stable.agent.messages(id, beforeCursor); setOlderPages(current => ({ ...current, [id]: { messages: [...page.messages, ...(current[id]?.messages || [])], beforeCursor: page.beforeCursor } })); window.requestAnimationFrame(() => { if (element && activeConversationIdRef.current === id) element.scrollTop = top + element.scrollHeight - height }) }
            finally { setLoadingOlder(false) }
          })}>{loadingOlder ? '读取中…' : '加载更早的消息'}</button>}
          {conversationIsEmpty ? <div className="conversation-empty"><video className="conversation-start-animation" src={conversationStartAnimationUrl} autoPlay={!reduceConversationMotion} loop muted playsInline preload="auto" aria-hidden="true" /><h2>准备好了，随时开始</h2></div> : conversationTurns.map((turn) => { const message = [...turn.messages].reverse().find(item => item.role === 'assistant') || turn.messages.at(-1); return message ? <MessageTurn designMode={designMode} onCopyReply={copyUserMessage} turnMessages={turn.messages} live={turn.live} waiting={turn.waiting} conversationId={state.activeConversationId} artifactRefreshKey={String(visibleMessages.length) + ":" + String(running)} message={message} answerActions={message.role === 'assistant' ? <AnswerToolbar message={message} chapter={chapters.find(item => item.messageId === message.id)} onFork={() => forkAnswer(message)} onPin={() => changeChapter(message.id, chapters.some(item => item.messageId === message.id) ? null : message.content.replace(/[#*`>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || '未命名章节')} /> : undefined} workspace={state.paths.workspace} onCopy={message.role === 'user' ? () => void copyUserMessage(message) : undefined} onAutomationDecision={message.automationProposal?.status === 'pending' ? (accepted) => void action(accepted ? '正在创建定时任务' : '正在忽略定时任务', async () => { const result = await window.stable.automations.decideProposal(state.activeConversationId, message.id, accepted); updateAgent(result.agent); updateAutomations(result.automations) }) : undefined} onPreviewAttachment={previewMessageAttachment} onPreviewImages={openImageViewer} onPreviewLink={openConversationPreview} key={turn.key} /> : <RunTrace key={turn.key} items={turn.live!.items} status={turn.live!.status} startedAt={turn.live!.startedAt} endedAt={turn.live!.endedAt} streaming={turn.live!.streaming} /> })}

        </div>
      </div>
      {removeTarget&&<RemoveDialog key={removeTarget.kind+removeTarget.id} kind={removeTarget.kind} name={removeTarget.name} onClose={()=>setRemoveTarget(undefined)} onConfirm={async()=>{
        const result=removeTarget.kind==='project'?await window.stable.projects.manage(removeTarget.id,'remove'):await window.stable.agent.remove(removeTarget.id)
        updateAgent(result)
        setModelStatus(result.syncNotice||'')
      }}/>}
      {editingId && <RenameConversationDialog key={editingId} title={editingTitle} suggestion={editingId === state.activeConversationId ? (state.messages.find(item => item.role === 'user')?.content || '').replace(/\s+/g, ' ').slice(0, 32) : ''} onClose={() => setEditingId('')} onSave={async title => {
        const result = await window.stable.agent.rename(editingId, title)
        updateAgentForConversation(result, editingId)
      }}/>}
      {activeConversation.sourceType === 'workbuddy' ? <div className="composer"><ImportedConversationContinuation key={activeConversation.id} conversationId={activeConversation.id} onOpen={agent => { updateAgent(agent); openConversation() }} /></div> : <div className="composer" data-question={Boolean(pendingQuestion) || undefined}>
        {active && pendingQuestion?.id && <div hidden={hiddenQuestionId === pendingQuestion.id}><ClarificationCard key={pendingQuestion.id} question={pendingQuestion} onClose={() => setHiddenQuestionId(pendingQuestion.id)} onSend={async response => {
          const result = await outbox.reply(activeConversation.id, { prompt: response.source === 'custom' ? response.text! : pendingQuestion.options[response.option!].label, attachments: [], references: [], clarificationResponse: response }, false)
          if (result.error) throw new Error(result.error)
        }} /></div>}
        {pendingQuestion?.id && hiddenQuestionId === pendingQuestion.id && <div className="clarification-collapsed"><span>需要用户回答</span><button type="button" onClick={() => setHiddenQuestionId('')}>打开问题</button></div>}
        {pendingQuestion && !pendingQuestion.id && <p className="clarification-waiting">等待你补充信息，回复后继续原任务。</p>}
        {conversationIsEmpty && !running && <ProjectSelector projects={state.projects||[]} projectId={activeConversation.projectId} conversationId={state.activeConversationId} running={running} onUpdate={updateAgent} onOverlayChange={setProjectOverlay}/>}

        {(running || awayFromBottom) && <button className="conversation-bottom" type="button" onClick={scrollToBottom} aria-label={running ? '任务运行中，回到对话底部' : '回到对话底部'} title="回到对话底部">
          {running ? <span className="conversation-bottom-dots" aria-hidden="true"><i /><i /><i /></span> : <ChevronDown size={20} aria-hidden="true" />}
        </button>}
        {queue.items.length > 0 && <section className="message-queue" aria-label="待发送消息">
          <div className="queue-heading"><span role="status" aria-atomic="true">{queue.paused ? '排队已暂停' : '排队中'} · {queue.items.length} 条</span>
            {queue.paused && <button type="button" disabled={Boolean(pendingQuestion) || queueEdit?.conversationId === activeConversation.id} onClick={() => outbox.resume(activeConversation.id)}>继续队列</button>}
          </div>
          <div className="queue-items">{queue.items.map((item) => <div className="queue-item" key={item.id}>
            {queueEdit?.conversationId === activeConversation.id && queueEdit.id === item.id ? <div className="queue-edit">
              <textarea aria-label="编辑排队消息" value={queueEdit.text} autoFocus onChange={(event) => setQueueEdit({ ...queueEdit, text: event.target.value })} onKeyDown={(event) => { if (event.key === 'Escape') setQueueEdit(undefined) }} />
              <div><button type="button" disabled={!queueEdit.text.trim()} onClick={() => { outbox.edit(activeConversation.id, item.id, { ...item.payload, prompt: queueEdit.text.trim() }); setQueueEdit(undefined) }}>保存</button><button type="button" onClick={() => setQueueEdit(undefined)}>取消</button></div>
            </div> : <>
              <div className="queue-copy"><p>{item.payload.prompt}</p>
                <DesignMessageParameters value={item.payload.design}/>
                {(item.payload.attachments.length > 0 || item.payload.references.length > 0) && <small>{[...item.payload.attachments, ...item.payload.references].map((resource) => resource.name).join(' · ')}</small>}
                {item.error && taskErrorMessage(errorMessage(item.error)) && <small className="queue-error" role="alert">{errorMessage(item.error)}</small>}
              </div>
              <div className="queue-actions">
                <button type="button" disabled={Boolean(item.payload.design) || Boolean(pendingQuestion) || item.status === 'steering' || queue.items.some((entry) => entry.status === 'steering')} onClick={() => void outbox.steer(activeConversation.id, item.id)} title={item.payload.design ? 'Design 参数随排队消息在下一轮生效' : '立即补充到当前任务，不中断当前执行；下一模型步骤读取'}>
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
          <div className="composer-box" data-design={imageMode || undefined} data-design-chat={designMode && !imageMode || undefined} data-compact-question={Boolean(pendingQuestion) && !hasComposerContent && !composerError || undefined}>
            {annotationAttachments.length > 0 && <div className="composer-annotations" aria-label="待发送注释"><span>{annotationAttachments.length} 条注释</span>{annotationAttachments.map(item=><div className="composer-annotation" key={item.path}><details><summary><img src={item.annotation!.thumbnail} alt="注释页面缩略图"/><code>{item.annotation!.tag}</code><span>{item.annotation!.text}</span></summary><div className="annotation-detail"><blockquote>{item.annotation!.text}</blockquote><p>{item.annotation!.comment}</p><small>{item.annotation!.source}</small></div></details><button type="button" onClick={()=>removeAttachment(item)} aria-label={`移除注释 ${item.annotation!.comment}`}><X size={14}/></button></div>)}</div>}
            {(imageAttachments.length > 0 || imageMode) && <div className="composer-image-selections" aria-label="待发送图片">
              {imageAttachments.map((item, index) => <div className="composer-image-selection" key={item.path}>
                <button className="composer-image-preview" type="button" onClick={() => openImageViewer(imageAttachments, index)} aria-label={`预览图片 ${item.name}`}><AttachmentImage item={item} /></button>
                <button className="composer-image-remove" type="button" onClick={() => removeAttachment(item)} aria-label={`移除图片 ${item.name}`}><X size={14} aria-hidden="true" /></button>
              </div>)}
              {imageMode && <button type="button" className="design-add-reference" aria-label="添加参考图片" onClick={()=>attachmentInputRef.current?.click()}><Plus size={21}/><span>参考图</span></button>}
            </div>}
            {(selectedReferences.length > 0 || documentAttachments.length > 0) && <div className="composer-selections" aria-label="本次引用的资源与文件">
              {selectedReferences.map((item) => <div className="selection-chip" data-kind={item.kind} key={`${item.kind}:${item.id}`} title={item.name}><ReferenceIcon kind={item.kind} /><strong>{item.name}</strong><button type="button" onClick={() => toggleReference(item)} aria-label={`移除引用 ${item.name}`}><X size={13} /></button></div>)}
              {documentAttachments.map((item) => <ConversationFileCard compact item={{ name: item.name, path: item.path, detail: item.type.toUpperCase() }} onOpen={() => openConversationPreview({ kind: 'file', value: item.path, title: item.name })} onRemove={() => removeAttachment(item)} key={item.path} />)}
            </div>}
            {cloudAccessHint(state.cloud.status) && activeModel?.providerId !== 'chatgpt' && <div className="cloud-login-notice" role="status"><span>{cloudAccessHint(state.cloud.status)}</span><button type="button" className="text-button" onClick={onOpenAccount}>账号设置</button></div>}
            {composerError && <div className="composer-error" role="alert"><span>{composerError}</span><button type="button" onClick={() => setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' }))} aria-label="关闭发送错误"><X size={16} /></button></div>}
            <span className="sr-only" role="status" aria-live="polite">{attachmentStatus}</span>
            <label className="sr-only" htmlFor="agent-prompt">给 Stable 一个任务</label>
            <div className="composer-prediction-field" data-prediction={Boolean(prediction.text) || undefined} title={prediction.text || undefined}>
            <SkillQuickPicker input={promptRef} prompt={prompt} scope={state.activeConversationId} skills={enabledSkills} selected={selectedReferences.filter(item=>item.kind==='skill').map(item=>item.id)} onPrompt={setPrompt} onSelect={skill=>{if(!selectedReferences.some(item=>item.kind==='skill'&&item.id===skill.id))toggleReference({id:skill.id,kind:'skill',name:skill.name,type:'skill',size:0})}}/>
            {imageMode && /@$/.test(prompt) && <div className="design-inline-references" role="listbox" aria-label="参考图引用">{imageAttachments.length ? imageAttachments.map((item,index)=><button type="button" role="option" aria-selected="false" key={item.path} onClick={()=>insertDesignReference(index)}>图{index+1} · {item.name}</button>) : <span>先添加参考图片</span>}</div>}
            {prediction.text && <div className="composer-prediction-overlay" aria-hidden="true">{prediction.text}</div>}
            {prediction.text && <span className="sr-only" id="prediction-help">建议：{prediction.text}。按 Tab、右方向键或回车采纳，再次发送才会执行。Esc 关闭建议。</span>}
            <textarea ref={promptRef} id="agent-prompt" value={prompt} aria-describedby={prediction.text ? 'prediction-help' : undefined} onCompositionStart={prediction.onCompositionStart} onCompositionEnd={prediction.onCompositionEnd} onKeyUp={prediction.onKeyUp} onBlur={prediction.onBlur} onPaste={handlePromptPaste} onChange={(event) => { prediction.dismiss(); setPrompt(event.target.value); if (composerError) setComposerErrorMap((current) => ({ ...current, [state.activeConversationId]: '' })) }} onKeyDown={(event) => {
              if (prediction.handleKeyDown(event)) return
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                if (event.altKey) {
                  event.preventDefault()
                  const input = event.currentTarget, start = input.selectionStart, end = input.selectionEnd
                  setPrompt(input.value.slice(0, start) + '\n' + input.value.slice(end))
                  window.requestAnimationFrame(() => { input.setSelectionRange(start + 1, start + 1) })
                } else if (!event.shiftKey) { event.preventDefault(); send() }
              }
            }} placeholder={prediction.text ? '' : pendingQuestion ? '回答上方问题…' : running ? '继续输入，发送后将排队等待…' : imageMode ? '结合参考图片，描述你想创作的画面；使用 @ 引用图片…' : '给 Stable 一个任务，或选择、拖入、粘贴图片与文件'} />
            </div>
            <div className="composer-actions">
              {designMode && <DesignControls mode={designInputMode} onModeChange={changeDesignMode} value={design} onChange={changeDesign} references={imageAttachments.map(item=>item.name)} onReference={insertDesignReference}/>}
              <div className="composer-tools">
                <input ref={attachmentInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.yaml,.yml,.html,.log,.xml,.pdf,.docx,.pptx,.xlsx,.xls,.zip" onChange={(event) => { const files = Array.from(event.target.files || []); addAttachments(files.map((file) => window.stable.files.path(file)).filter(Boolean)); event.target.value = '' }} />
                <details className="composer-menu composer-add-menu" ref={addMenuRef}>
                  <summary className="composer-tool" aria-label="添加附件与内容"><Plus size={20} aria-hidden="true"/></summary>
                  <div className="composer-popover composer-add-popover" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(addMenuRef.current)addMenuRef.current.open=false;addMenuRef.current?.querySelector<HTMLElement>('summary')?.focus()}}}>
                    <div className="composer-add-heading">添加</div>
                <button className="composer-tool" type="button" onClick={() => { if(addMenuRef.current)addMenuRef.current.open=false; attachmentInputRef.current?.click() }} aria-label="添加图片或文件"><Paperclip size={18} aria-hidden="true" /><span>图片和文件</span></button>
                <details className="composer-menu skill-menu" ref={skillMenuRef}>
                  <summary className="composer-tool" aria-label="选择 Skill"><Braces size={18} aria-hidden="true" /><span>Skill 技能</span><ChevronRight size={14}/></summary>
                  <div className="composer-popover">
                    <div className="composer-popover-head"><strong>选择 Skills</strong><span>可多选</span></div><label className="skill-menu-search"><Search size={16}/><input aria-label="搜索技能" placeholder="搜索技能" value={skillSearch} onChange={e=>setSkillSearch(e.target.value)} /></label>
                    {searchedSkills.length ? searchedSkills.map((item) => { const active = selectedReferences.some((entry) => entry.kind === 'skill' && entry.id === item.id); return <button type="button" className="composer-option" data-active={active || undefined} aria-pressed={active} key={item.id} onClick={() => toggleReference({ id: item.id, kind: 'skill', name: item.name, size: new Blob([item.content || '']).size, type: 'skill' })}><span><strong>{item.name}</strong><small>{item.invocationMode === 'auto' ? '自动匹配 · ' : ''}{item.description || '手动选择后在当前对话持续生效'}</small></span></button> }) : <p className="composer-menu-empty">{skillSearch ? '没有匹配的技能。' : '还没有已启用的 Skill。'}</p>}
                    <button className="composer-install-skill" type="button" onClick={addSkillFolder}><FolderInput size={15} />安装新的 Skill 文件夹</button>
                  </div>
                </details>
                <details className="composer-menu team-share-menu" ref={teamMenuRef}>
                  <summary className="composer-tool" aria-label="发送当前对话给 Team"><AtSign size={18} aria-hidden="true" /><span>分享给 Team</span><ChevronRight size={14}/></summary>
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
                  <summary className="composer-tool" aria-label={`选择引用资源${selectedReferences.filter((item) => item.kind !== 'skill').length ? `，已选择 ${selectedReferences.filter((item) => item.kind !== 'skill').length} 个` : ''}`}><Database size={18} aria-hidden="true" /><span>引用本地资源</span><ChevronRight size={14}/></summary>
                  <div className="composer-popover">
                    <div className="composer-popover-head"><strong>引用本地资源</strong><span>可多选</span></div>
                    <ResourceGroup title="脚本" items={scripts.map((item) => ({ id: item.id, kind: 'script' as const, name: item.name, size: new Blob([item.content || '']).size, type: item.extension || 'script' }))} selected={selectedReferences} toggle={toggleReference} />
                    {!scripts.length && <p className="composer-menu-empty">还没有可引用的脚本。</p>}
                  </div>
                </details>
                  </div>
                </details>
              <details className="composer-menu permission-menu" ref={permissionMenuRef} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector<HTMLElement>('summary')?.focus() } }}>
                <summary><Shield size={17} /><span>{activePermission.label}</span><ChevronDown size={14} /></summary>
                <div className="composer-popover permission-popover">
                  <div className="composer-popover-head"><strong>审批操作</strong></div>
                  {PERMISSION_OPTIONS.map((item) => <PermissionOption item={item} selected={item.id === activeConversation.permissionMode} key={item.id} onSelect={() => configurePermission(item.id)} />)}
                </div>
              </details>
              </div>
              {!imageMode && <ContextUsageButton key={state.activeConversationId + ':' + activeModel?.id} conversationId={state.activeConversationId} modelId={activeModel?.id} running={running} />}
              {!designMode && <div className="model-effort-control">
              <details className="composer-menu model-menu capability-menu" ref={modelMenuRef} onToggle={event=>{if(!event.currentTarget.open)setShowModelList(false)}}>
                <summary aria-label={`模型与思考强度：${activeModel?.displayName.toUpperCase() || '尚未配置'} ${capabilityOptions.length ? activeCapability.label : ''}`}>{activeModel && <ModelProviderIcon model={activeModel} />}<span>{activeModel?.displayName.toUpperCase() || '配置模型'}</span>{capabilityOptions.length > 0 && <span className="current-effort">{activeCapability.label}</span>}<ChevronDown size={14} aria-hidden="true"/></summary>
                <div className="composer-popover model-popover effort-popover" data-models={showModelList || undefined} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(showModelList)setShowModelList(false);else if(modelMenuRef.current)modelMenuRef.current.open=false;modelMenuRef.current?.querySelector<HTMLElement>('summary')?.focus()}}}>
                  {showModelList ? <><button type="button" className="effort-back" aria-label="返回思考强度" title="返回" onClick={()=>setShowModelList(false)}><ArrowLeft size={14}/></button>
                  {state.models.items.length ? <div className="model-options-scroll"><fieldset className="model-options"><legend className="sr-only">当前对话使用的模型</legend>{state.models.items.map((item) => {
                    const selected = item.id === activeModel?.id
                    return <label className="model-option" data-active={selected || undefined} key={item.id}>
                      <input type="radio" name={`conversation-model-${activeConversation.id}`} value={item.id} checked={selected} disabled={switchingModel} onChange={() => configureModel(item.id)} />
                      <ModelProviderIcon model={item} />
                      <span className="model-option-copy"><strong>{item.displayName.toUpperCase()}</strong>{item.model.toLowerCase() === 'deepseek-flash' && <small className="model-version-label">4.1</small>}<span className="model-free-badge"><Gift size={12} aria-hidden="true" />{item.providerId === 'chatgpt' ? '订阅额度' : '免费使用'}</span>{['glm-5.3-flashx', 'deepseek-flash', 'glm-5.3-flash'].includes(item.model.toLowerCase()) && <span className="model-recommended-badge">推荐</span>}</span>
                      <span className="model-option-mark" aria-hidden="true">{selected && <Check size={15} />}</span>
                    </label>
                  })}</fieldset></div> : <p className="composer-menu-empty">{cloudAccessHint(state.cloud.status) ? <>登录后可选择云端模型。<button type="button" className="text-button" onClick={onOpenAccount}>账号设置</button></> : '还没有可用模型，请先在设置页添加。'}</p>}

                  </> : <EffortSlider key={state.activeConversationId+':'+activeModel?.id} options={capabilityOptions} value={activeCapability.id as AgentCapability} model={activeModel?.displayName.toUpperCase() || ''} onChange={value=>configure(value, [])} onModels={()=>setShowModelList(true)}/>}
                </div>
              </details>
              </div>}
              <button className={showComposerStop ? 'composer-stop' : 'composer-send'} type="button" onClick={showComposerStop ? stopConversation : send} disabled={!hasComposerContent && !running && !pendingQuestion} aria-label={showComposerStop ? '停止执行' : (hasComposerContent && (running || queue.items.length) ? '加入排队' : '发送任务')} title={showComposerStop ? '停止执行' : (hasComposerContent ? (running ? '加入队列，当前任务结束后自动发送' : '发送任务') : '请输入内容或添加附件后发送')}>
                <span className="composer-action-visual" aria-hidden="true">
                  {showComposerStop ? <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor" /></svg> : <ArrowUp size={20} aria-hidden="true" />}
                </span>
              </button>
              <span className="sr-only" role="status" aria-live="polite">{modelStatus}</span>
            </div>
          </div>
        </DropTarget>}
      </div>}
    </div>
    {browserPanel?.open && active && <BrowserPanel obscured={Boolean(editingId || imageViewer || projectOverlay || removeTarget || conversationMenuId || projectMenuId)} key={state.activeConversationId} conversationId={state.activeConversationId} initialTarget={browserPanel.target} onEditRequest={acceptHtmlEditRequest} onClose={()=>setBrowserPanels(current=>({...current,[state.activeConversationId]:{...current[state.activeConversationId],open:false}}))} onImport={value=>setAttachmentMap(current=>({...current,[state.activeConversationId]:[...(current[state.activeConversationId]||[]),value]}))}/>}

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

function ConversationTitle({ title }: { title: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => { element.dataset.overflow = String(element.scrollWidth > element.clientWidth) }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [title])
  return <strong ref={ref} title={title} className="conversation-title">{title}</strong>
}

function MessageTurn({ designMode=false, onCopyReply, turnMessages, live, waiting, conversationId, artifactRefreshKey, message, answerActions, workspace, onCopy, onAutomationDecision, onPreviewAttachment, onPreviewImages, onPreviewLink }: { designMode?:boolean; onCopyReply?: (message: MessageItem) => void; turnMessages?: MessageItem[]; live?: LiveConversationTurn; waiting?: boolean; conversationId: string; artifactRefreshKey: string; message: MessageItem; answerActions?: ReactNode; workspace: string; onCopy?: () => void; onAutomationDecision?: (accepted: boolean) => void; onPreviewAttachment?: (item: MessageAttachmentItem) => void; onPreviewImages?: (items: ViewerImageItem[], index: number) => void; onPreviewLink?: (target: Omit<ConversationPreviewTarget, 'requestId'>) => void }) {
  if (message.role === 'user') return <div data-message-id={message.id} data-message-seq={message.seq}><UserTurn content={message.content} design={message.trace?.find(item=>item.id==='design-request')?.designRequest} attachments={message.attachments} onCopy={onCopy} onPreviewAttachment={onPreviewAttachment} onPreviewImages={onPreviewImages} /></div>
  const items = conversationTurnTrace(turnMessages || [message], live)
  const status = live?.status || savedTraceStatus(message.trace || [])
  const startedAt = Math.min(...items.map(item => item.startedAt ?? item.time), live?.startedAt ?? Infinity)
  return <article className="assistant-turn" data-message-id={message.id} data-message-seq={message.seq}>
    {(turnMessages || []).filter(item => item.id !== message.id).map(item => <span key={item.id} data-message-id={item.id} data-message-seq={item.seq} />)}
    {items.length || live || waiting ? <RunTrace onCopyReply={onCopyReply} items={items} status={status} waiting={waiting} startedAt={Number.isFinite(startedAt) ? startedAt : undefined} endedAt={live?.status === 'running' ? undefined : live?.endedAt} streaming={live?.streaming} finalContent={live ? undefined : message.content} onPreviewAttachment={onPreviewAttachment} onPreviewImages={onPreviewImages} /> : null}
    {!live && !isClarificationQuestion(message) && <div className="assistant-answer">
      <div className="answer-content"><ArtifactLinks designMode={designMode} onPreviewImages={onPreviewImages} attachments={message.attachments} conversationId={conversationId} refreshKey={artifactRefreshKey} content={message.content} workspace={workspace} onPreview={onPreviewLink} /></div>
      {(message.attachments || []).filter(item => item.path && !(designMode && attachmentIsImage(item)) && !message.content.includes(item.path)).map(item => <ConversationFileCard key={item.path} compact item={{name:item.name,path:item.path!,detail:item.type || ''}} onOpen={() => onPreviewAttachment?.(item)} />)}
    </div>}
    {!live && !waiting && !isClarificationQuestion(message) && answerActions}
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

function ConversationFileCard({ item, onOpen, compact = false, onRemove }: { item: ConversationFileItem; onOpen: () => void; compact?: boolean; onRemove?: () => void }) {
  const fileMenu = useFileContextMenu({ path: item.path, name: item.name, onOpen })
  const extension = item.name.split('.').pop()?.toLowerCase() || ''
  const isMarkdown = compact && /^(md|markdown|mdx)$/.test(extension)
  const isSpreadsheet = /^(xlsx?|xlsm|xlsb|csv|tsv|ods)$/.test(extension)

  return <div className="conversation-file-card-shell" data-compact={compact || undefined} data-pill={isMarkdown || undefined} data-removable={Boolean(onRemove) || undefined}>
    <button className="conversation-file-card" type="button" onClick={onOpen} {...fileMenu.handlers} title={item.path} aria-label={`在 Stable 内置浏览器预览 ${item.name}`} aria-haspopup="menu">
      <span className="conversation-file-icon" data-spreadsheet={compact && isSpreadsheet || undefined}>{compact && isSpreadsheet ? <FileSpreadsheet size={23} aria-hidden="true" /> : <FileText size={isMarkdown ? 14 : 18} aria-hidden="true" />}</span>
      <span className="conversation-file-copy"><strong>{item.name}</strong>{!isMarkdown && <small>{compact ? extension.toUpperCase() || item.detail : item.detail}</small>}</span>
      {!compact && <ChevronRight size={16} aria-hidden="true" />}
    </button>
    {onRemove && <button className="attachment-card-remove" type="button" onClick={onRemove} aria-label={`移除附件 ${item.name}`}><X size={14} aria-hidden="true" /></button>}
    {fileMenu.menu}{fileMenu.error}
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
  const pattern = /(?:file:\/\/\/)?([a-z]:[\\/][^\r\n<>|"?*]*?\.[a-z0-9]{1,15})(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)?(?=$|[\s`)>\]}，。；、])/gi
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

function ArtifactLinks({ designMode=false, onPreviewImages, attachments=[], content, workspace, conversationId, refreshKey = '', onPreview }: { designMode?:boolean; onPreviewImages?:(items:ViewerImageItem[],index:number)=>void; attachments?:MessageItem['attachments']; content: string; workspace: string; conversationId: string; refreshKey?: string; onPreview?: (target: Omit<ConversationPreviewTarget, 'requestId'>) => void }) {
  const requestKey = JSON.stringify([content, workspace, conversationId, refreshKey])
  const [verified, setVerified] = useState<{ key: string; paths: string[] }>({ key: '', paths: [] })
  useEffect(() => {
    let active = true; let revision = 0
    const candidates = localArtifactPaths(content, workspace).map(item => item.path)
    const refresh = async () => {
      const current = ++revision
      try {
        const paths = candidates.length ? await window.stable.preview.existingFiles(conversationId, candidates) : []
        if (active && current === revision) setVerified({ key: requestKey, paths })
      } catch { if (active && current === revision) setVerified({ key: requestKey, paths: [] }) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [content, workspace, conversationId, requestKey])
  const available = new Set(verified.key === requestKey ? verified.paths.map(path => path.replace(/\//g, '\\').toLowerCase()) : [])
  const fileAvailability = new Map(localArtifactPaths(content, workspace).map(item => { const key = item.path.replace(/\//g, '\\').toLowerCase(); return [key, available.has(key)] }))
  const images = designMode ? [...new Map([...localArtifactPaths(content, workspace), ...attachments.filter(item=>item.path).map(item=>({name:item.name,path:item.path!}))].filter(item=>/\.(png|jpe?g|webp|gif|bmp)$/i.test(item.path)).map(item=>[item.path.toLowerCase(),item])).values()] : []
  return <><MarkdownContent content={content} onPreview={onPreview} fileAvailability={fileAvailability} hideImageFiles={designMode ? new Set(images.map(item=>item.path.replace(/\//g,'\\').toLowerCase())) : undefined}/>{images.length>0&&<div className="design-delivery-gallery">{images.map((item,index)=><DesignDeliveryImage key={item.path} item={item} onOpen={()=>onPreviewImages?.(images,index)}/>)}</div>}</>
}

function UserTurn({ content, design, attachments = [], pending = false, onCopy, onPreviewAttachment, onPreviewImages }: { content: string; design?: DesignRequest; attachments?: MessageItem['attachments']; pending?: boolean; onCopy?: () => void; onPreviewAttachment?: (item: MessageAttachmentItem) => void; onPreviewImages?: (items: ViewerImageItem[], index: number) => void }) {
  const reply = clarificationDisplay(content)
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
      {documentFiles.length > 0 && <div className="conversation-file-list message-file-cards" aria-label="随消息上传的文件">
        {documentFiles.map((item, index) => <ConversationFileCard compact item={{ name: item.name, path: item.path!, detail: `上传附件 · ${item.type.toUpperCase()} · ${formatBytes(item.size)}` }} onOpen={() => onPreviewAttachment?.(item)} key={`${item.path}-${index}`} />)}
      </div>}
      {staticAttachments.length > 0 && <div className="message-attachments" aria-label="随消息发送的引用">
        {staticAttachments.map((item, index) => <div className="selection-chip" data-kind={item.kind} key={`${item.kind}-${item.name}-${index}`} title={`${item.name} · ${formatBytes(item.size)}`}>{item.kind === 'attachment' ? <FileText size={14} aria-hidden="true" /> : <ReferenceIcon kind={item.kind} />}<strong>{item.name}</strong></div>)}
      </div>}
      {content && <div className="user-bubble" data-clarification={Boolean(reply) || undefined}><div className="turn-label">你</div>{reply && <div className="user-question" title={reply.question}>{reply.question}</div>}<p>{reply?.answer ?? content}</p></div>}
      <DesignMessageParameters value={design}/>
      {onCopy && content && <div className="user-turn-actions"><button type="button" onClick={onCopy} aria-label="复制这条消息" title="复制文字"><Copy size={15} aria-hidden="true" /></button></div>}
    </div>
  </article>
}

// Reveal only text already received; keep the pace responsive for large chunks.
function useStreamingText(content: string, live: boolean, followLines = false) {
  const animate = live && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [visible, setVisible] = useState(live ? '' : content)
  const received = useRef(content)
  received.current = content
  useEffect(() => {
    if (!animate) { setVisible(received.current); return }
    const timer = window.setInterval(() => setVisible(current => {
      const target = received.current
      const prefix = target.startsWith(current) ? current : ''
      const remaining = Array.from(target.slice(prefix.length))
      const nextLine = followLines ? remaining.indexOf('\n') : -1
      const count = Math.max(1, Math.ceil(remaining.length / 4))
      return prefix + remaining.slice(0, nextLine >= 0 ? Math.min(count, nextLine + 1) : count).join('')
    }), 24)
    return () => window.clearInterval(timer)
  }, [animate, followLines])
  return animate ? visible : content
}

function TraceText({ content, live = false }: { content: string; live?: boolean }) {
  const visible = useStreamingText(content, live)
  const textId = useId()
  return <div className="trace-text" data-live={live || undefined}>
    <div className="trace-text-content">{renderInline(visible, textId)}{live && <span className="trace-stream-cursor" aria-hidden="true" />}</div>
  </div>
}

function TraceToolIcon({ item }: { item: AgentTraceItem }) {
  const Icon = { edit: SquarePen, write: FilePlus2, move: FolderInput, delete: Trash2, terminal: Terminal, table: FileSpreadsheet, read: BookOpenText, search: Search, browser: Globe, tool: Wrench }[traceToolIcon(item)]
  return <Icon size={15} aria-hidden="true" data-tool-icon={traceToolIcon(item)} />
}
function TraceToolPreview({ item }: { item: AgentTraceItem }) {
  const visible = useStreamingText(traceToolInput(item), true, true)
  const line = visible.split(/\r?\n/).filter(line => line.trim()).at(-1) || '…'
  return <span className="trace-tool-preview trace-running-label" title={line}>{line}</span>
}

function TraceAction({ item, status, agentName }: { item: AgentTraceItem; status: AgentTraceStatus; agentName?: string }) {
  const itemStatus = traceItemStatus(item, status)
  const command = useStreamingText(traceCommand(item), itemStatus === 'running' && item.kind === 'tool')
  const statusLabel = item.status === 'running' && status !== 'running'
    ? (status === 'cancelled' ? '已取消' : '已结束')
    : itemStatus === 'running' ? '运行中' : itemStatus === 'completed' ? '已完成' : itemStatus === 'cancelled' ? '已取消' : '执行失败'
  const Icon = item.entity === 'agent' ? Bot : item.kind === 'approval' ? ShieldCheck : item.kind === 'tool' ? Wrench : CircleAlert
  return <details className="trace-action" data-status={itemStatus}>
    <summary>
      {item.kind === 'tool' ? <TraceToolIcon item={item} /> : <Icon size={15} aria-hidden="true" />}
      <span className={`trace-command${itemStatus === 'running' && item.kind === 'tool' ? ' trace-running-label' : ''}`}>{agentName && item.entity !== 'agent' ? `${agentName} · ` : ''}{item.kind === 'approval' && item.reason ? item.reason : command}</span>
      {item.kind === 'approval' && <span className="trace-action-state">{statusLabel}</span>}
    </summary>
    <div className="trace-action-detail">
      {item.inputDetail && <pre>{item.inputDetail}</pre>}
      {item.kind !== 'tool' && item.detail && item.detail !== item.inputDetail && <pre>{item.detail}</pre>}
      {item.kind === 'tool' && !item.inputDetail && <pre>{traceCommand(item)}</pre>}
      {item.kind !== 'tool' && !item.detail && !item.inputDetail && <p>{statusLabel}，没有更多详情。</p>}
    </div>
  </details>
}

function RunTrace({ items, status, startedAt, endedAt, streaming, finalContent, waiting = false, onCopyReply, onPreviewAttachment, onPreviewImages }: { onCopyReply?: (message: MessageItem) => void; waiting?: boolean; onPreviewAttachment?: (item: MessageAttachmentItem) => void; onPreviewImages?: (items: ViewerImageItem[], index: number) => void; items: AgentTraceItem[]; status: AgentTraceStatus; active?: boolean; startedAt?: number; endedAt?: number; streaming?: { id: string; time: number; content: string }; finalContent?: string }) {
  const firstEventAt = useMemo(() => items.length ? Math.min(...items.map((item) => item.startedAt ?? item.time)) : Date.now(), [items])
  const lastEventAt = useMemo(() => items.length ? Math.max(...items.map((item) => item.time)) : Date.now(), [items])
  const timerStartedAt = startedAt ?? firstEventAt
  const timerEndedAt = waiting ? undefined : endedAt ?? (status === 'running' ? undefined : lastEventAt)
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const timelineId = useId()
  const showTimeline = waiting || status === 'running' || expanded
  useEffect(() => { setExpanded(false) }, [status])
  const timeline = useMemo(() => {
    const entries = streaming?.content && !items.some((item) => item.id === streaming.id)
      ? [...items, { id: streaming.id, runId: '', kind: 'reasoning' as const, eventType: 'agent/answer' as const, title: '', status: 'running' as const, time: streaming.time, content: streaming.content }]
      : items
    return buildTraceTimeline(entries, finalContent)
  }, [items, streaming, finalContent])
  const latestTool = latestTraceTool(items)
  const liveTool = status === 'running' && latestTool?.status === 'running' ? latestTool : undefined
  const groupedTimeline = useMemo(() => groupTraceTimeline(timeline), [timeline])
  const pendingCount = timeline.filter(item => item.kind === 'approval' && traceItemStatus(item, status) === 'running').length
  const agentNames = new Map(items.filter((item) => item.entity === 'agent' && item.sessionId).map((item) => [item.sessionId!, item.title]))
  useEffect(() => {
    setNow(Date.now())
    if (status !== 'running' && !waiting) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status, waiting, timerStartedAt])
  const elapsed = formatElapsedTime(Math.max(0, (timerEndedAt ?? now) - timerStartedAt))
  return <section className="run-trace" data-status={status}>
    <div className="trace-header"><button type="button" className="trace-summary" disabled={status === 'running' || waiting} aria-expanded={showTimeline} aria-controls={timelineId} aria-label={waiting ? '等待你补充信息' : status === 'running' ? '正在执行' : `${expanded ? '收起' : '展开'}思考过程`} onClick={() => setExpanded(current => !current)}>
      <span className="trace-elapsed" role="timer" aria-label={`执行时长 ${elapsed}`}>{status !== 'running' && !waiting && '用时 '}{elapsed}</span>
      {status !== 'running' && status !== 'completed' && <span className="trace-run-state">{status === 'failed' ? '任务受阻' : '已取消'}</span>}
      {pendingCount > 0 && <span className="trace-pending">{pendingCount} 项待审批</span>}
      {status !== 'running' && !waiting && <ChevronRight size={14} className="trace-chevron" data-open={expanded} aria-hidden="true" />}
    </button>
    </div>
    <div className="trace-timeline" id={timelineId} hidden={!showTimeline}>
      {showTimeline && <>
      {groupedTimeline.map(entry => {
        if (entry.kind === 'group') {
          const current = entry.items.find(item => item.id === liveTool?.id)
          return <details className="trace-group" key={entry.id}>
            <summary><TraceToolIcon item={current || entry.items.at(-1)!} /><span className="trace-group-label">{traceGroupLabel(entry.items, status)}</span>{current && <TraceToolPreview key={current.id} item={current} />}</summary>
            <div className="trace-group-items">{entry.items.map(item => <TraceAction key={item.id} item={item} status={status} agentName={item.parentSessionId ? agentNames.get(item.sessionId!) || '子 Agent' : undefined} />)}</div>
          </details>
        }
        const item = entry.item
        return item.clarificationReply ? <div key={entry.id} data-message-id={item.clarificationReply.id} data-message-seq={item.clarificationReply.seq}><UserTurn onCopy={() => onCopyReply?.(item.clarificationReply!)} content={item.clarificationReply.content} attachments={item.clarificationReply.attachments} onPreviewAttachment={onPreviewAttachment} onPreviewImages={onPreviewImages} /></div>
          : item.eventType === 'agent/answer'
          ? <TraceText key={entry.id} content={item.content!} live={status === 'running' && item.id === streaming?.id} />
          : <TraceAction key={entry.id} item={item} status={status} agentName={item.parentSessionId ? agentNames.get(item.sessionId!) || '子 Agent' : undefined} />
      })}
      {!timeline.length && <p className="trace-waiting">{waiting ? '等待你补充信息…' : status === 'running' ? '正在处理任务…' : '本轮没有可展示的过程说明或工具调用记录。'}</p>}
      </>}
    </div>
  </section>
}

function DesignDeliveryImage({item,onOpen}:{item:{name:string;path:string};onOpen:()=>void}) {
 const source=useAttachmentImageSource(item)
 const menu=useFileContextMenu({path:item.path,name:item.name,onOpen})
 return <div className="design-delivery-image"><button type="button" onClick={onOpen} {...menu.handlers} aria-label={`查看图片 ${item.name}`}>{source?<img src={source} alt={item.name}/>:<span>图片暂时无法加载：{item.name}</span>}</button>{menu.menu}{menu.error}</div>
}
