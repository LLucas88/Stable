export type Page = 'agent' | 'automations' | 'team' | 'data' | 'reports' | 'skills' | 'workflows' | 'knowledge' | 'mcp-cli' | 'market' | 'templates'
export type ThemeMode = 'dark' | 'light'

export interface WendingCliStatus {
  id: 'wending-cli'
  status: 'checking' | 'bundled' | 'ready' | 'unavailable'
  version: string
  detail: string
  login?: WendingLoginState
}

export interface WendingLoginState {
  phase: 'unknown' | 'signed_out' | 'code_sent' | 'choose_account' | 'choose_brand' | 'ready'
  channel: '0' | '1'
  detail: string
  mobileHint?: string
  brandLabel?: string
  accounts?: { id: string; label: string }[]
  brands?: { id: string; label: string }[]
  retryAfter?: number
  error?: { code: string; message: string }
}

export interface DataItem {
  id: string
  name: string
  type: string
  path: string
  size: number
  enabled: boolean
  createdAt: string
}

export interface KnowledgeItem {
  id: string
  name: string
  path: string
  size: number
  summary: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument extends KnowledgeItem { content: string }

export type ReportMode = 'builder' | 'source' | 'studio'
export type ReportIconName = 'chart' | 'database' | 'sparkles' | 'check'
export type ReportTextVariant = 'title' | 'heading' | 'body'

export interface ReportStudioProject {
  sections: Array<{ id: string; name: string }>
  blocks: Array<Record<string, unknown>>
  currentSectionId: string
}

export type ReportComponent =
  | { id: string; type: 'text'; variant: ReportTextVariant; content: string }
  | { id: string; type: 'table'; rows: string[][] }
  | { id: string; type: 'icon'; icon: ReportIconName; title: string; caption: string }
  | { id: string; type: 'studio'; project: ReportStudioProject }

export interface ReportItem {
  id: string
  name: string
  path: string
  mode: ReportMode
  components: ReportComponent[]
  html: string
  createdAt: string
  updatedAt: string
}

export interface ReportDraft {
  id?: string
  name: string
  mode: ReportMode
  components: ReportComponent[]
  html: string
}

export type DataLibraryCategory = 'collection' | 'cleaning' | 'processing'
export type DataLibraryKind = 'script' | 'markdown'
export type LibraryRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DataLibraryItem {
  id: string
  name: string
  category: DataLibraryCategory
  kind: DataLibraryKind
  extension: string
  description: string
  path: string
  content: string
  lastStatus: LibraryRunStatus
  lastOutput: string
  lastRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface ScriptLogEvent {
  itemId: string
  stream: 'stdout' | 'stderr' | 'stdin' | 'status'
  chunk: string
  status?: LibraryRunStatus
  time: number
}

export interface SkillItem {
  invocationMode?: 'manual'
  id: string
  name: string
  description: string
  path: string
  content: string
  enabled: boolean
  createdAt: string
}

export type WorkflowNodeType = 'data' | 'knowledge' | 'script' | 'skill' | 'ai' | 'output'
export type WorkflowOutputFormat = 'markdown' | 'pptx' | 'html' | 'xlsx'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  title: string
  position: { x: number; y: number }
  resourceId?: string
  instruction?: string
  outputName?: string
  outputFormat?: WorkflowOutputFormat
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

export interface WorkflowItem {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  updatedAt: string
  lastStatus?: string
}

export interface WorkflowRunEvent {
  workflowId: string
  nodeId: string
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  detail: string
  time: number
}

export interface WorkflowArtifact {
  nodeId: string
  path: string
  name: string
}

export interface MessageItem {
  seq?: number
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  trace?: AgentTraceItem[]
  attachments?: Array<Pick<AgentAttachment, 'name' | 'size' | 'type'> & { kind: AgentReferenceKind | 'attachment'; id?: string; path?: string }>
  automationProposal?: AutomationProposal
}

export type AutomationSchedule =
  | { type: 'once'; date: string; time: string }
  | { type: 'daily'; time: string }
  | { type: 'weekly'; time: string; weekdays: number[] }
  | { type: 'monthly'; time: string; day: number }

export interface AutomationDraft { id?: string; title: string; prompt: string; schedule: AutomationSchedule }
export interface AutomationProposal extends AutomationDraft { nextRunAt: string; status: 'pending' | 'accepted' | 'rejected'; automationId?: string }
export interface AutomationItem extends AutomationDraft {
  id: string; nextRunAt?: string; enabled: boolean; source: 'manual' | 'chat'; conversationId?: string
  lastStatus: string; lastRunAt?: string; createdAt: string; updatedAt: string
}
export interface AutomationRun { id: string; automationId: string; title: string; status: string; startedAt: string; endedAt?: string; result: string; error: string }
export interface AutomationTemplate { id: string; title: string; description: string; prompt: string; schedule: AutomationSchedule }
export interface AutomationState { items: AutomationItem[]; runs: AutomationRun[]; templates: AutomationTemplate[] }

export interface UpdateState {
  status: 'development' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
  currentVersion: string; availableVersion?: string; releaseName?: string; progress: number; error?: string
}

export type AgentReferenceKind = 'data' | 'skill' | 'script' | 'knowledge'

export interface AgentReference {
  id: string
  kind: AgentReferenceKind
  name: string
  size: number
  type: string
}

export type AgentCapability = 'auto' | 'none' | 'enabled' | 'low' | 'high' | 'max'
export type AgentPermissionMode = 'request' | 'auto' | 'full'

export interface MarketItem { avatar?: string; tags?: string[]; expertType?: 'individual' | 'team'; provenance?: string; sourceURL?: string; definitionCount?: number; dependencies?: string[]; definitionFiles?: { path: string; content: string; sha256: string }[]; id: string; name: string; kind: 'skill' | 'connector' | 'expert' | 'plugin'; pluginSkills?: { id: string; name: string; description: string }[]; group: string; description: string; content: string; version: string; updateURL?: string; builtin?: boolean; bundled?: boolean; source?: string; score?: number; compatibilityReason?: string; activationBlocked?: boolean; installed: boolean; enabled: boolean }
export interface ProjectItem { pinned?: boolean; id: string; name: string; rootPath: string; folders?: {path:string; identity:string}[] }

export interface ConversationItem {
  networkAccess?: boolean
  projectId?: string | null
  cwd?: string
  archivedAt?: string | null
  deletionState?: string
  id: string
  title: string
  capability: AgentCapability
  permissionMode: AgentPermissionMode
  modelId: string
  dataIds: string[]
  messageCount: number
  sourceType: 'local' | 'team'
  pinned: boolean
  sourceDeviceId?: string
  sourceDeviceName?: string
  createdAt: string
  updatedAt: string
}

export interface ConversationSearchResult {
  id: string
  title: string
  snippet: string
  messageCount: number
  updatedAt: string
}

export interface AgentState {
  draftPrompt?: string
  recoveryText?: string
  recoveryDiagnostic?: string
  syncNotice?: string
  deliveries?: {id:string;state:string;error?:string}[]
  paths?: { userData: string; workspace: string }
  draftReference?: AgentReference | null
  skillReferences?: AgentReference[]
  beforeCursor?: number | null
  projects?: ProjectItem[]
  catchAttachments?: AgentAttachment[]
  conversations: ConversationItem[]
  activeConversationId: string
  messages: MessageItem[]
}

export interface AgentAttachment {
  annotation?: { text: string; comment: string; source: string; tag: string; thumbnail: string }
  name: string
  path: string
  size: number
  type: string
  mediaType?: string
  previewUrl?: string
  draft?: boolean
}

export type AgentTraceKind = 'context' | 'reasoning' | 'tool' | 'status' | 'approval'
export type AgentTraceStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type AgentTraceEventType = 'agent/descriptor' | 'agent/start' | 'agent/end' | 'agent/answer' | 'tool/start' | 'tool/end'

export interface ClarificationQuestion {
  id: string
  status: 'waiting'
  question: string
  hint: string
  options: Array<{ label: string; description: string }>
}
export interface ClarificationResponse {
  id: string
  source: 'choice' | 'custom' | 'timeout' | 'skip' | 'close'
  option?: number
  text?: string
}
export interface ClarificationTimer { id: string; deadline: number; interacted: boolean }
export interface AgentTraceItem {
  clarification?: ClarificationQuestion
  id: string
  runId: string
  kind: AgentTraceKind
  title: string
  detail?: string
  content?: string
  inputDetail?: string
  startedAt?: number
  status: AgentTraceStatus
  time: number
  conversationId?: string
  eventType?: AgentTraceEventType
  entity?: 'agent' | 'tool'
  sessionId?: string
  parentSessionId?: string
  depth?: number
  mode?: 'one-shot' | 'continuable'
  provider?: string
  requestId?: string
  toolName?: string
  reason?: string
  danger?: boolean
  approvalRisk?: 'safe' | 'unknown' | 'high'
  automaticApproval?: boolean
  approvalCategory?: string
}

export interface AgentAnswerDeltaEvent {
  id: string
  runId: string
  kind: 'answer'
  title: 'Stable'
  status: 'running'
  time: number
  conversationId: string
  eventType: 'agent/answer-delta'
  delta: string
  turn: number
  step: number
}

export type AgentEvent = AgentTraceItem | AgentAnswerDeltaEvent

export interface ModelProfile {
  reasoningOptions?: Array<{ id: AgentCapability; label: string }>
  id: string
  providerId: string
  displayName: string
  baseURL: string
  model: string
  hasApiKey: boolean
}

export interface ModelCatalog {
  items: ModelProfile[]
  defaultModelId: string
}

export interface GlobalInstructionsFile {
  path: string
  content: string
  exists: boolean
}

export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PreviewState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
  path?: string
}

export type TeamConnectionStatus = 'offline' | 'connecting' | 'online'
export type AiWorkStatus = 'created' | 'planning' | 'routing' | 'waiting_approval' | 'accepted' | 'rejected' | 'running' | 'synthesizing' | 'success' | 'failed' | 'cancelled'

export interface TeamCapabilities {
  skills?: string[]
  scripts?: string[]
  tools?: string[]
  plugins?: string[]
  dataCount?: number
  knowledgeCount?: number
  permissions?: { request: boolean; execute: boolean; autoExecute: boolean; share: boolean }
  maxConcurrentTasks?: number
}

export interface TeamProfile {
  teamId: string
  teamName: string
  inviteCode: string
  relayUrl: string
  role: 'owner' | 'admin' | 'member'
  deviceId: string
  deviceName: string
}

export interface TeamDevice {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
  status: 'online' | 'offline'
  capabilities: TeamCapabilities
  lastSeen: string
}

export interface TeamConversationOffer {
  id: string
  sourceDeviceId: string
  sourceDeviceName: string
  title: string
  messageCount: number
  createdAt: string
}

export interface AiWorkEvent {
  id: string
  taskId: string
  type: string
  detail: string
  createdAt: string
}

export interface AiWorkTask {
  id: string
  direction: 'inbound' | 'outbound'
  sourceDeviceId: string
  targetDeviceId: string
  sourceConversationId?: string
  title: string
  instruction: string
  context: Record<string, unknown>
  status: AiWorkStatus
  result: string
  error: string
  createdAt: string
  updatedAt: string
  events: AiWorkEvent[]
}

export interface TeamState {
  profile?: TeamProfile
  connection: TeamConnectionStatus
  devices: TeamDevice[]
  tasks: AiWorkTask[]
  conversationOffers: TeamConversationOffer[]
  preferences?: {
    approvalMode: 'ask' | 'trusted' | 'team'
    trustedDeviceIds: string[]
    trustedCapabilities: string[]
    maxRetries: number
    maxConcurrentSubagents: number
  }
  audit?: Array<{ id: string; type: string; detail: string; createdAt: string }>
}

export type CloudStatus = 'disabled' | 'checking' | 'signed_out' | 'password_change_required' | 'authenticated' | 'unavailable'

export interface CloudAccount {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  mustChangePassword: boolean
}

export interface CloudQuota {
  id: string
  currency: string
  limitMicros: number
  spentMicros: number
  reservedMicros: number
  remainingMicros: number
  periodStart: string
  periodEnd: string
}

export interface CloudUsageSummary {
  accountId: string
  from: string
  to: string
  totals: { request_count?: number; settled_count?: number; exception_count?: number; prompt_tokens?: number; completion_tokens?: number; usage_unknown_count?: number; actual_micros?: number }
  byModel: Array<{ model_id: string; request_count: number; prompt_tokens: number; completion_tokens: number; actual_micros: number }>
}

export interface CloudState {
  status: CloudStatus
  account: CloudAccount | null
  quota: CloudQuota | null
  usage: CloudUsageSummary | null
  models: Array<{ id: string; object: 'model'; display_name?: string; provider?: string; context_window?: number; max_output_tokens?: number }>
  error: string
  baseURL: string
}

export interface BootstrapData {
  deliveries?: {id:string;state:string;error?:string}[]
  recoveryText?:string
  recoveryDiagnostic?:string
  draftReference?: AgentReference | null
  skillReferences?: AgentReference[]
  beforeCursor?: number | null
  projects?: ProjectItem[]
  catchAttachments?: AgentAttachment[]
  appVersion: string
  identity: string
  theme: ThemeMode
  data: DataItem[]
  library: DataLibraryItem[]
  knowledge: KnowledgeItem[]
  reports: ReportItem[]
  skills: SkillItem[]
  workflows: WorkflowItem[]
  conversations: ConversationItem[]
  activeConversationId: string
  messages: MessageItem[]
  models: ModelCatalog
  cloud: CloudState
  team: TeamState
  automations: AutomationState
  update: UpdateState
  paths: { userData: string; workspace: string }
  runtimeReady: boolean
}

export interface StableBridge {
  templates: {list():Promise<TemplateItem[]>;detail(id:string):Promise<TemplateItem & {html:string}>;import():Promise<TemplateItem[]>;save(id:string,value:Partial<TemplateItem>):Promise<TemplateItem[]>;use(id:string):Promise<AgentState>}

  windowClose: {
    onRequest(handler: () => void): () => void
    decide(choice: 'minimize' | 'quit' | 'cancel', remember: boolean): Promise<boolean>
  }
  bootstrap(): Promise<BootstrapData>
  cloud: {
    login(username: string, password: string): Promise<BootstrapData>
    changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<BootstrapData>
    refresh(): Promise<BootstrapData>
    logout(): Promise<BootstrapData>
  }
  data: {
    importFiles(): Promise<{ added: number; items: DataItem[] }>
    importPaths(paths: string[]): Promise<{ added: number; items: DataItem[] }>
    setEnabled(id: string, enabled: boolean): Promise<DataItem[]>
    remove(id: string): Promise<DataItem[]>
  }
  knowledge: {
    importFiles(): Promise<{ added: number; items: KnowledgeItem[] }>
    importPaths(paths: string[]): Promise<{ added: number; items: KnowledgeItem[] }>
    get(id: string): Promise<KnowledgeDocument>
    setEnabled(id: string, enabled: boolean): Promise<KnowledgeItem[]>
    remove(id: string): Promise<KnowledgeItem[]>
  }
  reports: {
    importFiles(): Promise<{ added: number; items: ReportItem[] }>
    importPaths(paths: string[]): Promise<{ added: number; items: ReportItem[] }>
    render(draft: ReportDraft): Promise<string>
    save(draft: ReportDraft): Promise<{ item: ReportItem; items: ReportItem[] }>
    remove(id: string): Promise<ReportItem[]>
    export(id: string): Promise<{ canceled: boolean; path?: string }>
  }
  library: {
    importFiles(category: DataLibraryCategory): Promise<{ added: number; items: DataLibraryItem[] }>
    importPaths(category: DataLibraryCategory, paths: string[]): Promise<{ added: number; items: DataLibraryItem[] }>
    rename(id: string, name: string): Promise<DataLibraryItem[]>
    remove(id: string): Promise<DataLibraryItem[]>
    run(id: string): Promise<{ cancelled?: boolean; item?: DataLibraryItem; items: DataLibraryItem[] }>
    sendInput(id: string, value: string): Promise<boolean>
    cancel(): Promise<boolean>
    saveMarkdown(id: string, content: string): Promise<DataLibraryItem[]>
    onEvent(handler: (event: ScriptLogEvent) => void): () => void
  }
  skills: {
    setEnabled(id: string, enabled: boolean): Promise<SkillItem[]>
    remove(id: string): Promise<SkillItem[]>
  }
  extensions: {
    wendingStatus(): Promise<WendingCliStatus>
    wendingBinding(conversationId: string): Promise<WendingLoginState>
    prepareWending(conversationId?: string): Promise<WendingCliStatus>
    sendWendingCode(mobile: string, channel: '0' | '1', conversationId?: string): Promise<WendingLoginState>
    verifyWendingCode(code: string, conversationId?: string): Promise<WendingLoginState>
    selectWendingAccount(id: string, conversationId?: string): Promise<WendingLoginState>
    selectWendingBrand(id: string, conversationId?: string): Promise<WendingLoginState>
    refreshWendingBrands(conversationId?: string): Promise<WendingLoginState>
    resetWendingLogin(conversationId?: string): Promise<WendingLoginState>
    cancelWendingLogin(conversationId?: string): Promise<WendingLoginState>
  }
  workflows: {
    save(workflow: Partial<WorkflowItem>): Promise<WorkflowItem[]>
    remove(id: string): Promise<WorkflowItem[]>
    run(id: string): Promise<{ output: string; artifacts: WorkflowArtifact[]; workflows: WorkflowItem[]; cancelled?: boolean }>
    cancel(): Promise<boolean>
    enhanceInstruction(node: Pick<WorkflowNode, 'type' | 'title' | 'instruction'>, prompt: string, effort: 'fast' | 'standard' | 'deep'): Promise<string>
    generate(goal: string): Promise<WorkflowItem>
    onEvent(handler: (event: WorkflowRunEvent) => void): () => void
  }
  editor: {
    onPasteIntoComposer(handler: (text: string) => void): () => void
    onSelectAllMessages(handler: () => void): () => void
  }
  browser: { command(payload: Record<string, unknown>): Promise<any>; onChanged(callback: () => void): () => void }
  market: {
    list(): Promise<MarketItem[]>; detail(id: string): Promise<MarketItem>; save(value: Partial<MarketItem>): Promise<MarketItem[]>;
    toggle(id: string, enabled: boolean): Promise<MarketItem[]>; remove(id: string): Promise<MarketItem[]>;
    checkUpdate(id: string): Promise<Partial<MarketItem> & { available: boolean; currentVersion: string }>; use(id: string): Promise<AgentState>
  }
  projects: { pickFolders():Promise<string[]>; create(name:string,folders:string[]):Promise<ProjectItem>; open(projectId:string|null,conversationId?:string):Promise<AgentState>; manage(id:string,action:'remove'|'relocate'|'pin'|'unpin'|'open'):Promise<AgentState>; register(): Promise<ProjectItem[]>; bind(id: string, projectId: string | null): Promise<AgentState> }
  agent: {
    onTaskOpen?(handler: (state: AgentState) => void): () => void
    onTaskNotice?(handler: (notice: {id:string; title?:string; body?:string; clear?:boolean}) => void): () => void
    setSkillReferences(id: string, ids: string[]): Promise<AgentReference[]>
    lifecycle(id:string,action:'archive'|'unarchive'|'delete'|'reconcile'|'rebuild'):Promise<AgentState>
    configureNetwork(id: string, enabled: boolean): Promise<AgentState>
    grants(id: string): Promise<Array<{key: string; label: string; expiresAt: string}>>
    revokeGrants(id: string, key?: string): Promise<Array<{key: string; label: string; expiresAt: string}>>
    messages(id: string, beforeCursor?: number): Promise<{ messages: MessageItem[]; beforeCursor: number | null }>
    viewState(id: string, value?: { anchor?: string; seq?: number; offset?: number; top?: number; following?: boolean }): Promise<{ anchor?: string; seq?: number; offset?: number; top?: number; following?: boolean }>
    inspectAttachments(paths: string[]): Promise<AgentAttachment[]>
    savePastedImage(conversationId: string, name: string, mediaType: string, data: Uint8Array): Promise<AgentAttachment>
    discardDraftImage(path: string): Promise<boolean>
    imagePreview(path: string): Promise<string>
    saveImageAs(path: string): Promise<{ canceled: boolean; path?: string }>
    selectAttachmentFolder(): Promise<AgentAttachment[]>
    selectSkillFolder(): Promise<AgentAttachment[]>
    create(): Promise<AgentState>
    catchReply(conversationId: string, messageId: string): Promise<AgentState>
    discardCatch(conversationId: string): Promise<AgentState>
    state(id: string): Promise<AgentState>
    search(query: string, offset?: number): Promise<ConversationSearchResult[]>
    select(id: string): Promise<AgentState>
    rename(id: string, title: string): Promise<AgentState>
    pin(id: string, pinned: boolean): Promise<AgentState>
    openWorkspace(id?:string): Promise<boolean>
    remove(id: string): Promise<AgentState>
    configure(id: string, capability: AgentCapability, dataIds: string[]): Promise<AgentState>
    configurePermission(id: string, permissionMode: AgentPermissionMode): Promise<AgentState>
    configureModel(id: string, modelId: string): Promise<AgentState>
    clarificationTimer(conversationId: string, id: string, action: 'start' | 'interact'): Promise<ClarificationTimer>
    run(conversationId: string, prompt: string, attachments?: AgentAttachment[], references?: AgentReference[], clientRequestId?: string, clarificationResponse?: ClarificationResponse): Promise<AgentState & { answer: string; library: DataLibraryItem[]; skills: SkillItem[]; workflows: WorkflowItem[] }>
    cancel(conversationId: string): Promise<boolean>
    steer(conversationId: string, requestId: string, prompt: string, attachments?: AgentAttachment[], references?: AgentReference[]): Promise<AgentState>
    answerApproval(conversationId: string, requestId: string, decision: boolean | 'deny' | 'once' | 'conversation'): Promise<boolean>
    clear(conversationId: string): Promise<AgentState>
    onEvent(handler: (event: AgentEvent) => void): () => void
    onState(handler: (state: AgentState) => void): () => void
  }
  automations: {
    state(): Promise<AutomationState>
    save(value: AutomationDraft): Promise<AutomationState>
    setEnabled(id: string, enabled: boolean): Promise<AutomationState>
    remove(id: string): Promise<AutomationState>
    run(id: string): Promise<AutomationState>
    decideProposal(conversationId: string, messageId: string, accepted: boolean): Promise<{ agent: AgentState; automations: AutomationState }>
    onEvent(handler: (state: AutomationState) => void): () => void
  }
  updater: {
    state(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    install(): Promise<boolean>
    onEvent(handler: (state: UpdateState) => void): () => void
  }
  team: {
    state(): Promise<TeamState>
    create(teamName: string, deviceName: string, port?: number): Promise<TeamState>
    join(inviteCode: string, deviceName: string): Promise<TeamState>
    leave(): Promise<TeamState>
    request(targetDeviceId: string, sourceConversationId: string, title: string, instruction: string, requiredCapabilities?: string[]): Promise<TeamState>
    collaborate(sourceConversationId: string, title: string, instruction: string): Promise<TeamState>
    savePreferences(preferences: Partial<NonNullable<TeamState['preferences']>>): Promise<TeamState>
    setRole(deviceId: string, role: 'admin' | 'member'): Promise<TeamState>
    decide(taskId: string, allowed: boolean): Promise<TeamState>
    cancel(taskId: string): Promise<TeamState>
    shareConversation(targetDeviceId: string, conversationId: string): Promise<TeamState>
    decideConversation(offerId: string, allowed: boolean): Promise<{ team: TeamState; agent: AgentState }>
    onEvent(handler: (state: TeamState) => void): () => void
  }
  model: {
    save(profile: ModelProfile & { apiKey?: string }): Promise<ModelCatalog>
    remove(id: string): Promise<ModelCatalog>
    setDefault(id: string): Promise<ModelCatalog>
  }
  settings: {
    globalInstructions(): Promise<GlobalInstructionsFile>
    saveGlobalInstructions(content: string): Promise<GlobalInstructionsFile>
  }
  preview: {
    existingFiles(conversationId: string, paths: string[]): Promise<string[]>
    openWeb(url: string, bounds: PreviewBounds): Promise<PreviewState>
    openFile(path: string, bounds: PreviewBounds): Promise<PreviewState>
    setBounds(bounds: PreviewBounds): Promise<boolean>
    navigate(action: 'back' | 'forward' | 'reload'): Promise<boolean>
    close(): Promise<boolean>
    onEvent(handler: (state: PreviewState) => void): () => void
  }
  clipboard: {
    writeText(text: string): Promise<boolean>
  }
  appearance: {
    setCompletedCount(count: number): Promise<number>
    setTheme(theme: ThemeMode): Promise<ThemeMode>
    completeLaunch(): Promise<ThemeMode>
    onLaunchStart(handler: () => void): () => void
  }
  system: {
    openPath(path: string): Promise<boolean>
    showItemInFolder(path: string): Promise<boolean>
    openExternalHtml(path: string): Promise<boolean>
  }
  files: {
    path(file: File): string
  }
}

declare global {
  interface Window {
    stable: StableBridge
  }
}

export interface TemplateItem { id:string; name:string; category:string; description:string; tags:string[]; skillId:string; prompt:string; favorite:boolean; builtin?:boolean }
