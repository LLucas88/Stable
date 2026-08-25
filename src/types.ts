export type Page = 'home' | 'agent' | 'team' | 'data' | 'reports' | 'skills' | 'workflows' | 'knowledge' | 'settings'
export type ThemeMode = 'dark' | 'light'

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
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  trace?: AgentTraceItem[]
  attachments?: Array<Pick<AgentAttachment, 'name' | 'size' | 'type'> & { kind: AgentReferenceKind | 'attachment' }>
}

export type AgentReferenceKind = 'data' | 'skill' | 'script' | 'knowledge'

export interface AgentReference {
  id: string
  kind: AgentReferenceKind
  name: string
  size: number
  type: string
}

export type AgentCapability = 'auto' | 'fast' | 'reasoning' | 'analysis'
export type AgentPermissionMode = 'request' | 'auto' | 'full'

export interface ConversationItem {
  id: string
  title: string
  capability: AgentCapability
  permissionMode: AgentPermissionMode
  dataIds: string[]
  messageCount: number
  sourceType: 'local' | 'team'
  sourceDeviceId?: string
  sourceDeviceName?: string
  createdAt: string
  updatedAt: string
}

export interface AgentState {
  conversations: ConversationItem[]
  activeConversationId: string
  messages: MessageItem[]
}

export interface AgentAttachment {
  name: string
  path: string
  size: number
  type: string
}

export type AgentTraceKind = 'context' | 'reasoning' | 'tool' | 'status' | 'approval'
export type AgentTraceStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentTraceItem {
  id: string
  runId: string
  kind: AgentTraceKind
  title: string
  detail?: string
  status: AgentTraceStatus
  time: number
  conversationId?: string
  eventType?: string
  requestId?: string
  toolName?: string
  reason?: string
  danger?: boolean
}

export interface ModelSettings {
  providerId: string
  displayName: string
  baseURL: string
  model: string
  hasApiKey: boolean
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

export interface BootstrapData {
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
  model: ModelSettings
  team: TeamState
  paths: { userData: string; workspace: string }
  runtimeReady: boolean
}

export interface StableBridge {
  bootstrap(): Promise<BootstrapData>
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
  workflows: {
    save(workflow: Partial<WorkflowItem>): Promise<WorkflowItem[]>
    remove(id: string): Promise<WorkflowItem[]>
    run(id: string): Promise<{ output: string; artifacts: WorkflowArtifact[]; workflows: WorkflowItem[]; cancelled?: boolean }>
    cancel(): Promise<boolean>
    enhanceInstruction(node: Pick<WorkflowNode, 'type' | 'title' | 'instruction'>, prompt: string, effort: 'fast' | 'standard' | 'deep'): Promise<string>
    generate(goal: string): Promise<WorkflowItem>
    onEvent(handler: (event: WorkflowRunEvent) => void): () => void
  }
  agent: {
    inspectAttachments(paths: string[]): Promise<AgentAttachment[]>
    selectSkillFolder(): Promise<AgentAttachment[]>
    create(): Promise<AgentState>
    state(id: string): Promise<AgentState>
    select(id: string): Promise<AgentState>
    rename(id: string, title: string): Promise<AgentState>
    remove(id: string): Promise<AgentState>
    configure(id: string, capability: AgentCapability, dataIds: string[]): Promise<AgentState>
    configurePermission(id: string, permissionMode: AgentPermissionMode): Promise<AgentState>
    run(conversationId: string, prompt: string, attachments?: AgentAttachment[], references?: AgentReference[]): Promise<AgentState & { answer: string; library: DataLibraryItem[]; skills: SkillItem[]; workflows: WorkflowItem[] }>
    cancel(conversationId: string): Promise<boolean>
    answerApproval(conversationId: string, requestId: string, allowed: boolean): Promise<boolean>
    clear(conversationId: string): Promise<AgentState>
    onEvent(handler: (event: AgentTraceItem) => void): () => void
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
    save(settings: ModelSettings & { apiKey?: string }): Promise<ModelSettings>
  }
  appearance: {
    setTheme(theme: ThemeMode): Promise<ThemeMode>
    completeLaunch(): Promise<ThemeMode>
    onLaunchStart(handler: () => void): () => void
  }
  system: {
    openPath(path: string): Promise<boolean>
    showItemInFolder(path: string): Promise<boolean>
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
