'use strict'

const { app, BrowserWindow, WebContentsView, clipboard, dialog, ipcMain, shell, safeStorage, session, nativeImage, Tray, Menu } = require('electron')
const { autoUpdater } = require('electron-updater')
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const { fileURLToPath, pathToFileURL } = require('node:url')
const { StableStore } = require('./services/store.cjs')
const { extractText, importSkillFolder, inspectDataFile, inspectSkillFolder } = require('./services/importers.cjs')
const { MAX_MESSAGE_IMAGE_BYTES, discardDraftImage, extractAttachmentText, inspectAttachmentPath, isImageAttachment, materializeAttachment, removeMaterializedAttachmentRoot, savePastedImage } = require('./services/attachments.cjs')
const { HarnessRunner } = require('./services/execution-harness.cjs')
const { clearCodexSession } = require('./services/codex-harness.cjs')
const { canAutoApprove } = require('./services/codex-approval.cjs')
const { BuiltinTools } = require('./services/builtin-tools.cjs')
const { SecretStore } = require('./services/secrets.cjs')
const { ModelRegistry, isDeepSeekModel } = require('./services/model-registry.cjs')
const { CloudAccountService } = require('./services/cloud-account.cjs')
const { CloudGatewayProxy } = require('./services/cloud-gateway-proxy.cjs')
const { createCloudFetch } = require('./services/cloud-transport.cjs')
const { composeAgentPrompt } = require('./services/prompts.cjs')
const { deliveryRequest, revisedDelivery, runWithDeliveryChecks } = require('./services/delivery.cjs')
const { createStreamTranscript } = require('./services/stream-transcript.cjs')
const { ScriptRunner } = require('./services/script-runner.cjs')
const { TeamNetwork } = require('./services/team-network.cjs')
const { buildConversationSnapshot, normalizeConversationOffer } = require('./services/team-conversation.cjs')
const { isTerminal: isTeamTaskTerminal, parseCollaborationPlan, selectTeamDevice, shouldAutoApprove } = require('./services/team-coordination.cjs')
const { looksLikeScriptPrompt, parseScriptDecision } = require('./services/script-interaction.cjs')
const { collectMarkdownFiles, copyMarkdownDocuments } = require('./services/knowledge.cjs')
const { renderReportHtml } = require('./services/reports.cjs')
const { layoutWorkflowGraph, scheduleWorkflowTasks, topologicalOrder, validateWorkflowGraph } = require('./services/workflow-graph.cjs')
const { writeWorkflowOutput } = require('./services/workflow-output.cjs')
const { asksForWorkbenchInventory, buildWorkbenchInventory, requestedWorkbenchAction, workbenchInventoryAnswer } = require('./services/inventory.cjs')
const {
  normalizeWebUrl,
  renderFileInfoDocument,
  renderImageDocument,
  renderMarkdownDocument,
  renderTextDocument,
  resolveMarkdownFile,
  resolveWorkspaceEntry,
} = require('./services/preview.cjs')
const { automationIntent, automationTemplates, parseProposalOutput, proposalPrompt } = require('./services/automation.cjs')
const { createUpdateController } = require('./services/updater.cjs')
const { createWindowPresence, registerCompletedCountIpc } = require('./services/window-presence.cjs')
const { cleanupStaleInstalls } = require('./services/update-maintenance.cjs')
const { WendingCliService, isWendingCliPrompt } = require('./services/wending-cli.cjs')
const { registerWendingLoginIpc } = require('./services/wending-login.cjs')
const { ensureGlobalInstructions, readGlobalInstructionsFile, saveGlobalInstructionsFile } = require('./services/global-instructions.cjs')
const {
  SCRIPT_EXTENSIONS,
  cleanupPackage,
  copyScriptFolder,
  copySingleScript,
  extractScriptZip,
  isInside,
  migrateScriptPackage,
  removeStoredAsset,
  requireScriptPath,
  scanPackage,
} = require('./services/library-packages.cjs')

const APP_ID = 'com.stable.agent'
const WINDOW_CHROME = {
  dark: { backgroundColor: '#060d15', symbolColor: '#dbe7f7', height: 40 },
  light: { backgroundColor: '#f3eee6', symbolColor: '#172030', height: 40 },
}
let mainWindow
let tray
const windowPresence = createWindowPresence({ app, nativeImage, isInstalling: () => updateController?.state().status === 'installing' })
let previewView
let previewKind
let previewTemporaryPath
const configuredPreviewSessions = new WeakSet()
let store
let secrets
let modelRegistry
let cloudAccount
let cloudGateway
let runner
const agentRunners = new Map()
const automationRunners = new Map()
let automationTimer
let updateController
let scriptRunner
let wendingCli
let activeWorkflowRun
let paths
let teamNetwork
let teamConnection = 'offline'
const teamTaskRunners = new Map()
const pendingTeamContinuations = new Map()
const collaborationRunners = new Map()
const collaborationModelRoutes = new Map()
const pendingCollaborationChecks = new Map()
const updateHealthcheck = process.argv.includes('--stable-update-healthcheck')

app.setAppUserModelId(APP_ID)
if (process.platform === 'win32' && app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox')
}
if (process.env.STABLE_QA_CAPTURE) app.disableHardwareAcceleration()
const userDataArgument = process.argv.find((argument) => argument.startsWith('--stable-user-data='))
const userDataPath = process.env.STABLE_QA_USER_DATA || userDataArgument?.slice('--stable-user-data='.length)
if (userDataPath) app.setPath('userData', path.resolve(userDataPath))

if (!process.env.STABLE_QA_CAPTURE && !userDataPath && !updateHealthcheck) {
  if (!app.requestSingleInstanceLock()) app.quit()
  else app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show(); mainWindow.focus()
  })
}

function resourcePath(...segments) {
  return path.join(app.getAppPath(), ...segments)
}

function createHarnessRunner() {
  return new HarnessRunner({
    userData: paths.userData,
    workspace: paths.workspace,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    environment: wendingCli ? wendingCli.environment(process.env) : process.env,
    builtinTools: () => new BuiltinTools({ workspace: paths.workspace, electron: require('electron'), packaged: app.isPackaged, resourcesPath: process.resourcesPath }),
  })
}

function cleanFilename(value) {
  return String(value || 'workflow-output').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80) || 'workflow-output'
}

function timestampedOutputName(value, now = new Date()) {
  const pad = (part) => String(part).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${cleanFilename(value)}-${stamp}`
}

function normalizeTheme(value) { return value === 'light' ? 'light' : 'dark' }

function applyWindowTheme(window, theme) {
  const chrome = WINDOW_CHROME[normalizeTheme(theme)]
  window.setBackgroundColor(chrome.backgroundColor)
  if (process.platform === 'win32' && typeof window.setTitleBarOverlay === 'function') {
    window.setTitleBarOverlay({ color: chrome.backgroundColor, symbolColor: chrome.symbolColor, height: chrome.height })
  }
}

function readGlobalInstructions() {
  return readGlobalInstructionsFile(app.getPath('userData'))
}

function saveGlobalInstructions(value) {
  return saveGlobalInstructionsFile(app.getPath('userData'), value)
}

function sameFilesystemPath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(left) === normalize(right)
}

function isAllowedWorkspacePreviewFile(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return false
    if (url.hostname) return false
    const requested = fileURLToPath(url)
    if (previewTemporaryPath && sameFilesystemPath(requested, previewTemporaryPath)) {
      return existsSync(requested) && statSync(requested).isFile()
    }
    resolveWorkspaceEntry(requested, paths.workspace, { fileOnly: true })
    return true
  } catch { return false }
}

function isAllowedLocalPreviewRequest(value) {
  try {
    const protocol = new URL(value).protocol
    if (protocol === 'data:' || protocol === 'blob:') return true
  } catch { return false }
  return isAllowedWorkspacePreviewFile(value)
}

function isAllowedLocalPreviewNavigation(value) {
  return isAllowedWorkspacePreviewFile(value)
}

function configurePreviewSession(webContents, kind) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (kind === 'web') {
      try { void webContents.loadURL(normalizeWebUrl(url)) } catch {}
    } else if (kind === 'html' && isAllowedLocalPreviewNavigation(url)) {
      try { void webContents.loadURL(url) } catch {}
    }
    return { action: 'deny' }
  })
  webContents.on('will-attach-webview', (event) => event.preventDefault())
  if (configuredPreviewSessions.has(webContents.session)) return
  const session = webContents.session
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.on('will-download', (event) => event.preventDefault())
  if (kind !== 'web') {
    session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedLocalPreviewRequest(details.url) }))
  }
  configuredPreviewSessions.add(session)
}

function cleanupPreviewTemporaryFile() {
  if (!previewTemporaryPath) return
  try { if (existsSync(previewTemporaryPath)) unlinkSync(previewTemporaryPath) } catch {}
  previewTemporaryPath = undefined
}

function closePreviewView() {
  const view = previewView
  previewView = undefined
  previewKind = undefined
  cleanupPreviewTemporaryFile()
  if (!view) return true
  try { mainWindow?.contentView.removeChildView(view) } catch {}
  try { if (!view.webContents.isDestroyed()) view.webContents.close() } catch {}
  return true
}

function normalizedPreviewBounds(value) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Stable 主窗口尚未准备完成。')
  const content = mainWindow.getContentBounds()
  const x = Math.max(0, Math.min(content.width - 1, Math.round(Number(value?.x) || 0)))
  const y = Math.max(0, Math.min(content.height - 1, Math.round(Number(value?.y) || 0)))
  const width = Math.max(1, Math.min(content.width - x, Math.round(Number(value?.width) || 1)))
  const height = Math.max(1, Math.min(content.height - y, Math.round(Number(value?.height) || 1)))
  return { x, y, width, height }
}

function sendPreviewEvent(patch = {}, sourceView = previewView) {
  if (!mainWindow || mainWindow.isDestroyed() || !sourceView || sourceView !== previewView || sourceView.webContents.isDestroyed()) return
  const contents = sourceView.webContents
  mainWindow.webContents.send('stable:preview:event', {
    url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(),
    ...patch,
  })
}

function createPreviewView(kind, bounds) {
  closePreviewView()
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: kind === 'web' || kind === 'html',
      webviewTag: false,
      navigateOnDragDrop: false,
      partition: kind === 'web' ? 'stable-preview-web' : kind === 'html' ? 'stable-preview-html' : 'stable-preview-local',
    },
  })
  previewView = view
  previewKind = kind
  mainWindow.contentView.addChildView(view)
  view.setBackgroundColor(normalizeTheme(store.getSetting('theme')) === 'light' ? '#f8f5ee' : '#070b12')
  view.setBounds(normalizedPreviewBounds(bounds))
  configurePreviewSession(view.webContents, kind)
  const guardNavigation = (event, targetUrl) => {
    try {
      if (kind === 'web') { normalizeWebUrl(targetUrl); return }
      if (kind !== 'web' && isAllowedLocalPreviewNavigation(targetUrl)) return
    } catch {}
    event.preventDefault()
  }
  view.webContents.on('will-navigate', guardNavigation)
  view.webContents.on('will-redirect', guardNavigation)
  view.webContents.on('did-start-loading', () => { if (previewView === view) view.setVisible(true); sendPreviewEvent({ loading: true, error: '' }, view) })
  view.webContents.on('did-stop-loading', () => sendPreviewEvent({ loading: false }, view))
  view.webContents.on('page-title-updated', () => sendPreviewEvent({}, view))
  view.webContents.on('did-navigate', () => sendPreviewEvent({}, view))
  view.webContents.on('did-navigate-in-page', () => sendPreviewEvent({}, view))
  view.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (previewView === view && isMainFrame && code !== -3) { view.setVisible(false); sendPreviewEvent({ loading: false, url: validatedURL, error: description || '页面加载失败。' }, view) }
  })
  return view
}

function requireActivePreviewView(view) {
  if (previewView !== view || view.webContents.isDestroyed()) throw new Error('预览请求已被新的操作替换。')
}

async function openWebPreview(value, bounds) {
  const url = normalizeWebUrl(value)
  const view = createPreviewView('web', bounds)
  try { await view.webContents.loadURL(url) } catch (error) { if (previewView === view) sendPreviewEvent({ loading: false, error: error.message }, view); throw error }
  requireActivePreviewView(view)
  const result = { url, title: view.webContents.getTitle() || new URL(url).hostname, loading: false, canGoBack: false, canGoForward: false }
  sendPreviewEvent(result, view)
  return result
}

async function loadGeneratedFilePreview(view, html, prefix) {
  requireActivePreviewView(view)
  const previewDirectory = path.join(paths.userData, 'preview')
  const previewPath = path.join(previewDirectory, `${prefix}-${randomUUID()}.html`)
  mkdirSync(previewDirectory, { recursive: true })
  writeFileSync(previewPath, html, 'utf8')
  requireActivePreviewView(view)
  previewTemporaryPath = previewPath
  await view.webContents.loadFile(previewPath)
  requireActivePreviewView(view)
}

const DIRECT_HTML_EXTENSIONS = new Set(['.html', '.htm'])
const IMAGE_PREVIEW_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const EXTRACTED_TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.json', '.yaml', '.yml', '.log', '.xml', '.docx', '.pdf', '.xlsx', '.xls'])

async function openFilePreview(value, bounds) {
  const resolved = resolveWorkspaceEntry(value, paths.workspace)
  const title = path.basename(resolved.path) || resolved.path
  const theme = normalizeTheme(store.getSetting('theme'))
  const interactiveHtml = !resolved.isDirectory && DIRECT_HTML_EXTENSIONS.has(resolved.extension) && resolved.size <= 20 * 1024 * 1024
  const view = createPreviewView(interactiveHtml ? 'html' : 'file', bounds)
  try {
    if (resolved.isDirectory) {
      await loadGeneratedFilePreview(view, renderFileInfoDocument(resolved, theme, '这是当前 Stable 工作区内的文件夹。文件夹内容不会自动展开或执行。'), 'folder-preview')
    } else if (['.md', '.markdown'].includes(resolved.extension)) {
      try {
        const markdown = resolveMarkdownFile(resolved.path, paths.workspace)
        await loadGeneratedFilePreview(view, renderMarkdownDocument(markdown.content, title, theme), 'markdown-preview')
      } catch (error) {
        await loadGeneratedFilePreview(view, renderFileInfoDocument(resolved, theme, `Stable 无法渲染这个 Markdown 文件。\n\n${error.message}`), 'file-preview')
      }
    } else if (DIRECT_HTML_EXTENSIONS.has(resolved.extension) && resolved.size <= 20 * 1024 * 1024) {
      requireActivePreviewView(view)
      await view.webContents.loadFile(resolved.path)
      requireActivePreviewView(view)
    } else if (IMAGE_PREVIEW_EXTENSIONS.has(resolved.extension) && resolved.size <= 50 * 1024 * 1024) {
      await loadGeneratedFilePreview(view, renderImageDocument(pathToFileURL(resolved.path).toString(), resolved, theme), 'image-preview')
    } else if (EXTRACTED_TEXT_EXTENSIONS.has(resolved.extension)) {
      try {
        const extracted = await extractText(resolved.path)
        await loadGeneratedFilePreview(view, renderTextDocument(extracted.text, title, theme, { path: resolved.path, size: resolved.size, type: extracted.type.toUpperCase() }), 'text-preview')
      } catch (error) {
        await loadGeneratedFilePreview(view, renderFileInfoDocument(resolved, theme, `Stable 无法提取这个文件的预览内容。\n\n${error.message}`), 'file-preview')
      }
    } else {
      await loadGeneratedFilePreview(view, renderFileInfoDocument(resolved, theme), 'file-preview')
    }
  } catch (error) {
    if (previewView === view) sendPreviewEvent({ loading: false, error: error.message }, view)
    throw error
  }
  requireActivePreviewView(view)
  const result = { path: resolved.path, url: pathToFileURL(resolved.path).toString(), title, loading: false, canGoBack: false, canGoForward: false }
  sendPreviewEvent(result, view)
  return result
}

function updatePreviewBounds(value) {
  if (!previewView || previewView.webContents.isDestroyed()) return false
  previewView.setBounds(normalizedPreviewBounds(value))
  return true
}

function bootstrap() {
  const messages = process.env.STABLE_QA_FIXTURE || process.env.STABLE_QA_IMAGE_FIXTURE ? qaMessages() : store.listMessages()
  return {
    appVersion: app.getVersion(),
    identity: store.getSetting('identity'), theme: normalizeTheme(store.getSetting('theme')),
    data: store.listData(), library: store.listLibrary(), knowledge: store.listKnowledge(), reports: store.listReports(), skills: store.listSkills(), workflows: store.listWorkflows(),
    conversations: store.listConversations(), activeConversationId: store.activeConversationId(), messages,
    models: modelRegistry.publicCatalog(),
    cloud: cloudAccount?.publicState() || { status: 'disabled', account: null, quota: null, usage: null, models: [], error: '', baseURL: '' },
    team: teamState(),
    automations: automationState(),
    update: updateController?.state() || { status: app.isPackaged ? 'idle' : 'development', currentVersion: app.getVersion(), progress: 0 },
    recentRuns: store.recentRuns(),
    paths, runtimeReady: runner.ready(),
  }
}

function automationState() {
  return { items: store.listAutomations(), runs: store.listAutomationRuns(), templates: automationTemplates() }
}

function publishAgentState(conversationId) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:agent:state', agentState(conversationId))
}

function publishAutomationState() {
  const state = automationState()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:automations:event', state)
  return state
}

async function executeAutomation(id, force = false) {
  const claimed = store.startAutomationRun(id, force)
  if (!claimed) return publishAutomationState()
  const { item, runId } = claimed
  const executionRunner = createHarnessRunner()
  automationRunners.set(id, executionRunner)
  publishAutomationState()
  try {
    store.addMessage(item.conversationId, 'user', item.prompt)
    publishAgentState(item.conversationId)
    const result = await runAgent(item.prompt, item.conversationId, [], undefined, undefined, true, [], executionRunner, 'full')
    store.addMessage(item.conversationId, 'assistant', result.answer, result.trace)
    store.finishAutomationRun(id, runId, result.status || 'completed', result.answer, result.reason || null)
    publishAgentState(item.conversationId)
  } catch (error) {
    store.finishAutomationRun(id, runId, error.message === '任务已停止。' ? 'cancelled' : 'failed', null, error.message)
  } finally {
    automationRunners.delete(id)
    publishAutomationState()
  }
  return automationState()
}

function checkDueAutomations() {
  for (const item of store.dueAutomations()) if (!automationRunners.has(item.id)) void executeAutomation(item.id)
}

function scheduleLabel(schedule) {
  if (schedule.type === 'once') return `${schedule.date} ${schedule.time}`
  if (schedule.type === 'daily') return `每天 ${schedule.time}`
  if (schedule.type === 'weekly') return `每周 ${schedule.weekdays.join('、')} · ${schedule.time}`
  return `每月 ${schedule.day} 日 ${schedule.time}`
}

function deviceIdentity() {
  let identity = store.getSetting('teamDeviceIdentity')
  if (!identity?.id || !identity?.key) {
    identity = { id: randomUUID(), key: require('node:crypto').randomBytes(32).toString('base64url') }
    store.setSetting('teamDeviceIdentity', identity)
  }
  return identity
}

function publicTeamProfile() {
  const profile = store.teamProfile()
  if (!profile) return undefined
  const { secret: _secret, deviceKey: _deviceKey, ...safe } = profile
  return safe
}

function teamState() {
  return {
    profile: publicTeamProfile(), connection: teamConnection,
    devices: store?.listTeamDevices?.() || [], tasks: store?.listTeamTasks?.() || [],
    conversationOffers: store?.listTeamConversationOffers?.() || [],
    preferences: store ? teamPreferences() : undefined,
    audit: store ? (store.getSetting('teamAudit') || []).slice(-200) : [],
  }
}

function publishTeam() {
  const state = teamState()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:team:event', state)
  return state
}

function teamCapabilities() {
  const profile = store.teamProfile()
  const preferences = teamPreferences()
  const role = profile?.role || 'member'
  return {
    skills: store.listSkills().filter((item) => item.enabled).map((item) => item.name).slice(0, 40),
    scripts: store.listLibrary().filter((item) => item.kind === 'script').map((item) => item.name).slice(0, 40),
    tools: ['Stable Agent', 'Stable Workflow'],
    plugins: Array.isArray(store.getSetting('teamPlugins')) ? store.getSetting('teamPlugins').slice(0, 40) : [],
    dataCount: store.listData().filter((item) => item.enabled).length,
    knowledgeCount: store.listKnowledge().filter((item) => item.enabled).length,
    permissions: { request: true, execute: true, autoExecute: preferences.approvalMode !== 'ask', share: ['owner', 'admin'].includes(role) },
    maxConcurrentTasks: 3,
  }
}

function teamPreferences() {
  const saved = store.getSetting('teamPreferences') || {}
  return {
    approvalMode: ['ask', 'trusted', 'team'].includes(saved.approvalMode) ? saved.approvalMode : 'ask',
    trustedDeviceIds: Array.isArray(saved.trustedDeviceIds) ? saved.trustedDeviceIds.slice(0, 100) : [],
    trustedCapabilities: Array.isArray(saved.trustedCapabilities) ? saved.trustedCapabilities.slice(0, 100) : [],
    maxRetries: Number.isInteger(saved.maxRetries) ? Math.max(0, Math.min(3, saved.maxRetries)) : 1,
    maxConcurrentSubagents: Number.isInteger(saved.maxConcurrentSubagents) ? Math.max(1, Math.min(3, saved.maxConcurrentSubagents)) : 3,
  }
}

function saveTeamPreferences(values = {}) {
  const next = { ...teamPreferences(), ...values }
  store.setSetting('teamPreferences', next)
  if (teamNetwork?.profile) {
    const profile = teamNetwork.updateProfile()
    store.saveTeamProfile(profile)
  }
  return next
}

function teamTaskLoad() {
  const load = {}
  for (const task of store.listTeamTasks(500)) {
    if (!isTeamTaskTerminal(task.status) && task.targetDeviceId) load[task.targetDeviceId] = (load[task.targetDeviceId] || 0) + 1
  }
  return load
}

function routeTeamDevice(requiredCapabilities = [], excludedDeviceIds = []) {
  const profile = store.teamProfile()
  return selectTeamDevice(store.listTeamDevices(), requiredCapabilities, {
    localDeviceId: profile?.deviceId,
    excludeDeviceIds: excludedDeviceIds,
    loadByDevice: teamTaskLoad(),
  })
}

function auditTeamTask(taskId, type, detail) {
  store.addTeamEvent(taskId, type, detail)
  return publishTeam()
}

function auditTeam(type, detail) {
  const items = store.getSetting('teamAudit') || []
  items.push({ id: randomUUID(), type, detail: String(detail || '').slice(0, 2_000), createdAt: new Date().toISOString() })
  store.setSetting('teamAudit', items.slice(-500))
  return publishTeam()
}

function sendTeamTask(task) {
  teamNetwork.send(task.targetDeviceId, {
    type: 'task:create', taskId: task.id, sourceConversationId: task.sourceConversationId,
    title: task.title, instruction: task.instruction, context: task.context, createdAt: task.createdAt,
  })
  store.updateTeamTask(task.id, 'waiting_approval', { error: '' })
  auditTeamTask(task.id, 'waiting_approval', '任务已送达，等待目标设备审批。')
  return store.teamTask(task.id)
}

function createOutboundTeamTask({ targetDeviceId, sourceConversationId, title, instruction, context = {} }) {
  const profile = store.teamProfile()
  if (!profile) throw new Error('请先创建或加入 Team。')
  const requiredCapabilities = context.requiredCapabilities || []
  const target = targetDeviceId && targetDeviceId !== 'auto'
    ? store.listTeamDevices().find((item) => item.id === targetDeviceId && item.status === 'online')
    : routeTeamDevice(requiredCapabilities, context.attemptedDeviceIds || [])
  if (!target || target.id === profile.deviceId) throw new Error(requiredCapabilities.length ? '没有在线设备满足所需能力。' : '没有可用的在线远程设备。')
  const task = store.saveTeamTask({
    direction: 'outbound', sourceDeviceId: profile.deviceId, targetDeviceId: target.id, sourceConversationId,
    title, instruction, context: {
      mode: 'minimal', attempt: 0, maxRetries: teamPreferences().maxRetries,
      attemptedDeviceIds: [target.id], requiredCapabilities, agentPath: '/root', ...context,
    }, status: 'routing',
  })
  auditTeamTask(task.id, 'created', `已路由至 ${target.name}${requiredCapabilities.length ? ` · ${requiredCapabilities.join('、')}` : ''}。`)
  return sendTeamTask(task)
}

function retryTeamTask(task, reason) {
  if (!task || task.direction !== 'outbound') return false
  const context = task.context || {}
  const attempt = Number(context.attempt || 0)
  const maxRetries = Number(context.maxRetries ?? teamPreferences().maxRetries)
  if (attempt >= maxRetries) return false
  const attemptedDeviceIds = [...new Set([...(context.attemptedDeviceIds || []), task.targetDeviceId])]
  const target = routeTeamDevice(context.requiredCapabilities || [], attemptedDeviceIds)
  if (!target) return false
  const retried = store.patchTeamTask(task.id, {
    targetDeviceId: target.id,
    status: 'routing', result: '', error: '',
    context: { attempt: attempt + 1, attemptedDeviceIds: [...attemptedDeviceIds, target.id] },
  })
  auditTeamTask(task.id, 'retrying', `${reason} 已自动改派至 ${target.name}（第 ${attempt + 1} 次重试）。`)
  sendTeamTask(retried)
  return true
}

async function continueSourceConversation(task) {
  const conversationId = task.sourceConversationId
  if (!conversationId || !store.conversation(conversationId)) return
  if (agentRunners.has(conversationId)) {
    clearTimeout(pendingTeamContinuations.get(task.id))
    pendingTeamContinuations.set(task.id, setTimeout(() => void continueSourceConversation(task), 1_000))
    return
  }
  pendingTeamContinuations.delete(task.id)
  const executionRunner = createHarnessRunner()
  const control = { runner: executionRunner, reviewers: new Set() }
  agentRunners.set(conversationId, control)
  auditTeamTask(task.id, 'continuation_started', '远端结果已注入来源对话，Agent 正在继续原任务。')
  try {
    const prompt = `这是已获批准的远端 AI Work 返回结果。请把它作为工具结果继续完成来源对话中的原任务；不要重复请求远端执行。\n\n远端任务：${task.title}\n远端结果：\n${task.result}`
    const result = await runAgent(prompt, conversationId, [], undefined, {}, true, [], executionRunner)
    store.addMessage(conversationId, 'assistant', result.answer, result.trace)
    auditTeamTask(task.id, result.status === 'failed' ? 'continuation_failed' : 'continuation_completed', result.reason || '来源对话已基于远端结果继续完成。')
  } catch (error) {
    auditTeamTask(task.id, 'continuation_failed', `来源对话续跑失败：${error.message}`)
  } finally {
    for (const reviewer of control.reviewers) reviewer.cancel()
    if (agentRunners.get(conversationId) === control) agentRunners.delete(conversationId)
  }
}

async function executeInboundTeamTask(taskId) {
  const task = store.teamTask(taskId)
  if (!task || task.status !== 'accepted') return
  const executionRunner = createHarnessRunner()
  teamTaskRunners.set(taskId, executionRunner)
  store.updateTeamTask(taskId, 'running')
  auditTeamTask(taskId, 'running', '目标设备已开始使用本地能力执行。')
  try {
    const required = task.context?.requiredCapabilities || []
    const skillNames = new Set(required.filter((item) => item.startsWith('skill:')).map((item) => item.slice(6)))
    const scriptNames = new Set(required.filter((item) => item.startsWith('script:')).map((item) => item.slice(7)))
    const selectedSkills = store.listSkills().filter((item) => item.enabled && skillNames.has(item.name)).map(({ name, content }) => ({ name, content }))
    const selectedScripts = store.listLibrary().filter((item) => item.kind === 'script' && scriptNames.has(item.name)).map(({ id, name, description }) => ({ id, name, description }))
    const safeInstruction = `${task.instruction}\n\n这是经本机策略批准的 Team AI Work，Agent 路径为 ${task.context?.agentPath || '/root'}。只使用本机能力和检索命中的资源；不要删除、覆盖或清空文件。完成后只提交可供上游综合的结果。`
    const result = await runAgent(safeInstruction, null, [], [], { skills: selectedSkills, scripts: selectedScripts }, false, [], executionRunner, 'full')
    if (result.status === 'failed') throw new Error(result.reason)
    store.updateTeamTask(taskId, 'success', { result: result.answer })
    auditTeamTask(taskId, 'success', '目标设备执行完成，结果已回传。')
    teamNetwork.send(task.sourceDeviceId, { type: 'task:result', taskId, result: result.answer })
  } catch (error) {
    const cancelled = error.message === '任务已停止。'
    store.updateTeamTask(taskId, cancelled ? 'cancelled' : 'failed', { error: error.message })
    auditTeamTask(taskId, cancelled ? 'cancelled' : 'failed', error.message)
    try { teamNetwork.send(task.sourceDeviceId, { type: 'task:error', taskId, error: error.message, cancelled }) } catch {}
  } finally {
    teamTaskRunners.delete(taskId)
  }
}

function scheduleCollaborationCheck(rootTaskId) {
  if (!rootTaskId) return
  clearTimeout(pendingCollaborationChecks.get(rootTaskId))
  pendingCollaborationChecks.set(rootTaskId, setTimeout(() => void completeCollaborationRoot(rootTaskId), 150))
}

async function completeCollaborationRoot(rootTaskId) {
  pendingCollaborationChecks.delete(rootTaskId)
  if (collaborationRunners.has(rootTaskId)) return
  const root = store.teamTask(rootTaskId)
  if (!root || isTeamTaskTerminal(root.status)) return
  const childIds = root.context?.childTaskIds || []
  const children = childIds.map((id) => store.teamTask(id)).filter(Boolean)
  if (!children.length || children.some((task) => !isTeamTaskTerminal(task.status))) return
  if (root.sourceConversationId && agentRunners.has(root.sourceConversationId)) {
    pendingCollaborationChecks.set(rootTaskId, setTimeout(() => void completeCollaborationRoot(rootTaskId), 1_000))
    return
  }
  const synthesisRunner = createHarnessRunner()
  collaborationRunners.set(rootTaskId, synthesisRunner)
  store.updateTeamTask(rootTaskId, 'synthesizing', { error: '' })
  auditTeamTask(rootTaskId, 'synthesizing', '所有子 Agent 已结束，根 Agent 正在综合结果。')
  const reports = children.map((task) => [
    `## ${task.context?.agentPath || task.title} · ${task.title}`,
    `状态：${task.status}`,
    task.result ? `结果：\n${task.result}` : `未完成原因：${task.error || '未知'}`,
  ].join('\n')).join('\n\n')
  const prompt = `你是 Stable Team 的根 Agent。根据用户原始目标和各子 Agent 的隔离结果，生成一份简体中文最终交付。\n\n要求：\n1. 综合而不是逐条复述；\n2. 明确标注未完成或证据不足的部分；\n3. 不暴露内部规划或思考过程；\n4. 不调用工具，只输出最终答案。\n\n用户目标：\n${root.instruction}\n\n子 Agent 结果：\n${reports}`
  try {
    const { model, apiKey } = collaborationModelRoutes.get(rootTaskId) || modelRouteForConversation(root.sourceConversationId)
    const answer = await synthesisRunner.run(prompt, model, apiKey, 0, () => {}, 'read-only')
    if (root.sourceConversationId && store.conversation(root.sourceConversationId)) store.addMessage(root.sourceConversationId, 'assistant', answer)
    store.updateTeamTask(rootTaskId, 'success', { result: answer, error: '' })
    auditTeamTask(rootTaskId, 'synthesis_completed', '根 Agent 已综合子任务并返回来源对话。')
  } catch (error) {
    store.updateTeamTask(rootTaskId, 'failed', { error: error.message })
    auditTeamTask(rootTaskId, 'synthesis_failed', `根 Agent 综合失败：${error.message}`)
  } finally {
    collaborationRunners.delete(rootTaskId)
    collaborationModelRoutes.delete(rootTaskId)
  }
}

async function startTeamCollaboration({ sourceConversationId, title, instruction }) {
  const profile = store.teamProfile()
  if (!profile) throw new Error('请先创建或加入 Team。')
  if (!store.conversation(sourceConversationId)) throw new Error('找不到来源对话。')
  if (!store.listTeamDevices().some((item) => item.id !== profile.deviceId && item.status === 'online')) throw new Error('当前没有在线远程 Agent。')
  const modelRoute = modelRouteForConversation(sourceConversationId)
  const root = store.saveTeamTask({
    direction: 'outbound', sourceDeviceId: profile.deviceId, targetDeviceId: profile.deviceId,
    sourceConversationId, title, instruction,
    context: { kind: 'root', agentPath: '/root', childTaskIds: [], maxConcurrentSubagents: teamPreferences().maxConcurrentSubagents },
    status: 'planning',
  })
  collaborationModelRoutes.set(root.id, modelRoute)
  auditTeamTask(root.id, 'planning', '根 Agent 正在拆分独立且有边界的子任务。')
  const planningRunner = createHarnessRunner()
  collaborationRunners.set(root.id, planningRunner)
  const available = store.listTeamDevices().filter((item) => item.id !== profile.deviceId && item.status === 'online').map((item) => ({
    name: item.name, skills: item.capabilities?.skills || [], scripts: item.capabilities?.scripts || [],
    tools: item.capabilities?.tools || [], plugins: item.capabilities?.plugins || [],
    data: item.capabilities?.dataCount || 0, knowledge: item.capabilities?.knowledgeCount || 0,
  }))
  const planningPrompt = `你是 Stable Team 的根任务规划器。把目标拆成 2 到 ${teamPreferences().maxConcurrentSubagents} 个可以并行、互不依赖、无共享写入的子任务。若目标存在顺序依赖，把相邻步骤合并到同一个子任务。只返回 JSON，不调用工具。\n\nJSON 格式：{"summary":"拆分说明","subtasks":[{"title":"名称","instruction":"完整执行要求","requiredCapabilities":["skill:名称|script:名称|tool:名称|plugin:名称|data|knowledge"],"expectedOutput":"交付格式"}]}\n\n可用远程设备能力：${JSON.stringify(available)}\n\n用户目标：${instruction}`
  try {
    const rawPlan = await planningRunner.run(planningPrompt, modelRoute.model, modelRoute.apiKey, 0, () => {}, 'read-only')
    const plan = parseCollaborationPlan(rawPlan, teamPreferences().maxConcurrentSubagents)
    auditTeamTask(root.id, 'planned', `${plan.subtasks.length} 个子任务已生成，将并行派发。`)
    const childTaskIds = []
    for (const [index, subtask] of plan.subtasks.entries()) {
      try {
        const child = createOutboundTeamTask({
          targetDeviceId: 'auto', sourceConversationId, title: subtask.title,
          instruction: `${subtask.instruction}${subtask.expectedOutput ? `\n\n期望交付：${subtask.expectedOutput}` : ''}`,
          context: {
            kind: 'child', rootTaskId: root.id, parentTaskId: root.id,
            agentPath: `/root/worker-${index + 1}`, requiredCapabilities: subtask.requiredCapabilities,
          },
        })
        childTaskIds.push(child.id)
      } catch (error) {
        const failed = store.saveTeamTask({
          direction: 'outbound', sourceDeviceId: profile.deviceId, targetDeviceId: '', sourceConversationId,
          title: subtask.title, instruction: subtask.instruction,
          context: { kind: 'child', rootTaskId: root.id, parentTaskId: root.id, agentPath: `/root/worker-${index + 1}`, requiredCapabilities: subtask.requiredCapabilities },
          status: 'failed', error: error.message,
        })
        auditTeamTask(failed.id, 'routing_failed', error.message)
        childTaskIds.push(failed.id)
      }
    }
    store.patchTeamTask(root.id, { status: 'running', context: { planSummary: plan.summary, childTaskIds } })
    auditTeamTask(root.id, 'children_running', '子 Agent 已并行启动，根 Agent 正在等待。')
    scheduleCollaborationCheck(root.id)
  } catch (error) {
    collaborationModelRoutes.delete(root.id)
    store.updateTeamTask(root.id, 'failed', { error: error.message })
    auditTeamTask(root.id, 'planning_failed', `协作规划失败：${error.message}`)
  } finally {
    collaborationRunners.delete(root.id)
  }
  return teamState()
}

async function handleTeamNetworkEvent(event) {
  if (event.type === 'connection') {
    teamConnection = event.status === 'online' ? 'online' : 'offline'
    publishTeam()
    return
  }
  if (event.type === 'roster') {
    store.replaceTeamDevices(event.devices || [])
    publishTeam()
    return
  }
  if (event.type === 'delivery-queued' && event.taskId) {
    auditTeamTask(event.taskId, 'delivery_queued', '目标设备暂时离线，Relay 已保留任务，设备恢复后自动送达。')
    return
  }
  if (event.type !== 'route' || !event.payload) return
  const payload = event.payload
  if (payload.type === 'conversation:offer') {
    const source = store.listTeamDevices().find((item) => item.id === event.sourceDeviceId)
    const offer = normalizeConversationOffer(payload, event.sourceDeviceId, source?.name)
    store.saveTeamConversationOffer(offer)
    auditTeam('conversation_received', `收到 ${offer.sourceDeviceName} 发来的对话“${offer.title}”，等待本机确认。`)
    return
  }
  if (payload.type === 'conversation:decision') {
    const source = store.listTeamDevices().find((item) => item.id === event.sourceDeviceId)
    auditTeam(payload.allowed ? 'conversation_accepted' : 'conversation_rejected', `${source?.name || '远程设备'}${payload.allowed ? '已接收' : '已拒绝'}对话“${String(payload.title || 'Team 对话').slice(0, 80)}”。`)
    return
  }
  if (payload.type === 'team:role') {
    const source = store.listTeamDevices().find((item) => item.id === event.sourceDeviceId)
    const profile = store.teamProfile()
    if (source?.role !== 'owner' || !profile || !['admin', 'member'].includes(payload.role)) return
    const next = teamNetwork.updateProfile({ role: payload.role })
    store.saveTeamProfile(next)
    auditTeam('role_received', `本设备角色已调整为 ${payload.role === 'admin' ? '管理员' : '成员'}。`)
    return
  }
  if (payload.type === 'task:create') {
    const profile = store.teamProfile()
    const existing = store.teamTask(payload.taskId)
    if (existing) {
      auditTeamTask(existing.id, 'duplicate_ignored', '收到重复任务投递，已按现有状态幂等处理。')
      if (existing.status === 'success') teamNetwork.send(existing.sourceDeviceId, { type: 'task:result', taskId: existing.id, result: existing.result })
      else if (['failed', 'cancelled'].includes(existing.status)) teamNetwork.send(existing.sourceDeviceId, { type: 'task:error', taskId: existing.id, error: existing.error, cancelled: existing.status === 'cancelled' })
      else if (existing.status === 'rejected') teamNetwork.send(existing.sourceDeviceId, { type: 'task:decision', taskId: existing.id, allowed: false })
      else if (['accepted', 'running'].includes(existing.status)) teamNetwork.send(existing.sourceDeviceId, { type: 'task:decision', taskId: existing.id, allowed: true })
      return
    }
    const task = store.saveTeamTask({
      id: payload.taskId, direction: 'inbound', sourceDeviceId: event.sourceDeviceId, targetDeviceId: profile.deviceId,
      sourceConversationId: payload.sourceConversationId, title: payload.title, instruction: payload.instruction,
      context: payload.context || {}, status: 'waiting_approval', createdAt: payload.createdAt,
    })
    const automatic = shouldAutoApprove(teamPreferences(), event.sourceDeviceId, task.context?.requiredCapabilities || [])
    if (automatic) {
      store.updateTeamTask(task.id, 'accepted')
      auditTeamTask(task.id, 'auto_approved', '任务符合本机信任策略，已自动批准。')
      teamNetwork.send(task.sourceDeviceId, { type: 'task:decision', taskId: task.id, allowed: true, automatic: true })
      void executeInboundTeamTask(task.id)
    } else auditTeamTask(task.id, 'waiting_approval', '收到远端 AI Work，等待本机批准。')
    return
  }
  const task = store.teamTask(payload.taskId)
  if (!task) return
  if (payload.type === 'task:decision') {
    store.updateTeamTask(task.id, payload.allowed ? 'accepted' : 'rejected')
    auditTeamTask(task.id, payload.allowed ? 'accepted' : 'rejected', payload.allowed ? (payload.automatic ? '目标设备按信任策略自动批准任务。' : '目标设备已批准任务。') : '目标设备拒绝了任务。')
    if (!payload.allowed && !retryTeamTask(task, '目标设备拒绝任务。')) scheduleCollaborationCheck(task.context?.rootTaskId)
  } else if (payload.type === 'task:result') {
    const completed = store.updateTeamTask(task.id, 'success', { result: payload.result })
    auditTeamTask(task.id, 'result_received', '远端结果已返回，准备继续来源对话。')
    if (completed.context?.kind === 'child') scheduleCollaborationCheck(completed.context.rootTaskId)
    else void continueSourceConversation(completed)
  } else if (payload.type === 'task:error') {
    const failed = store.updateTeamTask(task.id, payload.cancelled ? 'cancelled' : 'failed', { error: payload.error })
    auditTeamTask(task.id, payload.cancelled ? 'cancelled' : 'failed', payload.error)
    if (!payload.cancelled && retryTeamTask(failed, '远程执行失败。')) return
    if (failed.context?.kind === 'child') scheduleCollaborationCheck(failed.context.rootTaskId)
  } else if (payload.type === 'task:cancel') {
    teamTaskRunners.get(task.id)?.cancel()
    store.updateTeamTask(task.id, 'cancelled', { error: '来源设备已取消任务。' })
    auditTeamTask(task.id, 'cancelled', '来源设备已取消任务。')
    if (task.context?.kind === 'child') scheduleCollaborationCheck(task.context.rootTaskId)
  }
}

const LIBRARY_CATEGORIES = new Set(['collection', 'cleaning', 'processing'])

function requireLibraryCategory(value) {
  if (!LIBRARY_CATEGORIES.has(value)) throw new Error('未知的数据资产分类。')
  return value
}

function libraryRoot(category) {
  return path.join(paths.userData, 'data-library', requireLibraryCategory(category))
}

function migrateLegacyLibraryScripts() {
  for (const item of store.listLibrary().filter((entry) => entry.kind === 'script')) {
    const targetRoot = libraryRoot(item.category)
    if (isInside(targetRoot, item.path) || !existsSync(item.path)) continue
    const packageRoot = path.join(targetRoot, randomUUID())
    try {
      const migratedPath = migrateScriptPackage(item.path, item.category, packageRoot)
      store.updateLibraryPath(item.id, migratedPath)
    } catch (error) {
      cleanupPackage(packageRoot)
      console.warn(`Stable 未能迁移旧脚本“${item.name}”：${error.message}`)
    }
  }
}

function knowledgeRoot() { return path.join(paths.userData, 'knowledge-library') }
function reportRoot() { return path.join(paths.userData, 'report-library') }

function importReportPaths(inputPaths) {
  const root = reportRoot()
  mkdirSync(root, { recursive: true })
  let added = 0
  for (const sourcePath of requirePaths(inputPaths, 'HTML 报告')) {
    const info = statSync(sourcePath)
    const extension = path.extname(sourcePath).toLowerCase()
    if (!info.isFile() || !['.html', '.htm'].includes(extension)) throw new Error(`报告库不支持“${path.basename(sourcePath)}”，请导入 HTML 或 HTM 文件。`)
    if (info.size > 10_000_000) throw new Error(`“${path.basename(sourcePath)}”超过 10 MB，未导入。`)
    const id = randomUUID()
    const targetPath = path.join(root, `${id}.html`)
    copyFileSync(sourcePath, targetPath)
    const html = readFileSync(targetPath, 'utf8')
    store.saveReport({ id, name: path.basename(sourcePath, extension), path: targetPath, mode: 'source', components: [], html })
    added += 1
  }
  return { added, items: store.listReports() }
}

function saveReportDraft(payload) {
  const name = requireText(payload?.name, '报告名称', 100)
  const mode = payload?.mode === 'source' || payload?.mode === 'studio' ? payload.mode : 'builder'
  const existing = payload?.id ? store.reportItem(requireText(payload.id, '报告 ID', 100)) : undefined
  if (payload?.id && !existing) throw new Error('找不到这份报告。')
  const id = existing?.id || randomUUID()
  const components = Array.isArray(payload?.components) ? payload.components.slice(0, 200) : []
  const html = mode === 'source' || mode === 'studio' ? String(payload?.html || '') : renderReportHtml({ name, mode, components })
  if (html.length > 10_000_000) throw new Error('HTML 内容不能超过 10 MB。')
  const root = reportRoot()
  mkdirSync(root, { recursive: true })
  const targetPath = existing?.path || path.join(root, `${id}.html`)
  if (!isInside(root, targetPath)) throw new Error('报告路径不在 Stable 私有目录内，已停止保存。')
  writeFileSync(targetPath, html, 'utf8')
  store.saveReport({ id, name, path: targetPath, mode, components, html })
  return { item: store.reportItem(id), items: store.listReports() }
}

function markdownSummary(content) {
  const lines = String(content).replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  const paragraph = lines.find((line) => !line.startsWith('#') && !line.startsWith('```')) || 'Markdown 文档'
  return paragraph.replace(/^[-*>]\s*/, '').slice(0, 160)
}

function publishLibraryEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:library:event', event)
}

function requirePaths(value, label = '文件', max = 500) {
  if (!Array.isArray(value) || !value.length) throw new Error(`没有收到可用的${label}路径。`)
  if (value.length > max) throw new Error(`一次最多处理 ${max} 个${label}。`)
  const paths = [...new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
  if (!paths.length) throw new Error(`没有收到可用的${label}路径。`)
  for (const sourcePath of paths) if (!existsSync(sourcePath)) throw new Error(`找不到：${sourcePath}`)
  return paths
}

async function importDataPaths(inputPaths) {
  let added = 0
  for (const filePath of requirePaths(inputPaths, '数据文件')) {
    const extracted = await extractText(filePath)
    store.upsertData({ name: path.basename(filePath), path: filePath, ...extracted })
    added += 1
  }
  return { added, items: store.listData() }
}

function importProcessingPaths(inputPaths) {
  const targetRoot = libraryRoot('processing')
  mkdirSync(targetRoot, { recursive: true })
  let added = 0
  for (const sourcePath of requirePaths(inputPaths, 'Markdown 文件')) {
    if (!statSync(sourcePath).isFile()) throw new Error('数据加工只支持 MD 和 MARKDOWN 文件，不能导入文件夹。')
    const extension = path.extname(sourcePath).toLowerCase()
    if (!['.md', '.markdown'].includes(extension)) throw new Error(`数据加工不支持“${path.basename(sourcePath)}”，请拖入 MD 或 MARKDOWN 文件。`)
    if (statSync(sourcePath).size > 2_000_000) throw new Error(`“${path.basename(sourcePath)}”超过 2 MB，未导入。`)
    const targetPath = path.join(targetRoot, `${randomUUID()}${extension}`)
    copyFileSync(sourcePath, targetPath)
    const content = readFileSync(targetPath, 'utf8')
    store.addLibraryItem({ category: 'processing', kind: 'markdown', name: path.basename(sourcePath), description: markdownSummary(content), path: targetPath, extension: extension.slice(1), content })
    added += 1
  }
  return { added, items: store.listLibrary() }
}

function importKnowledgePaths(inputPaths) {
  let added = 0
  for (const sourcePath of requirePaths(inputPaths, '知识文件')) {
    const info = statSync(sourcePath)
    const sourceRoot = info.isDirectory() ? sourcePath : ''
    const documents = info.isDirectory() ? collectMarkdownFiles(sourcePath) : [sourcePath]
    if (!documents.length) throw new Error(`“${path.basename(sourcePath)}”中没有找到 Markdown 文件。`)
    const copied = copyMarkdownDocuments(documents, knowledgeRoot(), sourceRoot)
    for (const item of copied) {
      const content = readFileSync(item.path, 'utf8')
      store.addKnowledge({ ...item, content, summary: markdownSummary(content) })
    }
    added += copied.length
  }
  return { added, items: store.listKnowledge() }
}

function inspectAgentAttachments(inputPaths) {
  const files = requirePaths(inputPaths, '临时附件', 8).map(inspectAttachmentPath)
  const totalSize = files.reduce((sum, item) => sum + item.size, 0)
  if (totalSize > 100 * 1024 * 1024) throw new Error('本次临时附件总大小不能超过 100 MB。')
  const imageSize = files.filter(isImageAttachment).reduce((sum, item) => sum + item.size, 0)
  if (imageSize > MAX_MESSAGE_IMAGE_BYTES) throw new Error('本次图片总大小不能超过 10 MB。')
  return files.map(({ content: _content, description: _description, ...item }) => item)
}

async function extractAgentAttachments(rawAttachments, conversationId) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return { items: [], installedSkills: [] }
  const inspected = inspectAgentAttachments(rawAttachments.map((item) => item?.path))
  const skillPaths = new Set(rawAttachments.filter((item) => item?.type === 'skill').map((item) => item?.path))
  for (let index = 0; index < inspected.length; index += 1) {
    if (skillPaths.has(inspected[index].path)) inspected[index] = inspectSkillFolder(inspected[index].path)
  }
  const attachments = []
  const installedSkills = []
  const attachmentRoot = path.join(paths.workspace, '.stable', 'attachments', String(conversationId || 'conversation').replace(/[^a-z0-9_-]/gi, '_'))
  const draftImageRoot = path.join(paths.workspace, '.stable', 'draft-images')
  const materializedRoots = []
  const consumedDraftImages = []
  try {
    for (const item of inspected) {
      const accessibleItem = item.type === 'skill' ? item : materializeAttachment(item.path, attachmentRoot, paths.workspace)
      if (item.type !== 'skill') materializedRoots.push(accessibleItem.materializedRoot)
      const source = item.type === 'skill' ? inspectSkillFolder(item.path) : await extractAttachmentText(accessibleItem.path)
      if (item.type === 'skill') {
        const installed = importSkillFolder(item.path, path.join(paths.userData, 'skills'))
        store.upsertSkill(installed)
        installedSkills.push(installed.name)
        attachments.push({ name: item.name, size: item.size, type: item.type, text: installed.content })
      } else {
        attachments.push({
          name: accessibleItem.name, path: accessibleItem.path, size: accessibleItem.size, type: accessibleItem.type, text: source.text,
          ...(isImageAttachment(accessibleItem) ? { mediaType: accessibleItem.mediaType } : {}),
        })
        const relativeDraft = path.relative(path.resolve(draftImageRoot), path.resolve(item.path))
        if (relativeDraft && !relativeDraft.startsWith('..') && !path.isAbsolute(relativeDraft)) consumedDraftImages.push(item.path)
      }
    }
  } catch (error) {
    for (const materializedRoot of materializedRoots) {
      try { removeMaterializedAttachmentRoot(materializedRoot, paths.workspace) } catch {}
    }
    throw error
  }
  return { items: attachments, installedSkills, consumedDraftImages }
}

async function importLibraryFiles(category) {
  const isProcessing = category === 'processing'
  if (!isProcessing) return importScriptAsset(category)
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入数据加工 Markdown',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })
  if (result.canceled) return { added: 0, items: store.listLibrary() }
  return importProcessingPaths(result.filePaths)
}

async function importKnowledge() {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'question', title: '导入知识库', message: '选择 Markdown 的导入方式',
    detail: 'Stable 会保存一份本地副本，原文件保持不变。',
    buttons: ['取消', '选择文件', '选择文件夹'], defaultId: 1, cancelId: 0, noLink: true,
  })
  if (choice.response === 0) return { added: 0, items: store.listKnowledge() }
  let sourcePaths = []; let sourceRoot = ''
  if (choice.response === 1) {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Markdown 文件', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (selected.canceled) return { added: 0, items: store.listKnowledge() }
    sourcePaths = selected.filePaths
  } else {
    const selected = await dialog.showOpenDialog(mainWindow, { title: '选择 Markdown 文件夹', properties: ['openDirectory'] })
    if (selected.canceled) return { added: 0, items: store.listKnowledge() }
    sourceRoot = selected.filePaths[0]
    sourcePaths = collectMarkdownFiles(sourceRoot)
  }
  if (!sourcePaths.length) throw new Error('没有找到可导入的 Markdown 文件。')
  if (sourceRoot) return importKnowledgePaths([sourceRoot])
  return importKnowledgePaths(sourcePaths)
}

async function chooseScriptEntry(root, candidates = []) {
  if (candidates.length === 1) return candidates[0]
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择脚本包的入口文件',
    defaultPath: root,
    properties: ['openFile'],
    filters: [{ name: '入口脚本', extensions: ['py', 'ps1', 'cmd', 'bat'] }],
  })
  if (result.canceled) return ''
  return requireScriptPath(result.filePaths[0], root)
}

function addScriptLibraryItem(category, entryPath, description) {
  const extension = path.extname(entryPath).toLowerCase()
  store.addLibraryItem({
    category,
    kind: 'script',
    name: path.basename(entryPath),
    description,
    path: entryPath,
    extension: extension.slice(1),
    content: '',
  })
}

async function importScriptPaths(category, inputPaths) {
  const label = category === 'collection' ? '数据采集' : '数据清洗'
  const targetRoot = libraryRoot(category)
  mkdirSync(targetRoot, { recursive: true })
  let added = 0
  for (const sourcePath of requirePaths(inputPaths, `${label}脚本`)) {
    const packageRoot = path.join(targetRoot, randomUUID())
    try {
      const info = statSync(sourcePath)
      if (info.isDirectory()) {
        const scanned = scanPackage(sourcePath)
        if (!scanned.scripts.length) throw new Error(`“${path.basename(sourcePath)}”中没有找到 PY、PS1、CMD 或 BAT 脚本。`)
        const entrySource = await chooseScriptEntry(sourcePath, scanned.scripts)
        if (!entrySource) continue
        const entryPath = copyScriptFolder(sourcePath, packageRoot, entrySource)
        addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} 完整脚本包`)
      } else if (info.isFile() && path.extname(sourcePath).toLowerCase() === '.zip') {
        const extracted = await extractScriptZip(sourcePath, packageRoot)
        const entryPath = await chooseScriptEntry(packageRoot, extracted.scripts)
        if (!entryPath) { cleanupPackage(packageRoot); continue }
        addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} ZIP 脚本包`)
      } else if (info.isFile() && SCRIPT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) {
        if (info.size > 20_000_000) throw new Error(`“${path.basename(sourcePath)}”超过 20 MB，未导入。`)
        const entryPath = copySingleScript(sourcePath, packageRoot)
        addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} 单文件脚本`)
      } else {
        throw new Error(`${label}不支持“${path.basename(sourcePath)}”，请拖入脚本、完整文件夹或 ZIP。`)
      }
      added += 1
    } catch (error) {
      cleanupPackage(packageRoot)
      throw error
    }
  }
  return { added, items: store.listLibrary() }
}

async function importScriptAsset(category) {
  const label = category === 'collection' ? '数据采集' : '数据清洗'
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: `导入${label}脚本`,
    message: '这个脚本是否带有 runtime、src 或其他依赖文件？',
    detail: '有依赖时请选择完整文件夹或 ZIP。Stable 会完整复制脚本包，原文件保持不变。',
    buttons: ['取消', '单个脚本', '完整文件夹', 'ZIP 脚本包'],
    defaultId: 2,
    cancelId: 0,
    noLink: true,
  })
  if (choice.response === 0) return { added: 0, items: store.listLibrary() }
  const targetRoot = libraryRoot(category)
  mkdirSync(targetRoot, { recursive: true })

  if (choice.response === 1) {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: `选择${label}脚本`, properties: ['openFile', 'multiSelections'],
      filters: [{ name: '可执行脚本', extensions: ['py', 'ps1', 'cmd', 'bat'] }],
    })
    if (selected.canceled) return { added: 0, items: store.listLibrary() }
    let added = 0
    for (const sourcePath of selected.filePaths) {
      if (!SCRIPT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) continue
      if (statSync(sourcePath).size > 20_000_000) throw new Error('单个脚本文件不能超过 20 MB。')
      const packageRoot = path.join(targetRoot, randomUUID())
      try {
        const entryPath = copySingleScript(sourcePath, packageRoot)
        addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} 单文件脚本`)
        added += 1
      } catch (error) {
        cleanupPackage(packageRoot)
        throw error
      }
    }
    return { added, items: store.listLibrary() }
  }

  if (choice.response === 2) {
    const selected = await dialog.showOpenDialog(mainWindow, { title: `选择${label}脚本的完整文件夹`, properties: ['openDirectory'] })
    if (selected.canceled) return { added: 0, items: store.listLibrary() }
    const sourceRoot = selected.filePaths[0]
    const entrySource = await chooseScriptEntry(sourceRoot)
    if (!entrySource) return { added: 0, items: store.listLibrary() }
    const packageRoot = path.join(targetRoot, randomUUID())
    try {
      const entryPath = copyScriptFolder(sourceRoot, packageRoot, entrySource)
      addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} 完整脚本包`)
      return { added: 1, items: store.listLibrary() }
    } catch (error) {
      cleanupPackage(packageRoot)
      throw error
    }
  }

  const selected = await dialog.showOpenDialog(mainWindow, {
    title: `选择${label} ZIP 脚本包`, properties: ['openFile'], filters: [{ name: 'ZIP 脚本包', extensions: ['zip'] }],
  })
  if (selected.canceled) return { added: 0, items: store.listLibrary() }
  const packageRoot = path.join(targetRoot, randomUUID())
  try {
    const extracted = await extractScriptZip(selected.filePaths[0], packageRoot)
    const entryPath = await chooseScriptEntry(packageRoot, extracted.scripts)
    if (!entryPath) {
      cleanupPackage(packageRoot)
      return { added: 0, items: store.listLibrary() }
    }
    addScriptLibraryItem(category, entryPath, `${path.extname(entryPath).slice(1).toUpperCase()} ZIP 脚本包`)
    return { added: 1, items: store.listLibrary() }
  } catch (error) {
    cleanupPackage(packageRoot)
    throw error
  }
}

function qaMessages() {
  const previewPath = paths ? path.join(paths.workspace, process.env.STABLE_QA_HTML_FIXTURE ? 'qa-preview.html' : 'qa-preview.md') : ''
  const imagePath = paths && process.env.STABLE_QA_IMAGE_FIXTURE ? path.join(paths.workspace, 'qa-image.png') : ''
  if (previewPath && (process.env.STABLE_QA_FIXTURE || process.env.STABLE_QA_CONVERSATION_FIXTURE)) {
    writeFileSync(previewPath, process.env.STABLE_QA_HTML_FIXTURE
      ? '<!doctype html><meta charset="utf-8"><title>Stable HTML 内置浏览器</title><button id="verify" onclick="this.textContent=\'交互已启用\'">验证交互</button><script>document.documentElement.dataset.stableQa=\'ready\'</script>'
      : '# 对话文件预览\n\n用于验证 Stable 可调宽侧边 Markdown 面板。\n\n| 项目 | 状态 |\n| --- | --- |\n| 同窗侧栏 | 已打开 |', 'utf8')
  }
  if (imagePath) {
    const imageSource = process.env.STABLE_QA_IMAGE_SOURCE && existsSync(process.env.STABLE_QA_IMAGE_SOURCE)
      ? path.resolve(process.env.STABLE_QA_IMAGE_SOURCE)
      : resourcePath('build', 'stable_logo.png')
    copyFileSync(imageSource, imagePath)
  }
  const trace = [
    { id: 'context', runId: 'qa-run', kind: 'context', title: '准备本次上下文', detail: '2 条相关数据 · 1 个 Skill · deepseek-v4-flash', status: 'completed', time: 1 },
    { id: 'root:agent', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/end', sessionId: 'root', depth: 0, title: 'Stable 总控', detail: '已完成任务', status: 'completed', time: 4100 },
    { id: 'research:descriptor', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/descriptor', sessionId: 'research', parentSessionId: 'root', depth: 1, title: '资料核验', detail: 'continuable · spawn', mode: 'continuable', provider: 'spawn', status: 'completed', time: 120 },
    { id: 'research:agent', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/end', sessionId: 'research', parentSessionId: 'root', depth: 1, title: '资料核验', detail: '已向总控提交结果', status: 'completed', time: 2650 },
    { id: 'analysis:descriptor', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/descriptor', sessionId: 'analysis', parentSessionId: 'root', depth: 1, title: '数据分析', detail: 'continuable · spawn', mode: 'continuable', provider: 'spawn', status: 'completed', time: 180 },
    { id: 'analysis:agent', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/end', sessionId: 'analysis', parentSessionId: 'root', depth: 1, title: '数据分析', detail: '已向总控提交结果', status: 'completed', time: 3120 },
    { id: 'review:descriptor', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/descriptor', sessionId: 'review', parentSessionId: 'root', depth: 1, title: '结论审查', detail: 'one-shot · fork', mode: 'one-shot', provider: 'fork', status: 'completed', time: 240 },
    { id: 'review:agent', runId: 'qa-run', kind: 'status', entity: 'agent', eventType: 'agent/end', sessionId: 'review', parentSessionId: 'root', depth: 1, title: '结论审查', detail: '已向总控提交结果', status: 'completed', time: 3500 },
    { id: 'analysis:tool:qa', runId: 'qa-run', kind: 'tool', entity: 'tool', eventType: 'tool/end', sessionId: 'analysis', parentSessionId: 'root', depth: 1, title: '使用工具 read', detail: '执行完成', status: 'completed', time: 2100 },
    { id: 'complete', runId: 'qa-run', kind: 'status', title: '任务完成', detail: '执行过程已自动折叠', status: 'completed', time: 4100 },
  ]
  const answer = '# 本周行动建议\n\n已结合本地资料完成整理，建议优先处理以下事项：\n\n- **第一优先级**：核对会员第二单转化，定位最近 30 天的流失节点。\n- **第二优先级**：把高意向未复购用户拆成可执行名单。\n- **第三优先级**：用小范围对照测试验证触达策略。\n\n```text\n目标：先验证，再扩大。\n```\n\n> 所有结论均来自当前已启用的数据，未检索到的部分会明确标记为缺口。'
  const previewIndex = process.env.STABLE_QA_HTML_FIXTURE ? 1 : 3
  if (imagePath) return [
    { id: 'qa-image-user', role: 'user', content: '看一下这个图片', attachments: [{ kind: 'attachment', name: 'qa-image.png', path: imagePath, size: statSync(imagePath).size, type: 'png' }], createdAt: new Date(0).toISOString() },
    { id: 'qa-image-assistant', role: 'assistant', content: '图片已收到，可以继续分析。', trace, createdAt: new Date(1).toISOString() },
  ]
  return Array.from({ length: 4 }, (_, index) => [
    { id: `qa-user-${index}`, role: 'user', content: index ? `继续展开第 ${index + 1} 项，并给出执行清单` : '读取我导入的数据，整理一份本周行动清单', ...(index === previewIndex && previewPath ? { attachments: [{ kind: 'attachment', name: path.basename(previewPath), path: previewPath, size: statSync(previewPath).size, type: path.extname(previewPath).slice(1) }] } : {}), createdAt: new Date(index * 2).toISOString() },
    { id: `qa-assistant-${index}`, role: 'assistant', content: index === previewIndex && previewPath ? `${answer}\n\n交付文件：\n- ${previewPath}` : answer, trace, createdAt: new Date(index * 2 + 1).toISOString() },
  ]).flat()
}

function requireText(value, name, max = 200_000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}不能为空。`)
  if (value.length > max) throw new Error(`${name}过长。`)
  return value.trim()
}

async function runStoredScript(item, onEvent = () => {}, runOptions = {}, worker = scriptRunner) {
  if (!item || item.kind !== 'script') throw new Error('找不到这个脚本。')
  if (!isInside(libraryRoot(item.category), item.path)) throw new Error('旧脚本包无法迁入当前 Stable 私有目录，请删除后重新导入。')
  if (runOptions.confirm !== false) {
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'question', title: '执行本地脚本', message: `运行“${item.name}”？`,
      detail: `脚本将在 Stable 工作区中以当前用户权限运行：\n${paths.workspace}`,
      buttons: ['取消', '运行'], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (confirmation.response !== 1) return { cancelled: true }
  }
  const scriptOptions = { ...runOptions }
  delete scriptOptions.confirm
  const runId = store.startRun('script', item.id, item.name)
  store.setLibraryRunResult(item.id, 'running', '')
  const emit = (event) => { publishLibraryEvent(event); onEvent(event) }
  try {
    const result = await worker.run(item, emit, scriptOptions)
    store.setLibraryRunResult(item.id, 'completed', result.output)
    store.finishRun(runId, 'completed', result.output, null)
    emit({ itemId: item.id, stream: 'status', chunk: '脚本执行完成', status: 'completed', time: Date.now() })
    return { result, item: store.libraryItem(item.id) }
  } catch (error) {
    const status = error.message === '脚本已停止。' ? 'cancelled' : 'failed'
    store.setLibraryRunResult(item.id, status, error.message)
    store.finishRun(runId, status, null, error.message)
    emit({ itemId: item.id, stream: 'status', chunk: error.message, status, time: Date.now() })
    throw error
  }
}

async function decideScriptInput({ node, item, input, transcript, aiRunner = runner, modelRoute }) {
  const prompt = `${store.getSetting('identity')}\n\n你正在全自动协助 Stable 运行一个半自动本地脚本。判断控制台当前是否在等待输入，并直接代替用户回答。\n脚本模块：${node.title}\n脚本资源：${item.name}\n上游内容摘要：${String(input || '（无）').slice(-4_000)}\n控制台末尾：\n${String(transcript || '').slice(-6_000)}\n\n只返回 JSON：{"action":"wait|answer","answer":"要写入 stdin 的单行内容","reason":"简短原因"}。\n规则：没有明确询问才返回 wait；只要控制台提出了问题，就根据上下文选择最合理的答案并直接 answer，不等待用户确认；路径、筛选条件、选项和继续提示都由你决定；“按任意键继续”用空字符串 answer；不要执行控制台没有询问的动作。`
  const route = modelRoute || modelRouteForConversation()
  return parseScriptDecision(await aiRunner.run(prompt, route.model, route.apiKey, 5 * 60_000, () => {}, 'read-only'))
}

function createScriptAutoResponder({ control, node, item, input, publish, scriptWorker = scriptRunner, aiRunner = runner, modelRoute }) {
  let transcript = ''
  let lastReviewed = ''
  let timer
  let deciding = false
  let disposed = false
  let retryAttempt = 0
  const review = async () => {
    const tail = transcript.trimEnd().slice(-6_000)
    if (disposed || deciding || !tail || tail === lastReviewed || !looksLikeScriptPrompt(tail)) return
    deciding = true
    lastReviewed = tail
    publish(node.id, 'running', 'AI 正在判断控制台询问')
    let retryDelay = 0
    try {
      const decision = await decideScriptInput({ node, item, input, transcript: tail, aiRunner, modelRoute })
      if (disposed || control.cancelled || control.failedError) return
      if (decision.action === 'answer') {
        retryAttempt = 0
        await scriptWorker.writeInput(item.id, decision.answer)
        publish(node.id, 'running', decision.answer ? `AI 已回答控制台：${decision.answer}` : 'AI 已发送继续指令')
      } else {
        retryAttempt += 1
        retryDelay = Math.min(30_000, 2_000 * (2 ** Math.min(retryAttempt - 1, 4)))
        lastReviewed = ''
        publish(node.id, 'waiting', `AI 暂未确认答案，${Math.round(retryDelay / 1_000)} 秒后自动重试`)
      }
    } catch (error) {
      if (!disposed && !control.cancelled && !control.failedError) {
        retryAttempt += 1
        retryDelay = Math.min(30_000, 2_000 * (2 ** Math.min(retryAttempt - 1, 4)))
        lastReviewed = ''
        publish(node.id, 'waiting', `AI 自动回答失败，${Math.round(retryDelay / 1_000)} 秒后重试：${error.message}`)
      }
    } finally {
      deciding = false
      if (!disposed && !control.cancelled && !control.failedError && retryDelay) timer = setTimeout(() => void review(), retryDelay)
      else if (!disposed && transcript.trimEnd().slice(-6_000) !== lastReviewed) timer = setTimeout(() => void review(), 350)
    }
  }
  return {
    onEvent(event) {
      if (event.stream === 'status') {
        if (event.status === 'waiting') publish(node.id, 'waiting', event.chunk)
        return
      }
      if (!['stdout', 'stderr'].includes(event.stream)) return
      transcript = `${transcript}${event.chunk}`.slice(-20_000)
      clearTimeout(timer)
      timer = setTimeout(() => void review(), 350)
    },
    dispose() { disposed = true; clearTimeout(timer) },
  }
}

const AGENT_CAPABILITIES = new Set(['auto', 'fast', 'reasoning', 'analysis'])

function agentState(conversationId = store.activeConversationId()) {
  return {
    conversations: store.listConversations(),
    activeConversationId: conversationId,
    messages: store.listMessages(conversationId),
  }
}

async function prepareAgentMessage(payload, conversationId, modelRoute) {
  const rawAttachments = Array.isArray(payload?.attachments) ? payload.attachments : []
  const requestedAttachments = rawAttachments.length ? inspectAgentAttachments(rawAttachments.map((item) => item?.path)) : []
  if (requestedAttachments.some(isImageAttachment) && isDeepSeekModel(modelRoute.model)) throw new Error('DeepSeek 暂不支持图片分析，请切换其他模型。')
  const extractedAttachments = await extractAgentAttachments(requestedAttachments, conversationId)
  const attachments = extractedAttachments.items
  const requestedReferences = Array.isArray(payload?.references) ? payload.references.slice(0, 100) : []
  const idsByKind = (kind) => new Set(requestedReferences.filter((item) => item?.kind === kind).map((item) => String(item.id || '')))
  const dataIds = idsByKind('data')
  const skillIds = idsByKind('skill')
  const scriptIds = idsByKind('script')
  const knowledgeIds = idsByKind('knowledge')
  const selectedData = store.dataByIds([...dataIds])
  const selectedSkills = store.listSkills().filter((item) => item.enabled && skillIds.has(item.id)).map(({ name, content }) => ({ name, content }))
  const selectedScripts = store.listLibrary().filter((item) => item.kind === 'script' && scriptIds.has(item.id)).map(({ id, name, description }) => ({ id, name, description }))
  const selectedKnowledge = store.listKnowledge().filter((item) => item.enabled && knowledgeIds.has(item.id)).map((item) => {
    const document = store.knowledgeItem(item.id)
    return { name: item.name, excerpt: String(document?.content || item.summary || '').slice(0, 20_000) }
  })
  const resourceMetadata = new Map([
    ...store.listData().map((item) => [`data:${item.id}`, { name: item.name, size: item.size, type: item.type }]),
    ...store.listSkills().map((item) => [`skill:${item.id}`, { name: item.name, size: Buffer.byteLength(item.content || '', 'utf8'), type: 'skill' }]),
    ...store.listLibrary().filter((item) => item.kind === 'script').map((item) => [`script:${item.id}`, { name: item.name, size: Buffer.byteLength(item.content || '', 'utf8'), type: item.extension || 'script' }]),
    ...store.listKnowledge().map((item) => [`knowledge:${item.id}`, { name: item.name, size: item.size, type: 'markdown' }]),
  ])
  const selectedReferences = requestedReferences.flatMap((item) => {
    const kind = String(item?.kind || '')
    const metadata = resourceMetadata.get(`${kind}:${String(item?.id || '')}`)
    return metadata ? [{ kind, id: String(item.id), ...metadata }] : []
  })
  const messageAttachments = [
    ...selectedReferences,
    ...attachments.map((item) => ({ kind: item.type === 'skill' ? 'skill' : 'attachment', name: item.name, size: item.size, type: item.type, path: item.path })),
  ]
  return { attachments, extractedAttachments, selectedReferences, messageAttachments, selectedData, selectedSkills, selectedScripts, selectedKnowledge }
}

function commitAgentMessage(conversationId, query, prepared) {
  store.addMessage(conversationId, 'user', query, undefined, prepared.messageAttachments)
  for (const draftPath of prepared.extractedAttachments.consumedDraftImages || []) {
    try { discardDraftImage(draftPath, path.join(paths.workspace, '.stable', 'draft-images'), paths.workspace) } catch {}
  }
  publishAgentState(conversationId)
}

function modelRouteForConversation(conversationId) {
  const conversation = conversationId ? store.conversation(conversationId) : null
  if (conversationId && !conversation) throw new Error('找不到这个对话。')
  return modelRegistry.resolve(conversation?.modelId)
}

async function runAgent(query, conversationId, attachments = [], historyOverride, selectedContextOverride, broadcast = true, installedSkills = [], executionRunner = runner, permissionModeOverride, modelRouteOverride) {
  const conversation = conversationId ? store.conversation(conversationId) : null
  if (conversationId && !conversation) throw new Error('找不到这个对话。')
  const modelRoute = modelRouteOverride || modelRegistry.resolve(conversation?.modelId)
  const { model, apiKey } = modelRoute
  const runId = store.startRun('agent', conversationId || null, query)
  const trace = []
  const transcript = createStreamTranscript()
  const publish = (source) => {
    if (source.eventType === 'agent/answer-delta') {
      const delta = String(source.delta || '')
      if (!delta) return
      const event = {
        id: String(source.id || 'answer'), runId, kind: 'answer', title: 'Stable', status: 'running',
        time: Number.isFinite(source.time) ? source.time : Date.now(), eventType: 'agent/answer-delta', delta,
        turn: Number.isFinite(source.turn) ? Math.max(0, Number(source.turn)) : 0,
        step: Number.isFinite(source.step) ? Math.max(0, Number(source.step)) : 0,
        ...(conversationId ? { conversationId } : {}),
      }
      const previous = transcript.append(event)
      if (previous) publish(previous)
      if (broadcast && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:agent:event', event)
      return
    }
    if ((!source.parentSessionId && ['tool/start', 'agent/end'].includes(source.eventType)) || source.id === 'runtime' && source.status !== 'running') {
      const completedText = transcript.flush()
      if (completedText) publish(completedText)
    }
    const event = {
      id: String(source.id || `status:${trace.length}`), runId,
      kind: ['context', 'reasoning', 'tool', 'status', 'approval'].includes(source.kind) ? source.kind : 'status',
      title: String(source.title || '执行任务').slice(0, 160),
      ...(source.detail ? { detail: String(source.detail).slice(0, 500) } : {}),
      ...(source.eventType === 'agent/answer' ? { content: String(source.content || '') } : {}),
      status: ['running', 'completed', 'failed', 'cancelled'].includes(source.status) ? source.status : 'running',
      time: Number.isFinite(source.time) ? source.time : Date.now(),
      ...(source.sessionId ? { sessionId: String(source.sessionId) } : {}),
      ...(source.parentSessionId ? { parentSessionId: String(source.parentSessionId) } : {}),
      ...(Number.isFinite(source.depth) ? { depth: Math.max(0, Number(source.depth)) } : {}),
      ...(['agent/descriptor', 'agent/start', 'agent/end', 'agent/answer', 'tool/start', 'tool/end'].includes(source.eventType) ? { eventType: source.eventType } : {}),
      ...(['agent', 'tool'].includes(source.entity) ? { entity: source.entity } : {}),
      ...(['one-shot', 'continuable'].includes(source.mode) ? { mode: source.mode } : {}),
      ...(source.provider ? { provider: String(source.provider).slice(0, 80) } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(source.requestId ? { requestId: String(source.requestId) } : {}),
      ...(source.toolName ? { toolName: String(source.toolName).slice(0, source.kind === 'approval' ? 16000 : 160) } : {}),
      ...(source.reason ? { reason: String(source.reason).slice(0, 500) } : {}),
      ...(source.danger ? { danger: true } : {}),
      ...(['safe', 'unknown', 'high'].includes(source.approvalRisk) ? { approvalRisk: source.approvalRisk } : {}),
    }
    const existing = trace.findIndex((item) => item.id === event.id)
    if (event.kind === 'tool' || event.entity === 'agent' && event.parentSessionId) {
      const previous = trace[existing]
      event.startedAt = previous?.startedAt ?? previous?.time ?? event.time
      if (event.kind === 'tool') event.inputDetail = previous?.inputDetail || (source.eventType === 'tool/start' ? event.detail : undefined)
    }
    if (existing >= 0) trace[existing] = event; else trace.push(event)
    if (broadcast && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:agent:event', event)
    if (source.kind === 'approval' && source.requestId && source.status === 'running') {
      const mode = permissionModeOverride || (conversationId ? store.conversation(conversationId)?.permissionMode : conversation?.permissionMode) || 'request'
      if (canAutoApprove(mode, source)) {
        executionRunner.answerApproval(source.requestId, true)
        publish({ ...source, id: source.id, detail: '完全访问权限已自动批准本次操作', status: 'completed' })
      } else if (mode === 'auto' && !source.danger && source.approvalRisk !== 'unknown') {
        const reviewer = createHarnessRunner()
        const control = agentRunners.get(conversationId)
        control?.reviewers.add(reviewer)
        const reviewPrompt = `你是 Stable 的权限审批 Agent。仅判断下面这次一次性操作是否安全、是否与用户当前任务直接相关。不要调用任何工具。安全且必要只回答 APPROVE，否则只回答 DENY。\n\n工具：${source.toolName || '未知'}\n原因：${source.reason || '未说明'}\n用户任务：${query.slice(0, 2_000)}`
        void reviewer.run(reviewPrompt, model, apiKey, 60_000, () => {}, 'read-only').then((answer) => {
          const allowed = /^\s*APPROVE\b/i.test(answer)
          executionRunner.answerApproval(source.requestId, allowed)
          publish({ ...source, id: source.id, title: allowed ? '审批 Agent 已批准' : '审批 Agent 未批准', detail: allowed ? '安全性检查通过，继续执行' : '安全性检查未通过，Agent 将改用其他方法', status: allowed ? 'completed' : 'failed' })
        }).catch(() => {
          executionRunner.answerApproval(source.requestId, false)
          publish({ ...source, id: source.id, title: '审批 Agent 未批准', detail: '无法确认安全性，Agent 将改用其他方法', status: 'failed' })
        }).finally(() => control?.reviewers.delete(reviewer))
      }
    }
  }
  if (installedSkills.length) publish({ id: 'stable-skill-install', kind: 'tool', title: '安装全局 Skill', detail: `已识别并安装：${installedSkills.join('、')}`, status: 'completed' })
  const workbenchAction = conversationId ? requestedWorkbenchAction(query, {
    library: store.listLibrary(), workflows: store.listWorkflows(), skills: store.listSkills(),
  }) : null
  if (workbenchAction?.type === 'script') {
    const item = workbenchAction.item
    publish({ id: `stable-script:${item.id}`, kind: 'tool', title: `运行 Stable 功能 ${item.name}`, detail: '等待安全确认', status: 'running' })
    try {
      const execution = await runStoredScript(item, (event) => publish({
        id: `stable-script:${item.id}`, kind: 'tool', title: `运行 Stable 功能 ${item.name}`,
        detail: event.chunk, status: event.status || 'running', time: event.time,
      }))
      const answer = execution.cancelled
        ? `已取消运行 Stable 功能“${item.name}”。`
        : `已运行 Stable 功能“${item.name}”。${execution.result.output.trim() ? `\n\n\`\`\`text\n${execution.result.output.trim().slice(-20_000)}\n\`\`\`` : '\n\n脚本已正常完成，没有返回文本输出。'}`
      publish({ id: 'complete', kind: 'status', title: '任务完成', detail: '执行过程已自动折叠', status: 'completed' })
      store.finishRun(runId, 'completed', answer, null)
      return { answer, trace }
    } catch (error) {
      publish({ id: 'runtime', kind: 'status', title: '执行失败', detail: error.message, status: 'failed' })
      store.finishRun(runId, 'failed', null, error.message)
      throw error
    }
  }
  if (workbenchAction?.type === 'workflow') {
    const item = workbenchAction.item
    publish({ id: `stable-workflow:${item.id}`, kind: 'tool', title: `运行工作流 ${item.name}`, detail: '正在执行已保存的工作流步骤', status: 'running' })
    try {
      const result = await runWorkflow(item.id, modelRoute)
      const answer = result.output || `工作流“${item.name}”已完成。`
      publish({ id: `stable-workflow:${item.id}`, kind: 'tool', title: `运行工作流 ${item.name}`, detail: '执行完成', status: 'completed' })
      publish({ id: 'complete', kind: 'status', title: '任务完成', detail: '执行过程已自动折叠', status: 'completed' })
      store.finishRun(runId, 'completed', answer, null)
      return { answer, trace }
    } catch (error) {
      publish({ id: `stable-workflow:${item.id}`, kind: 'tool', title: `运行工作流 ${item.name}`, detail: error.message, status: 'failed' })
      store.finishRun(runId, 'failed', null, error.message)
      throw error
    }
  }
  const history = historyOverride || store.listMessages(conversationId).slice(-12)
  const explicitContext = selectedContextOverride || {}
  const selectedData = explicitContext.data ?? (conversation?.dataIds?.length ? store.dataByIds(conversation.dataIds) : [])
  const data = selectedData.length ? selectedData : store.retrieveData(query, 5)
  const knowledge = explicitContext.knowledge?.length ? explicitContext.knowledge : store.retrieveKnowledge(query, 4)
  const skills = explicitContext.skills?.length ? [...explicitContext.skills] : store.retrieveSkills(query, 4)
  const scripts = explicitContext.scripts || []
  if (workbenchAction?.type === 'skill') {
    const selectedIndex = skills.findIndex((item) => item.name === workbenchAction.item.name)
    if (selectedIndex > 0) skills.unshift(...skills.splice(selectedIndex, 1))
    else if (selectedIndex < 0) {
      const selectedSkill = store.skillContent(workbenchAction.item.name)
      if (selectedSkill) skills.unshift(selectedSkill)
    }
    publish({ id: `stable-skill:${workbenchAction.item.id}`, kind: 'tool', title: `调用 Skill ${workbenchAction.item.name}`, detail: '已加载保存的 Skill 说明', status: 'completed' })
  }
  const capability = conversation?.capability || 'auto'
  if (asksForWorkbenchInventory(query)) {
    const workbench = buildWorkbenchInventory({
      data: store.listData(), library: store.listLibrary(), knowledge: store.listKnowledge(),
      skills: store.listSkills(), workflows: store.listWorkflows(), reports: store.listReports(), workspace: paths.workspace,
    })
    const answer = workbenchInventoryAnswer(workbench)
    publish({ id: 'tool:workbench-inventory', kind: 'tool', title: '读取本地工作台清单', detail: '已汇总数据、知识、Skills、工作流、报告与工作区文件', status: 'completed' })
    publish({ id: 'complete', kind: 'status', title: '任务完成', detail: '已返回本地工作台清单', status: 'completed' })
    store.finishRun(runId, 'completed', answer, null)
    return { answer, trace }
  }
  const effectivePermissionMode = permissionModeOverride || conversation?.permissionMode || 'request'
  const permissionInstruction = effectivePermissionMode === 'full'
    ? '当前对话使用完全访问权限；已核实的读取、搜索和工作区内常规文件编辑可直接继续。删除、清空、工作区外写入、凭据访问及无法核实的程序需通过权限审批通道确认。'
    : effectivePermissionMode === 'auto'
      ? '当前对话使用“帮我审批”；扩大权限时交给独立审批 Agent，若未获批准请改用安全范围内的方法，不要要求用户在消息中回复。'
      : '当前对话使用“请求审批”；超出工作区安全范围时通过权限审批通道请求用户决定，不要让用户在普通消息中回复授权。'
  const installedSkillInstruction = installedSkills.length
    ? `\n\nStable 已完成 Skill 的全局安装与识别：${installedSkills.join('、')}。请用简体中文简要确认安装结果，并说明现在可以在对话中选择调用。不要再次扫描、移动或删除 Stable 内部目录。`
    : ''
  const wendingInstruction = isWendingCliPrompt(query, history) ? `\n\n${wendingCli.agentInstruction()}` : ''
  const effectiveQuery = `${query}${installedSkillInstruction}${wendingInstruction}\n\n${permissionInstruction}`
  const delivery = deliveryRequest(query)
  const promptOptions = { identity: store.getSetting('identity'), globalInstructions: readGlobalInstructions().content, query: effectiveQuery, history, data, knowledge, skills, scripts, attachments, capability, delivery }
  const initialPrompt = composeAgentPrompt(promptOptions)
  const persistentSession = executionRunner.supportsPersistentSessions && conversationId && !historyOverride
    ? { key: conversationId, initialPrompt } : undefined
  const prompt = persistentSession ? composeAgentPrompt({ ...promptOptions, history: [] }) : initialPrompt
  const imageAttachments = attachments.filter(isImageAttachment)
  const activeControl = agentRunners.get(conversationId)
  const control = activeControl?.runner === executionRunner && activeControl.steerRequests ? activeControl : undefined
  const resourceDetail = `${data.length} 条数据${selectedData.length ? '（已引用）' : ''} · ${knowledge.length} 篇知识 · ${skills.length} 个 Skills · ${scripts.length} 个脚本${attachments.length ? ` · ${attachments.length} 个临时附件` : ''}`
  publish({ id: 'context', kind: 'context', title: '准备本次上下文', detail: `${data.length || knowledge.length || skills.length || scripts.length || attachments.length ? resourceDetail : '未加载本地资源'} · ${capability} · ${model.model}`, status: 'completed' })
  publish({ id: 'runtime', kind: 'status', title: '启动 Stable', detail: '已将任务安全传入本地运行时', status: 'running' })
  try {
    const result = await runWithDeliveryChecks({
      workspace: paths.workspace, delivery, prompt,
      getDelivery: control ? () => control.directions.reduce(revisedDelivery, delivery) : undefined,
      getPrompt: control ? () => `${prompt}\n\n${control.directions.length ? `用户在执行中补充的要求（以最新要求为准）：\n${control.steerInputs.map((input) => input.prompt).join('\n')}` : ''}` : undefined,
      execute: async (task) => {
        if (control?.cancelled) throw new Error('任务已停止。')
        const images = [...new Map([...imageAttachments, ...(control?.steerInputs.flatMap((input) => input.images) || [])].map((image) => [image.path, image])).values()]
        const answer = await executionRunner.run(task, model, apiKey, undefined, publish, 'workspace-write', images, persistentSession)
        if (control) await Promise.allSettled([...control.steerRequests.values()])
        if (control?.cancelled) throw new Error('任务已停止。')
        return answer
      },
      onCheck: (attempt) => publish({ id: 'delivery-check', kind: 'status', title: '继续完成文件交付', detail: `第 ${attempt} 次检查尚未检测到目标文件`, status: 'running' }),
    })
    const { answer, artifacts, reused } = result
    if (result.status === 'failed') {
      publish({ id: 'delivery-check', kind: 'status', title: '文件交付未完成', detail: result.reason, status: 'failed' })
      publish({ id: 'runtime', kind: 'status', title: '任务受阻', detail: result.reason, status: 'failed' })
      store.finishRun(runId, 'failed', answer, result.reason)
      return { answer, trace, status: 'failed', reason: result.reason }
    }
    publish({ id: 'delivery-check', kind: 'status', title: artifacts.length ? '文件交付已验证' : '文本回答已完成', detail: artifacts.length ? `已确认 ${artifacts.length} 个目标文件${reused.length ? `（其中 ${reused.length} 个复用已有文件）` : ''}` : '本次任务不要求生成文件', status: 'completed' })
    publish({ id: 'runtime', kind: 'status', title: 'Stable 已完成', detail: '执行结果已返回 Stable', status: 'completed' })
    publish({ id: 'complete', kind: 'status', title: '任务完成', detail: '执行过程已自动折叠', status: 'completed' })
    store.finishRun(runId, 'completed', answer, null)
    return { answer, trace }
  } catch (error) {
    publish({ id: 'runtime', kind: 'status', title: error.message === '任务已停止。' ? '任务已停止' : '执行失败', detail: error.message, status: error.message === '任务已停止。' ? 'cancelled' : 'failed' })
    store.finishRun(runId, 'failed', null, error.message)
    throw error
  }
}

async function runWorkflow(id, modelRouteOverride) {
  if (activeWorkflowRun) throw new Error('已有工作流正在执行，请先停止。')
  const workflow = store.workflow(id)
  if (!workflow) throw new Error('找不到这个工作流。')
  const modelRoute = modelRouteOverride || modelRouteForConversation()
  const graph = validateWorkflowGraph(workflow, { requireRunnable: true })
  const orderedNodeIds = topologicalOrder(graph)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const outputNodeCount = graph.nodes.filter((node) => node.type === 'output').length
  const runId = store.startRun('workflow', id, workflow.name)
  store.setWorkflowResult(id, 'running', '')
  const values = new Map()
  const artifacts = []
  let tasks = new Map()
  const control = { id, cancelled: false, failedError: null, harnessRunners: new Set(), scriptRunners: new Set() }
  activeWorkflowRun = control
  const assertRunning = () => {
    if (control.cancelled) throw new Error('工作流已停止。')
    if (control.failedError) throw control.failedError
  }
  const stopWorkers = () => {
    for (const worker of control.harnessRunners) worker.cancel()
    for (const worker of control.scriptRunners) worker.cancel()
  }
  const publish = (nodeId, status, detail, extra = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:workflows:event', {
      workflowId: id, nodeId, status, detail: String(detail || '').slice(0, 500), time: Date.now(),
      ...extra,
    })
  }
  const incomingText = (nodeId) => graph.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => values.get(edge.source) || '')
    .filter(Boolean).join('\n\n').slice(0, 200_000)
  const executeNode = async (nodeId) => {
    assertRunning()
    const node = nodeById.get(nodeId)
    const input = incomingText(nodeId)
    publish(nodeId, 'running', '正在处理上游输入')
    try {
      let result = ''
      let outputTarget = ''
      if (node.type === 'data') {
        const item = store.dataByIds([node.resourceId])[0]
        if (!item) throw new Error(`模块“${node.title}”引用的数据不存在或未启用。`)
        result = `${input ? `${input}\n\n` : ''}数据 ${item.name}:\n${item.text_content.slice(0, 120_000)}`
      } else if (node.type === 'knowledge') {
        const item = store.knowledgeItem(node.resourceId)
        if (!item?.enabled) throw new Error(`模块“${node.title}”引用的知识文档不存在或未启用。`)
        result = `${input ? `${input}\n\n` : ''}知识 ${item.name}:\n${item.content.slice(0, 120_000)}`
      } else if (node.type === 'skill') {
        const item = store.skillContent(node.resourceId)
        if (!item) throw new Error(`模块“${node.title}”引用的 Skill 不存在或未启用。`)
        result = `${input ? `${input}\n\n` : ''}Skill ${item.name}:\n${item.content.slice(0, 80_000)}`
      } else if (node.type === 'script') {
        const item = store.libraryItem(node.resourceId)
        if (!item || item.kind !== 'script') throw new Error(`模块“${node.title}”引用的脚本不存在。`)
        const scriptWorker = new ScriptRunner({ workspace: paths.workspace })
        const aiRunner = createHarnessRunner()
        control.scriptRunners.add(scriptWorker)
        control.harnessRunners.add(aiRunner)
        const autoResponder = createScriptAutoResponder({ control, node, item, input, publish, scriptWorker, aiRunner, modelRoute })
        let execution
        try {
          execution = await runStoredScript(item, autoResponder.onEvent, { confirm: false, timeoutMs: 0, idleNoticeMs: 5 * 60_000 }, scriptWorker)
        } finally {
          autoResponder.dispose()
          control.scriptRunners.delete(scriptWorker)
          control.harnessRunners.delete(aiRunner)
        }
        if (execution.cancelled) throw new Error('脚本执行已取消。')
        result = `${input ? `${input}\n\n` : ''}${execution.result?.output || '脚本执行完成，没有返回文本输出。'}`
      } else if (node.type === 'ai') {
        const prompt = `${store.getSetting('identity')}\n\n你正在执行一个模块化工作流中的 AI 运算节点。\n节点：${node.title}\n任务：${node.instruction || '根据上游输入生成可直接交给下游的结果。'}\n\n上游输入：\n${input || '（无上游输入）'}\n\n只输出本节点的计算结果，不要描述工作流内部机制。`
        const aiRunner = createHarnessRunner()
        control.harnessRunners.add(aiRunner)
        try {
          result = await aiRunner.run(prompt, modelRoute.model, modelRoute.apiKey, 5 * 60_000, () => {}, 'read-only')
        } finally {
          control.harnessRunners.delete(aiRunner)
        }
      } else if (node.type === 'output') {
        const outputDir = path.join(paths.workspace, 'outputs')
        mkdirSync(outputDir, { recursive: true })
        result = input
        const outputName = outputNodeCount > 1 ? `${workflow.name}-${node.title}-${node.id.slice(0, 6)}` : workflow.name
        const output = await writeWorkflowOutput({ directory: outputDir, name: timestampedOutputName(outputName), format: node.outputFormat, content: result })
        outputTarget = output.path
        artifacts.push({ nodeId, path: output.path, name: path.basename(output.path) })
      }
      assertRunning()
      values.set(nodeId, String(result).slice(0, 240_000))
      publish(nodeId, 'completed', node.type === 'output' ? `结果已输出：${path.basename(outputTarget)}` : '模块执行完成')
    } catch (error) {
      if (control.cancelled) publish(nodeId, 'cancelled', error.message)
      else if (control.failedError && control.failedError !== error) publish(nodeId, 'cancelled', '因其他分支失败而停止')
      else {
        control.failedError = error
        publish(nodeId, 'failed', error.message)
        stopWorkers()
      }
      throw error
    }
  }
  try {
    tasks = scheduleWorkflowTasks(graph, executeNode)
    await Promise.all(tasks.values())
    const output = graph.nodes.filter((node) => node.type === 'output').map((node) => values.get(node.id) || '').filter(Boolean).join('\n\n')
    artifacts.sort((left, right) => orderedNodeIds.indexOf(left.nodeId) - orderedNodeIds.indexOf(right.nodeId))
    store.setWorkflowResult(id, 'completed', output)
    store.finishRun(runId, 'completed', output, null)
    return { output, artifacts, workflows: store.listWorkflows() }
  } catch (caught) {
    stopWorkers()
    await Promise.allSettled(tasks.values())
    const cancelled = control.cancelled
    const error = control.failedError || caught
    const status = cancelled ? 'cancelled' : 'failed'
    store.setWorkflowResult(id, status, error.message)
    store.finishRun(runId, status, null, error.message)
    if (cancelled) return { output: '', workflows: store.listWorkflows(), cancelled: true }
    throw error
  } finally {
    if (activeWorkflowRun === control) activeWorkflowRun = undefined
  }
}

function cancelWorkflow() {
  if (!activeWorkflowRun) return false
  activeWorkflowRun.cancelled = true
  for (const worker of activeWorkflowRun.harnessRunners) worker.cancel()
  for (const worker of activeWorkflowRun.scriptRunners) worker.cancel()
  return true
}

async function enhanceWorkflowInstruction(node, prompt, effort = 'standard') {
  const type = String(node?.type || '')
  if (!['ai', 'output'].includes(type)) throw new Error('这个模块不需要文字指令。')
  const request = requireText(prompt, '模块要求', 2_000)
  const current = String(node?.instruction || '').trim().slice(0, 8_000)
  const title = String(node?.title || (type === 'output' ? '输出' : 'AI 运算')).slice(0, 100)
  const depth = effort === 'fast' ? '只补齐最必要的执行条件，保持简洁。' : effort === 'deep' ? '深入补齐步骤、边界条件、检查标准和异常处理。' : '补齐处理重点、输出结构和质量约束。'
  const systemPrompt = `你是 Stable 的工作流模块指令优化器。把用户给出的关键词或简短要求补充成清晰、可执行、便于 AI 调用的模块指令。\n\n模块类型：${type === 'output' ? '输出模块' : 'AI 运算模块'}\n模块名称：${title}\n当前指令：${current || '（尚未配置）'}\n用户新增要求：${request}\n处理深度：${depth}\n\n要求：保留用户意图和语言；说明要使用的上游输入；不要虚构不存在的数据或资源；如果已有指令则在其基础上优化。只输出最终指令，不要解释优化过程，不要使用 Markdown 代码块。`
  const instructionRunner = createHarnessRunner()
  const { model, apiKey } = modelRouteForConversation()
  return requireText(await instructionRunner.run(systemPrompt, model, apiKey, 5 * 60_000, () => {}, 'read-only'), 'AI 优化结果', 8_000)
}

function parseWorkflowJson(raw) {
  const clean = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有返回可解析的工作流。请换一种描述再试。')
  try { return JSON.parse(clean.slice(start, end + 1)) }
  catch { throw new Error('AI 返回的工作流 JSON 无效。请换一种描述再试。') }
}

async function generateWorkflow(goal) {
  const data = store.listData().filter((item) => item.enabled).map(({ id, name, type }) => ({ id, name, type }))
  const knowledge = store.listKnowledge().filter((item) => item.enabled).map(({ id, name, summary }) => ({ id, name, summary }))
  const scripts = store.listLibrary().filter((item) => item.kind === 'script').map(({ id, name, description }) => ({ id, name, description }))
  const skills = store.listSkills().filter((item) => item.enabled).map(({ id, name, description }) => ({ id, name, description }))
  const prompt = `你是 Stable 的工作流编排器。根据目标和可用资源生成一个有向无环工作流。\n\n目标：${goal}\n\n可用资源（只能引用这里出现的 id）：\n数据：${JSON.stringify(data)}\n知识库：${JSON.stringify(knowledge)}\n脚本：${JSON.stringify(scripts)}\nSkills：${JSON.stringify(skills)}\n\n节点类型只能是 data、knowledge、script、skill、ai、output。资源节点必须填写 resourceId；ai 节点负责处理上游内容并填写具体 instruction；output 节点填写具体 instruction 和 outputFormat（markdown、pptx、html、xlsx 之一，默认 markdown），输出文件名由工作流名称和运行时间自动生成。所有节点都可以接收上游输入并把结果传给下游。必须至少有一个 output，连线不能成环。只返回以下 JSON，不要 Markdown：\n{"name":"工作流名称","description":"一句话说明","nodes":[{"key":"唯一短键","type":"ai","title":"模块名称","resourceId":"可选","instruction":"可选","outputFormat":"可选"}],"edges":[{"source":"节点 key","target":"节点 key"}]}`
  const { model, apiKey } = modelRouteForConversation()
  const raw = await runner.run(prompt, model, apiKey, 0, () => {}, 'read-only')
  const draft = parseWorkflowJson(raw)
  const allowed = {
    data: new Set(data.map((item) => item.id)), knowledge: new Set(knowledge.map((item) => item.id)),
    script: new Set(scripts.map((item) => item.id)), skill: new Set(skills.map((item) => item.id)),
  }
  if (!Array.isArray(draft.nodes) || !Array.isArray(draft.edges)) throw new Error('AI 返回的工作流结构不完整。')
  const keyed = new Map()
  const nodes = draft.nodes.slice(0, 60).map((source, index) => {
    const key = String(source.key || `node-${index}`); if (keyed.has(key)) throw new Error('AI 返回了重复的节点 key。')
    const id = randomUUID(); keyed.set(key, id)
    const type = String(source.type || '')
    if (allowed[type] && !allowed[type].has(String(source.resourceId || ''))) throw new Error(`AI 为“${source.title || key}”引用了不可用资源。`)
    return { id, type, title: String(source.title || '未命名模块'), position: { x: 0, y: 0 },
      ...(source.resourceId ? { resourceId: String(source.resourceId) } : {}),
      ...(source.instruction ? { instruction: String(source.instruction) } : {}),
      ...(type === 'output' ? { outputFormat: String(source.outputFormat || 'markdown') } : {}),
    }
  })
  const edges = draft.edges.slice(0, 120).map((edge) => ({ id: randomUUID(), source: keyed.get(String(edge.source)), target: keyed.get(String(edge.target)) }))
  const graph = layoutWorkflowGraph(validateWorkflowGraph({ nodes, edges }, { requireRunnable: true }))
  return { id: '', name: requireText(String(draft.name || goal), '工作流名称', 100), description: String(draft.description || goal).slice(0, 500), ...graph, updatedAt: '' }
}

function registerIpc() {
  ipcMain.handle('stable:bootstrap', () => bootstrap())
  ipcMain.handle('stable:cloud:login', async (_event, payload) => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    await cloudAccount.login(requireText(payload?.username, '账号', 64), requireText(payload?.password, '密码', 128))
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:changePassword', async (_event, payload) => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    const currentPassword = requireText(payload?.currentPassword, '当前密码', 128)
    const newPassword = requireText(payload?.newPassword, '新密码', 128)
    if (newPassword.length < 12) throw new Error('新密码至少需要 12 个字符。')
    if (newPassword !== String(payload?.confirmPassword || '')) throw new Error('两次输入的新密码不一致。')
    await cloudAccount.changePassword(currentPassword, newPassword)
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:refresh', async () => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    await cloudAccount.refresh()
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:logout', async () => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    await cloudAccount.logout()
    return bootstrap()
  })
  ipcMain.handle('stable:automations:state', () => automationState())
  ipcMain.handle('stable:automations:save', (_event, payload) => {
    if (payload?.id) store.updateAutomation(requireText(payload.id, '定时任务 ID', 100), payload)
    else store.createAutomation(payload, 'manual')
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:enabled', (_event, payload) => {
    store.setAutomationEnabled(requireText(payload?.id, '定时任务 ID', 100), Boolean(payload?.enabled))
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:remove', (_event, payload) => {
    const id = requireText(payload?.id, '定时任务 ID', 100)
    if (automationRunners.has(id)) throw new Error('这个定时任务正在运行，请完成后再删除。')
    store.removeAutomation(id)
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:run', (_event, payload) => executeAutomation(requireText(payload?.id, '定时任务 ID', 100), true))
  ipcMain.handle('stable:automations:proposal', (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const messageId = requireText(payload?.messageId, '消息 ID', 100)
    const message = store.listMessages(conversationId).find((item) => item.id === messageId)
    if (!message?.automationProposal || message.automationProposal.status !== 'pending') throw new Error('这条自动化建议已经处理或不存在。')
    if (!payload?.accepted) {
      store.updateAutomationProposal(messageId, 'rejected')
      publishAgentState(conversationId)
      return { agent: agentState(conversationId), automations: publishAutomationState() }
    }
    const item = store.createAutomation(message.automationProposal, 'chat')
    store.updateAutomationProposal(messageId, 'accepted', item.id)
    publishAgentState(conversationId)
    return { agent: agentState(conversationId), automations: publishAutomationState() }
  })
  ipcMain.handle('stable:update:state', () => updateController.state())
  ipcMain.handle('stable:update:check', () => updateController.check(true))
  ipcMain.handle('stable:update:download', () => updateController.download())
  ipcMain.handle('stable:update:install', () => updateController.install())
  ipcMain.handle('stable:data:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '导入本地数据', properties: ['openFile', 'multiSelections'], filters: [
      { name: '支持的文件', extensions: ['txt', 'md', 'csv', 'json', 'yaml', 'yml', 'html', 'log', 'xml', 'pdf', 'docx', 'xlsx', 'xls'] }, { name: '所有文件', extensions: ['*'] },
    ] })
    if (result.canceled) return { added: 0, items: store.listData() }
    return importDataPaths(result.filePaths)
  })
  ipcMain.handle('stable:data:importPaths', (_event, payload) => importDataPaths(payload?.paths))
  ipcMain.handle('stable:data:enabled', (_event, payload) => { store.setDataEnabled(requireText(payload?.id, '数据 ID', 100), Boolean(payload?.enabled)); return store.listData() })
  ipcMain.handle('stable:data:remove', (_event, payload) => { store.removeData(requireText(payload?.id, '数据 ID', 100)); return store.listData() })

  ipcMain.handle('stable:knowledge:import', () => importKnowledge())
  ipcMain.handle('stable:knowledge:importPaths', (_event, payload) => importKnowledgePaths(payload?.paths))
  ipcMain.handle('stable:knowledge:get', (_event, payload) => {
    const item = store.knowledgeItem(requireText(payload?.id, '知识 ID', 100))
    if (!item) throw new Error('找不到这个知识文档。')
    return item
  })
  ipcMain.handle('stable:knowledge:enabled', (_event, payload) => {
    store.setKnowledgeEnabled(requireText(payload?.id, '知识 ID', 100), Boolean(payload?.enabled))
    return store.listKnowledge()
  })
  ipcMain.handle('stable:knowledge:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '知识 ID', 100)
    const item = store.knowledgeItem(id)
    if (!item) throw new Error('找不到这个知识文档。')
    removeStoredAsset(knowledgeRoot(), item.path)
    store.removeKnowledge(id)
    return store.listKnowledge()
  })

  ipcMain.handle('stable:reports:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入 HTML 报告', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'HTML 报告', extensions: ['html', 'htm'] }],
    })
    if (result.canceled) return { added: 0, items: store.listReports() }
    return importReportPaths(result.filePaths)
  })
  ipcMain.handle('stable:reports:importPaths', (_event, payload) => importReportPaths(payload?.paths))
  ipcMain.handle('stable:reports:render', (_event, payload) => {
    const mode = payload?.mode === 'source' || payload?.mode === 'studio' ? payload.mode : 'builder'
    const html = mode === 'source' || mode === 'studio' ? String(payload?.html || '') : renderReportHtml({ name: String(payload?.name || 'Stable 报告'), mode, components: Array.isArray(payload?.components) ? payload.components : [] })
    if (html.length > 10_000_000) throw new Error('HTML 内容不能超过 10 MB。')
    return html
  })
  ipcMain.handle('stable:reports:save', (_event, payload) => saveReportDraft(payload))
  ipcMain.handle('stable:reports:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '报告 ID', 100)
    const item = store.reportItem(id)
    if (!item) throw new Error('找不到这份报告。')
    removeStoredAsset(reportRoot(), item.path)
    store.removeReport(id)
    return store.listReports()
  })
  ipcMain.handle('stable:reports:export', async (_event, payload) => {
    const item = store.reportItem(requireText(payload?.id, '报告 ID', 100))
    if (!item) throw new Error('找不到这份报告。')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 HTML 报告', defaultPath: `${cleanFilename(item.name)}.html`,
      filters: [{ name: 'HTML 报告', extensions: ['html'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, item.html, 'utf8')
    return { canceled: false, path: result.filePath }
  })

  ipcMain.handle('stable:library:import', (_event, payload) => importLibraryFiles(requireLibraryCategory(payload?.category)))
  ipcMain.handle('stable:library:importPaths', (_event, payload) => {
    const category = requireLibraryCategory(payload?.category)
    return category === 'processing' ? importProcessingPaths(payload?.paths) : importScriptPaths(category, payload?.paths)
  })
  ipcMain.handle('stable:library:rename', (_event, payload) => {
    const id = requireText(payload?.id, '脚本 ID', 100)
    const name = requireText(payload?.name, '脚本名称', 100)
    const item = store.libraryItem(id)
    if (!item || item.kind !== 'script' || !['collection', 'cleaning'].includes(item.category)) throw new Error('找不到这个脚本。')
    store.renameLibraryItem(id, name)
    return store.listLibrary()
  })
  ipcMain.handle('stable:library:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    if (!item) throw new Error('找不到这个数据资产。')
    removeStoredAsset(libraryRoot(item.category), item.path)
    store.removeLibraryItem(id)
    return store.listLibrary()
  })
  ipcMain.handle('stable:library:run', async (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    const execution = await runStoredScript(item)
    return { cancelled: execution.cancelled, item: execution.item, items: store.listLibrary() }
  })
  ipcMain.handle('stable:library:cancel', () => scriptRunner.cancel())
  ipcMain.handle('stable:library:input', (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    if (typeof payload?.value !== 'string') throw new Error('脚本输入无效。')
    return scriptRunner.writeInput(id, payload.value)
  })
  ipcMain.handle('stable:library:saveMarkdown', (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    if (!item || item.kind !== 'markdown') throw new Error('找不到这个 Markdown。')
    if (typeof payload?.content !== 'string') throw new Error('Markdown 内容无效。')
    if (payload.content.length > 2_000_000) throw new Error('Markdown 内容不能超过 2 MB。')
    if (!isInside(libraryRoot(item.category), item.path)) throw new Error('Markdown 路径不在 Stable 私有目录内，已停止保存。')
    writeFileSync(item.path, payload.content, 'utf8')
    store.saveMarkdown(id, payload.content, markdownSummary(payload.content))
    return store.listLibrary()
  })

  ipcMain.handle('stable:skills:enabled', (_event, payload) => { store.setSkillEnabled(requireText(payload?.id, 'Skill ID', 100), Boolean(payload?.enabled)); return store.listSkills() })
  ipcMain.handle('stable:skills:remove', (_event, payload) => { store.removeSkill(requireText(payload?.id, 'Skill ID', 100)); return store.listSkills() })
  ipcMain.handle('stable:extensions:wendingStatus', () => wendingCli.status())
  const trustedLoginSender = (event) => Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame)
  ipcMain.handle('stable:extensions:prepareWending', (event) => {
    if (!trustedLoginSender(event)) throw new Error('此页面无权访问登录接口。')
    return wendingCli.prepare()
  })
  registerWendingLoginIpc(ipcMain, { service: () => wendingCli, isTrusted: trustedLoginSender })

  ipcMain.handle('stable:workflows:save', (_event, workflow) => {
    const graph = validateWorkflowGraph(workflow)
    const value = { id: workflow?.id, name: requireText(workflow?.name, '工作流名称', 100), description: String(workflow?.description || '').slice(0, 500), ...graph }
    store.saveWorkflow(value); return store.listWorkflows()
  })
  ipcMain.handle('stable:workflows:remove', (_event, payload) => { store.removeWorkflow(requireText(payload?.id, '工作流 ID', 100)); return store.listWorkflows() })
  ipcMain.handle('stable:workflows:run', (_event, payload) => runWorkflow(requireText(payload?.id, '工作流 ID', 100)))
  ipcMain.handle('stable:workflows:cancel', () => cancelWorkflow())
  ipcMain.handle('stable:workflows:enhanceInstruction', (_event, payload) => enhanceWorkflowInstruction(payload?.node, payload?.prompt, payload?.effort))
  ipcMain.handle('stable:workflows:generate', (_event, payload) => generateWorkflow(requireText(payload?.goal, '工作流目标', 2_000)))

  ipcMain.handle('stable:agent:inspectAttachments', (_event, payload) => inspectAgentAttachments(payload?.paths))
  ipcMain.handle('stable:agent:savePastedImage', (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    if (!store.conversation(conversationId)) throw new Error('找不到这个对话。')
    return savePastedImage({ name: payload?.name, mediaType: payload?.mediaType, data: payload?.data }, path.join(paths.workspace, '.stable', 'draft-images'), paths.workspace)
  })
  ipcMain.handle('stable:agent:discardDraftImage', (_event, payload) => discardDraftImage(requireText(payload?.path, '草稿图片路径', 2_000), path.join(paths.workspace, '.stable', 'draft-images'), paths.workspace))
  ipcMain.handle('stable:agent:imagePreview', (_event, payload) => {
    const inspected = inspectAttachmentPath(requireText(payload?.path, '图片路径', 2_000))
    if (!isImageAttachment(inspected) || !inspected.previewUrl) throw new Error('这个附件不是可预览图片。')
    return inspected.previewUrl
  })
  ipcMain.handle('stable:agent:saveImageAs', async (_event, payload) => {
    const inspected = inspectAttachmentPath(requireText(payload?.path, '图片路径', 2_000))
    if (!isImageAttachment(inspected)) throw new Error('这个附件不是可下载图片。')
    const extension = path.extname(inspected.path).toLowerCase().replace(/^\./, '') || 'png'
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '下载图片',
      defaultPath: cleanFilename(inspected.name),
      filters: [{ name: '图片', extensions: [extension] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    copyFileSync(inspected.path, result.filePath)
    return { canceled: false, path: result.filePath }
  })
  ipcMain.handle('stable:agent:selectAttachmentFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择本次任务文件夹', properties: ['openDirectory'] })
    return result.canceled ? [] : inspectAgentAttachments(result.filePaths)
  })
  ipcMain.handle('stable:agent:selectSkillFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '发送 Skill 文件夹给 Agent', properties: ['openDirectory'] })
    if (result.canceled) return []
    const { content: _content, description: _description, ...item } = inspectSkillFolder(result.filePaths[0])
    return [item]
  })
  ipcMain.handle('stable:agent:create', () => {
    const id = store.createConversation()
    return agentState(id)
  })
  ipcMain.handle('stable:agent:state', (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    if (!store.conversation(id)) throw new Error('找不到这个对话。')
    return agentState(id)
  })
  ipcMain.handle('stable:agent:search', (_event, payload) => {
    if (typeof payload?.query !== 'string') throw new Error('搜索关键词无效。')
    if (payload.query.length > 200) throw new Error('搜索关键词不能超过 200 个字符。')
    return store.searchConversations(payload.query, 30)
  })
  ipcMain.handle('stable:agent:select', (_event, payload) => {
    const id = store.selectConversation(requireText(payload?.id, '对话 ID', 100))
    return agentState(id)
  })
  ipcMain.handle('stable:agent:rename', (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    if (!store.conversation(id)) throw new Error('找不到这个对话。')
    store.renameConversation(id, requireText(payload?.title, '对话名称', 80))
    return agentState(id)
  })
  ipcMain.handle('stable:agent:pin', (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    store.setConversationPinned(id, Boolean(payload?.pinned))
    return agentState(store.activeConversationId())
  })
  ipcMain.handle('stable:agent:openWorkspace', async () => {
    const error = await shell.openPath(paths.workspace)
    if (error) throw new Error(error)
    return true
  })
  ipcMain.handle('stable:agent:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    const conversation = store.conversation(id)
    if (!conversation) throw new Error('找不到这个对话。')
    if (agentRunners.has(id)) throw new Error('这个对话仍在执行，请先停止后再删除。')
    clearCodexSession(paths.userData, id)
    return agentState(store.removeConversation(id))
  })
  ipcMain.handle('stable:agent:configure', (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    if (!store.conversation(id)) throw new Error('找不到这个对话。')
    const capability = String(payload?.capability || 'auto')
    if (!AGENT_CAPABILITIES.has(capability)) throw new Error('未知的模型能力模式。')
    const requestedIds = Array.isArray(payload?.dataIds) ? [...new Set(payload.dataIds.map(String))].slice(0, 50) : []
    const enabledIds = new Set(store.listData().filter((item) => item.enabled).map((item) => item.id))
    const dataIds = requestedIds.filter((idValue) => enabledIds.has(idValue))
    store.updateConversationContext(id, capability, dataIds)
    return agentState(id)
  })
  ipcMain.handle('stable:agent:configurePermission', (_event, payload) => {
    const id = requireText(payload?.id, '对话 ID', 100)
    if (!store.conversation(id)) throw new Error('找不到这个对话。')
    const permissionMode = String(payload?.permissionMode || 'request')
    if (!['request', 'auto', 'full'].includes(permissionMode)) throw new Error('未知的权限模式。')
    store.updateConversationPermission(id, permissionMode)
    return agentState(id)
  })
  ipcMain.handle('stable:agent:configureModel', (_event, payload) => {
    const id = requireText(payload?.conversationId || payload?.id, '对话 ID', 100)
    const modelId = requireText(payload?.modelId, '模型 ID', 100)
    store.updateConversationModel(id, modelId, modelRegistry.publicCatalog().items.map((item) => item.id))
    return agentState(id)
  })
  ipcMain.handle('stable:agent:run', async (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const conversation = store.conversation(conversationId)
    if (!conversation) throw new Error('找不到这个对话。')
    if (agentRunners.has(conversationId)) throw new Error('这个对话已有任务正在执行。')
    const query = requireText(payload?.prompt, '消息')
    const modelRoute = modelRegistry.resolve(conversation.modelId)
    const executionRunner = createHarnessRunner()
    const control = { runner: executionRunner, reviewers: new Set(), modelRoute, phase: 'preparing', cancelled: false, steerRequests: new Map(), directions: [], steerInputs: [] }
    agentRunners.set(conversationId, control)
    try {
      const prepared = await prepareAgentMessage(payload, conversationId, modelRoute)
      const { attachments, selectedReferences, extractedAttachments, selectedData, selectedKnowledge, selectedSkills, selectedScripts } = prepared
      if (control.cancelled) throw new Error('任务已停止。')
      store.updateConversationContext(conversationId, conversation.capability, [])
      commitAgentMessage(conversationId, query, prepared)
      if (automationIntent(query) && !attachments.length && !selectedReferences.length) {
        control.phase = 'proposal'
        try {
          const rawProposal = await executionRunner.run(proposalPrompt(query), modelRoute.model, modelRoute.apiKey, 90_000, () => {}, 'read-only')
          if (control.cancelled) throw new Error('任务已停止。')
          const proposal = parseProposalOutput(rawProposal)
          if (proposal) {
            const automationProposal = { ...proposal, status: 'pending' }
            const answer = `我已整理好定时任务“${proposal.title}”。执行时间：${scheduleLabel(proposal.schedule)}。确认后才会保存并开始生效。`
            store.addMessage(conversationId, 'assistant', answer, undefined, undefined, automationProposal)
            publishAgentState(conversationId)
            return { answer, ...agentState(conversationId), library: store.listLibrary(), skills: store.listSkills(), workflows: store.listWorkflows() }
          }
        } catch { /* 解析不明确时交回普通对话，让模型继续询问 */ }
      }
      if (control.cancelled) throw new Error('任务已停止。')
      control.phase = 'agent'
      const result = await runAgent(query, conversationId, attachments, undefined, { data: selectedData, knowledge: selectedKnowledge, skills: selectedSkills, scripts: selectedScripts }, true, extractedAttachments.installedSkills, executionRunner, undefined, modelRoute)
      control.phase = 'finishing'
      await Promise.allSettled([...control.steerRequests.values()])
      store.addMessage(conversationId, 'assistant', result.answer, result.trace)
      publishAgentState(conversationId)
      return { answer: result.answer, ...agentState(conversationId), library: store.listLibrary(), skills: store.listSkills(), workflows: store.listWorkflows() }
    } catch (error) {
      throw new Error(error.message)
    } finally {
      control.phase = 'finished'
      for (const reviewer of control.reviewers) reviewer.cancel()
      if (agentRunners.get(conversationId) === control) agentRunners.delete(conversationId)
    }
  })
  ipcMain.handle('stable:agent:steer', async (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const requestId = requireText(payload?.requestId, '消息 ID', 100)
    const query = requireText(payload?.prompt, '消息')
    const control = agentRunners.get(conversationId)
    if (!control) throw new Error('当前任务已经结束，消息仍保留在队列中。')
    if (control.steerRequests?.has(requestId)) return control.steerRequests.get(requestId)
    if (control.phase !== 'agent' || !control.runner.steerReady || control.cancelled) throw new Error('当前任务尚未进入可调整的模型步骤，请稍后重试或继续排队。')
    let delivered = false
    const request = (async () => {
      const prepared = await prepareAgentMessage(payload, conversationId, control.modelRoute)
      if (control.cancelled || control.phase !== 'agent' || agentRunners.get(conversationId) !== control) throw new Error('当前任务已经结束，消息仍保留在队列中。')
      const history = store.listMessages(conversationId)
      const instruction = isWendingCliPrompt(query, history) ? `\n\n${wendingCli.agentInstruction()}` : ''
      const prompt = composeAgentPrompt({
        identity: store.getSetting('identity'),
        query: `这是用户对当前任务的即时补充，请结合已有上下文调整后续执行。\n${query}${instruction}`,
        data: prepared.selectedData, knowledge: prepared.selectedKnowledge, skills: prepared.selectedSkills,
        scripts: prepared.selectedScripts, attachments: prepared.attachments, history: [],
        capability: store.conversation(conversationId)?.capability,
      })
      await control.runner.steer(prompt, prepared.attachments.filter(isImageAttachment))
      delivered = true
      control.directions.push(query)
      control.steerInputs.push({ prompt, images: prepared.attachments.filter(isImageAttachment) })
      commitAgentMessage(conversationId, query, prepared)
      return agentState(conversationId)
    })()
    control.steerRequests.set(requestId, request)
    // A rejected preflight can be retried; accepted or uncertain deliveries must never be sent twice.
    void request.catch((error) => {
      if (!delivered && error.code !== 'STEER_UNCERTAIN') control.steerRequests.delete(requestId)
    })
    return request
  })
  ipcMain.handle('stable:agent:cancel', (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const control = agentRunners.get(conversationId)
    if (!control) return false
    control.cancelled = true
    for (const reviewer of control.reviewers) reviewer.cancel()
    control.runner.cancel()
    return true
  })
  ipcMain.handle('stable:agent:answerApproval', (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const requestId = requireText(payload?.requestId, '审批 ID', 200)
    return agentRunners.get(conversationId)?.runner.answerApproval(requestId, Boolean(payload?.allowed)) || false
  })
  ipcMain.handle('stable:agent:clear', (_event, payload) => {
    const id = requireText(payload?.conversationId, '对话 ID', 100)
    if (!store.conversation(id)) throw new Error('找不到这个对话。')
    if (agentRunners.has(id)) throw new Error('请先停止当前任务，再清空对话。')
    clearCodexSession(paths.userData, id)
    store.clearMessages(id)
    return agentState(id)
  })
  ipcMain.handle('stable:team:state', () => teamState())
  ipcMain.handle('stable:team:create', async (_event, payload) => {
    const teamName = requireText(payload?.teamName, 'Team 名称', 80)
    const deviceName = requireText(payload?.deviceName, '设备名称', 80)
    const port = Number.isInteger(payload?.port) && payload.port >= 0 && payload.port <= 65_535 ? payload.port : 47_823
    teamConnection = 'connecting'; publishTeam()
    const profile = await teamNetwork.create({ teamName, deviceName, port, deviceIdentity: deviceIdentity() })
    store.saveTeamProfile(profile)
    auditTeam('team_created', `${deviceName} 已创建局域网 Team“${teamName}”。`)
    return teamState()
  })
  ipcMain.handle('stable:team:join', async (_event, payload) => {
    const inviteCode = requireText(payload?.inviteCode, 'Team 邀请码', 4_000)
    const deviceName = requireText(payload?.deviceName, '设备名称', 80)
    teamConnection = 'connecting'; publishTeam()
    const profile = await teamNetwork.join({ inviteCode, deviceName, deviceIdentity: deviceIdentity() })
    store.saveTeamProfile(profile)
    auditTeam('team_joined', `${deviceName} 已加入局域网 Team“${profile.teamName}”。`)
    return teamState()
  })
  ipcMain.handle('stable:team:leave', async () => {
    for (const runnerValue of teamTaskRunners.values()) runnerValue.cancel()
    for (const runnerValue of collaborationRunners.values()) runnerValue.cancel()
    for (const timer of pendingCollaborationChecks.values()) clearTimeout(timer)
    collaborationRunners.clear(); pendingCollaborationChecks.clear()
    await teamNetwork.close()
    teamConnection = 'offline'
    store.clearTeamProfile()
    return publishTeam()
  })
  ipcMain.handle('stable:team:request', (_event, payload) => {
    const profile = store.teamProfile()
    if (!profile) throw new Error('请先创建或加入 Team。')
    const targetDeviceId = String(payload?.targetDeviceId || 'auto').slice(0, 100)
    if (targetDeviceId === profile.deviceId) throw new Error('AI Work 需要发送给另一台设备。')
    const sourceConversationId = requireText(payload?.sourceConversationId, '来源对话', 100)
    if (!store.conversation(sourceConversationId)) throw new Error('找不到来源对话。')
    const instruction = requireText(payload?.instruction, '任务说明', 10_000)
    const title = String(payload?.title || instruction).replace(/\s+/g, ' ').trim().slice(0, 80) || 'AI Work'
    const requiredCapabilities = Array.isArray(payload?.requiredCapabilities) ? payload.requiredCapabilities.map((item) => String(item)).slice(0, 20) : []
    createOutboundTeamTask({ targetDeviceId, sourceConversationId, title, instruction, context: { sourceConversationId, requiredCapabilities } })
    return teamState()
  })
  ipcMain.handle('stable:team:collaborate', async (_event, payload) => {
    const sourceConversationId = requireText(payload?.sourceConversationId, '来源对话', 100)
    const instruction = requireText(payload?.instruction, '协作目标', 10_000)
    const title = String(payload?.title || instruction).replace(/\s+/g, ' ').trim().slice(0, 80) || '多 Agent 协作'
    return startTeamCollaboration({ sourceConversationId, title, instruction })
  })
  ipcMain.handle('stable:team:preferences', (_event, payload) => {
    const approvalMode = ['ask', 'trusted', 'team'].includes(payload?.approvalMode) ? payload.approvalMode : teamPreferences().approvalMode
    const trustedDeviceIds = Array.isArray(payload?.trustedDeviceIds) ? payload.trustedDeviceIds.map((item) => String(item)).slice(0, 100) : teamPreferences().trustedDeviceIds
    const trustedCapabilities = Array.isArray(payload?.trustedCapabilities) ? payload.trustedCapabilities.map((item) => String(item)).slice(0, 100) : teamPreferences().trustedCapabilities
    saveTeamPreferences({ approvalMode, trustedDeviceIds, trustedCapabilities })
    auditTeam('trust_policy_changed', `远程任务审批策略已更新为 ${approvalMode}；可信设备 ${trustedDeviceIds.length} 台。`)
    return teamState()
  })
  ipcMain.handle('stable:team:role', (_event, payload) => {
    const profile = store.teamProfile()
    if (profile?.role !== 'owner') throw new Error('只有 Team 所有者可以调整成员角色。')
    const deviceId = requireText(payload?.deviceId, '设备 ID', 100)
    const role = ['admin', 'member'].includes(payload?.role) ? payload.role : 'member'
    const target = store.listTeamDevices().find((item) => item.id === deviceId && item.status === 'online')
    if (!target || target.id === profile.deviceId) throw new Error('只能调整在线远程成员。')
    teamNetwork.send(deviceId, { type: 'team:role', role })
    auditTeam('role_changed', `${target.name} 已调整为 ${role === 'admin' ? '管理员' : '成员'}。`)
    return teamState()
  })
  ipcMain.handle('stable:team:shareConversation', (_event, payload) => {
    const profile = store.teamProfile()
    if (!profile || teamConnection !== 'online') throw new Error('请先连接 Team。')
    const targetDeviceId = requireText(payload?.targetDeviceId, '目标设备', 100)
    const target = store.listTeamDevices().find((item) => item.id === targetDeviceId && item.id !== profile.deviceId)
    if (!target || target.status !== 'online') throw new Error('只能向在线的远程设备发送对话。')
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const conversation = store.conversation(conversationId)
    const snapshot = buildConversationSnapshot(conversation, store.listMessages(conversationId))
    const offerId = randomUUID()
    teamNetwork.send(targetDeviceId, { type: 'conversation:offer', offerId, ...snapshot, createdAt: new Date().toISOString() })
    auditTeam('conversation_sent', `已将对话“${snapshot.title}”的当前快照发送给 ${target.name}。`)
    return teamState()
  })
  ipcMain.handle('stable:team:decideConversation', (_event, payload) => {
    const offerId = requireText(payload?.offerId, '对话快照 ID', 100)
    const offer = store.teamConversationOffer(offerId)
    if (!offer) throw new Error('这个对话快照已处理或不存在。')
    const allowed = Boolean(payload?.allowed)
    if (allowed) store.importTeamConversation(offer)
    store.removeTeamConversationOffer(offerId)
    const source = store.listTeamDevices().find((item) => item.id === offer.sourceDeviceId)
    if (source?.status === 'online') {
      try { teamNetwork.send(offer.sourceDeviceId, { type: 'conversation:decision', offerId, title: offer.title, allowed }) } catch {}
    }
    auditTeam(allowed ? 'conversation_imported' : 'conversation_declined', allowed ? `已接收 ${offer.sourceDeviceName} 的对话“${offer.title}”。` : `已拒绝 ${offer.sourceDeviceName} 的对话“${offer.title}”。`)
    return { team: teamState(), agent: agentState() }
  })
  ipcMain.handle('stable:team:decide', (_event, payload) => {
    const taskId = requireText(payload?.taskId, 'AI Work ID', 100)
    const task = store.teamTask(taskId)
    if (!task || task.direction !== 'inbound' || task.status !== 'waiting_approval') throw new Error('这个 AI Work 当前不能审批。')
    const allowed = Boolean(payload?.allowed)
    store.updateTeamTask(taskId, allowed ? 'accepted' : 'rejected')
    auditTeamTask(taskId, allowed ? 'accepted' : 'rejected', allowed ? '本机用户已批准任务。' : '本机用户拒绝了任务。')
    teamNetwork.send(task.sourceDeviceId, { type: 'task:decision', taskId, allowed })
    if (allowed) void executeInboundTeamTask(taskId)
    return teamState()
  })
  ipcMain.handle('stable:team:cancel', (_event, payload) => {
    const taskId = requireText(payload?.taskId, 'AI Work ID', 100)
    const task = store.teamTask(taskId)
    if (!task || !['planning', 'routing', 'waiting_approval', 'accepted', 'running', 'synthesizing'].includes(task.status)) throw new Error('这个 AI Work 当前不能取消。')
    teamTaskRunners.get(taskId)?.cancel()
    collaborationRunners.get(taskId)?.cancel()
    if (task.context?.kind === 'root') {
      for (const childId of task.context.childTaskIds || []) {
        const child = store.teamTask(childId)
        if (!child || isTeamTaskTerminal(child.status)) continue
        teamTaskRunners.get(childId)?.cancel()
        try { teamNetwork.send(child.targetDeviceId, { type: 'task:cancel', taskId: childId }) } catch {}
        store.updateTeamTask(childId, 'cancelled', { error: '根任务已取消。' })
        auditTeamTask(childId, 'cancelled', '根任务已取消。')
      }
      store.updateTeamTask(taskId, 'cancelled', { error: '任务已取消。' })
      auditTeamTask(taskId, 'cancelled', '根任务和所有子任务已取消。')
      return teamState()
    }
    const targetDeviceId = task.direction === 'outbound' ? task.targetDeviceId : task.sourceDeviceId
    teamNetwork.send(targetDeviceId, { type: 'task:cancel', taskId })
    store.updateTeamTask(taskId, 'cancelled', { error: '任务已取消。' })
    auditTeamTask(taskId, 'cancelled', '任务已取消。')
    return teamState()
  })
  ipcMain.handle('stable:model:save', (_event, payload) => modelRegistry.save(payload))
  ipcMain.handle('stable:model:remove', (_event, payload) => {
    const catalog = modelRegistry.remove(requireText(payload?.id, '模型 ID', 100))
    publishAgentState(store.activeConversationId())
    return catalog
  })
  ipcMain.handle('stable:model:setDefault', (_event, payload) => modelRegistry.setDefault(requireText(payload?.id, '模型 ID', 100)))
  ipcMain.handle('stable:settings:globalInstructions', () => readGlobalInstructions())
  ipcMain.handle('stable:settings:saveGlobalInstructions', (_event, payload) => saveGlobalInstructions(payload?.content))
  ipcMain.handle('stable:preview:openWeb', (_event, payload) => openWebPreview(payload?.url, payload?.bounds))
  ipcMain.handle('stable:preview:openFile', (_event, payload) => openFilePreview(payload?.path, payload?.bounds))
  ipcMain.handle('stable:preview:setBounds', (_event, payload) => updatePreviewBounds(payload?.bounds))
  ipcMain.handle('stable:preview:navigate', (_event, payload) => {
    if (!previewView || previewView.webContents.isDestroyed()) return false
    const history = previewView.webContents.navigationHistory
    if (payload?.action === 'back' && history.canGoBack()) history.goBack()
    else if (payload?.action === 'forward' && history.canGoForward()) history.goForward()
    else if (payload?.action === 'reload') previewView.webContents.reload()
    else return false
    return true
  })
  ipcMain.handle('stable:preview:close', () => closePreviewView())
  ipcMain.handle('stable:clipboard:writeText', (_event, payload) => { clipboard.writeText(requireText(payload?.text, '复制内容', 2_000_000)); return true })
  ipcMain.handle('stable:appearance:theme', (_event, payload) => {
    if (!['dark', 'light'].includes(payload?.theme)) throw new Error('未知的主题颜色。')
    const theme = normalizeTheme(payload.theme)
    store.setSetting('theme', theme)
    if (mainWindow && !mainWindow.isDestroyed()) applyWindowTheme(mainWindow, theme)
    return theme
  })
  registerCompletedCountIpc(ipcMain, () => mainWindow, windowPresence)
  ipcMain.handle('stable:appearance:launchComplete', () => {
    const theme = normalizeTheme(store.getSetting('theme'))
    if (mainWindow && !mainWindow.isDestroyed()) applyWindowTheme(mainWindow, theme)
    return theme
  })
  ipcMain.on('stable:appearance:launchReady', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return
    if (process.env.STABLE_QA_CAPTURE) {
      window.setPosition(-20_000, -20_000)
      window.showInactive()
    } else {
      window.show()
      window.focus()
    }
    event.sender.send('stable:appearance:launchStart')
  })
  ipcMain.handle('stable:system:openPath', async (_event, payload) => {
    const requested = requireText(payload?.path, '路径', 1000)
    const resolved = resolveWorkspaceEntry(requested, paths.workspace)
    const openError = await shell.openPath(resolved.path)
    if (openError) throw new Error(`无法打开文件：${openError}`)
    return true
  })
  ipcMain.handle('stable:system:showItemInFolder', (_event, payload) => {
    const requested = requireText(payload?.path, '路径', 1000)
    const resolved = resolveWorkspaceEntry(requested, paths.workspace)
    shell.showItemInFolder(resolved.path)
    return true
  })
  ipcMain.handle('stable:system:openExternalHtml', async (_event, payload) => {
    const requested = requireText(payload?.path, '路径', 1000)
    const resolved = resolveWorkspaceEntry(requested, paths.workspace, { fileOnly: true })
    if (!DIRECT_HTML_EXTENSIONS.has(resolved.extension)) throw new Error('只有 HTML 文件可以使用外部浏览器打开。')
    const openError = await shell.openPath(resolved.path)
    if (openError) throw new Error(`无法使用默认浏览器打开 HTML：${openError}`)
    return true
  })
}

function createWindow() {
  const qaWidth = Number.parseInt(process.env.STABLE_QA_WIDTH || '', 10)
  const qaHeight = Number.parseInt(process.env.STABLE_QA_HEIGHT || '', 10)
  const isQa = Number.isFinite(qaWidth) && Number.isFinite(qaHeight)
  const chrome = { backgroundColor: '#000000', symbolColor: '#f7faff', height: 40 }
  const window = new BrowserWindow({
    width: isQa ? qaWidth : 1440, height: isQa ? qaHeight : 900, minWidth: isQa ? 320 : 1180, minHeight: isQa ? 480 : 720, show: false, autoHideMenuBar: true,
    backgroundColor: chrome.backgroundColor, icon: resourcePath('build', 'stable_logo_transparent.png'),
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: chrome.backgroundColor, symbolColor: chrome.symbolColor, height: chrome.height },
    } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false },
  })
  window.setMenuBarVisibility(false)
  windowPresence.attach(window)
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:')) event.preventDefault() })
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) wendingCli?.login.dispose() })
  window.on('closed', () => { wendingCli?.login.dispose(); closePreviewView(); mainWindow = undefined })
  return window
}

async function boot() {
  paths = { userData: app.getPath('userData'), workspace: path.join(app.getPath('userData'), 'workspace') }
  mkdirSync(paths.workspace, { recursive: true })
  ensureGlobalInstructions(paths.userData)
  wendingCli = new WendingCliService({
    appPath: app.getAppPath(),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    workspace: paths.workspace,
  })
  store = new StableStore(paths.userData)
  store.recoverInterruptedRuns()
  migrateLegacyLibraryScripts()
  if (process.env.STABLE_QA_THEME) store.setSetting('theme', normalizeTheme(process.env.STABLE_QA_THEME))
  if (process.env.STABLE_QA_CONVERSATION_FIXTURE && store.listConversations().every((item) => item.messageCount === 0)) {
    const primaryId = store.activeConversationId()
    store.renameConversation(primaryId, '会员经营分析')
    for (const message of qaMessages().slice(0, 4)) store.addMessage(primaryId, message.role, message.content, message.trace)
    const dataIds = [
      store.upsertData({ name: '会员月度经营表.xlsx', type: 'xlsx', path: path.join(paths.workspace, '会员月度经营表.xlsx'), size: 182400, text: '月份,会员净GMV,复购率\n7月,120000,32%\n8月,136000,35%' }),
      store.upsertData({ name: '门店行动清单.csv', type: 'csv', path: path.join(paths.workspace, '门店行动清单.csv'), size: 36400, text: '门店,行动\nA店,提升第二单转化' }),
    ]
    store.updateConversationContext(primaryId, 'analysis', dataIds)
    const secondId = store.createConversation(); store.renameConversation(secondId, '周报整理'); store.addMessage(secondId, 'user', '把本周资料整理成行动清单')
    const thirdId = store.createConversation(); store.renameConversation(thirdId, '竞对观察'); store.addMessage(thirdId, 'user', '整理竞对变化')
    store.selectConversation(primaryId)
  }
  if (process.env.STABLE_QA_PIN_ALL_CONVERSATIONS) {
    for (const conversation of store.listConversations()) store.setConversationPinned(conversation.id, true)
  }
  if (process.env.STABLE_QA_KNOWLEDGE_FIXTURE && store.listKnowledge().length === 0) {
    const fixtureRoot = knowledgeRoot(); mkdirSync(fixtureRoot, { recursive: true })
    const fixturePath = path.join(fixtureRoot, 'qa-knowledge.md')
    const fixtureContent = '# 会员复购实验\n\n## 目标\n\n验证第二单转化是否能通过分层触达提升。\n\n- 先建立对照组\n- 观察 30 天复购率\n- 记录权益成本\n\n> 只使用已启用的知识文档。'
    writeFileSync(fixturePath, fixtureContent, 'utf8')
    store.addKnowledge({ name: '会员复购实验.md', path: fixturePath, size: Buffer.byteLength(fixtureContent), content: fixtureContent, summary: '验证第二单转化并记录权益成本。' })
  }
  if (process.env.STABLE_QA_SCRIPT_FIXTURE && store.listLibrary().length === 0) {
    const fixtureRoot = path.join(paths.userData, 'data-library', 'cleaning', 'qa-script'); mkdirSync(fixtureRoot, { recursive: true })
    const fixturePath = path.join(fixtureRoot, 'START.cmd')
    writeFileSync(fixturePath, '@echo off\r\nset /p ANSWER=请选择序号：\r\necho 已选择：%ANSWER%\r\n', 'utf8')
    store.addLibraryItem({ category: 'cleaning', kind: 'script', name: '交互式清洗脚本', description: '验证清洗页控制台输入', path: fixturePath, extension: 'cmd', content: '' })
  }
  if (process.env.STABLE_QA_WORKFLOW_FIXTURE && store.listWorkflows().length === 0) {
    const dataId = store.upsertData({ name: '会员月度经营表.xlsx', type: 'xlsx', path: path.join(paths.workspace, '会员月度经营表.xlsx'), size: 182400, text: '月份,会员净GMV,复购率\n7月,120000,32%\n8月,136000,35%' })
    const knowledgeId = store.addKnowledge({ name: 'CRM 复购方法.md', path: path.join(paths.workspace, 'CRM 复购方法.md'), size: 1200, content: '# 复购方法\n先分析第二单转化，再按人群设计触达。', summary: 'CRM 第二单与复购分析方法。' })
    const skillId = store.upsertSkill({ name: '会员经营诊断', description: '区分证据、推断与行动建议', path: path.join(paths.workspace, 'skills', 'crm'), content: '# 会员经营诊断\n基于证据输出诊断与行动。' })
    const scriptId = store.addLibraryItem({ category: 'processing', kind: 'script', name: '指标清洗', description: '清洗会员指标字段', path: path.join(paths.userData, 'data-library', 'processing', 'qa', 'clean.cmd'), extension: 'cmd', content: '' })
    store.saveWorkflow({ name: '会员经营效果', description: '已保存的第二个工作流。', nodes: [
      { id: 'qa-brief', type: 'ai', title: '经营摘要', instruction: '输出经营摘要。', position: { x: 100, y: 120 } },
      { id: 'qa-brief-output', type: 'output', title: '摘要输出', outputName: '会员经营效果', outputFormat: 'html', position: { x: 560, y: 120 } },
    ], edges: [{ id: 'qa-brief-edge', source: 'qa-brief', target: 'qa-brief-output' }] })
    store.saveWorkflow({ name: '会员复购行动周报', description: '汇集经营数据与方法，经过 AI 诊断后输出行动周报。', nodes: [
      { id: 'qa-data', type: 'data', title: '会员月度经营表', resourceId: dataId, position: { x: 70, y: 50 } },
      { id: 'qa-knowledge', type: 'knowledge', title: 'CRM 复购方法', resourceId: knowledgeId, position: { x: 70, y: 340 } },
      { id: 'qa-script', type: 'script', title: '指标清洗', resourceId: scriptId, position: { x: 520, y: 50 } },
      { id: 'qa-skill', type: 'skill', title: '会员经营诊断', resourceId: skillId, position: { x: 520, y: 340 } },
      { id: 'qa-ai', type: 'ai', title: '诊断与行动编排', instruction: '结合上游证据识别复购问题，输出按优先级排序的行动清单。', position: { x: 970, y: 195 } },
      { id: 'qa-output', type: 'output', title: '生成行动周报', outputName: '会员复购行动周报', outputFormat: 'xlsx', position: { x: 1420, y: 195 } },
    ], edges: [
      { id: 'qa-e1', source: 'qa-data', target: 'qa-ai' }, { id: 'qa-e2', source: 'qa-knowledge', target: 'qa-ai' },
      { id: 'qa-e3', source: 'qa-script', target: 'qa-ai' }, { id: 'qa-e4', source: 'qa-skill', target: 'qa-ai' },
      { id: 'qa-e5', source: 'qa-ai', target: 'qa-output' },
    ] })
  }
  if (process.env.STABLE_QA_AUTOMATION_FIXTURE && store.listAutomations().length === 0) {
    store.createAutomation({ title: '每日经营摘要', prompt: '汇总今天的经营进展、风险和下一步行动。', schedule: { type: 'daily', time: '18:00' } }, 'manual')
    store.createAutomation({ title: '每周资料检查', prompt: '检查工作区资料是否完整，列出缺失和需要更新的内容。', schedule: { type: 'weekly', time: '09:00', weekdays: [1] } }, 'chat')
  }
  secrets = new SecretStore(paths.userData, safeStorage)
  const cloudEnabled = app.isPackaged || process.env.STABLE_CLOUD_ENABLED === '1'
  if (cloudEnabled) {
    const cloudFetch = createCloudFetch({
      session: session.fromPartition('stable-cloud-network', { cache: false }),
      logPath: path.join(paths.userData, 'logs', 'cloud-network.jsonl'),
      appVersion: app.getVersion(),
    })
    cloudAccount = new CloudAccountService({ store, secrets, appVersion: app.getVersion(), fetchImpl: cloudFetch })
    cloudGateway = new CloudGatewayProxy({ account: cloudAccount, fetchImpl: cloudFetch })
    await cloudGateway.start()
    await cloudAccount.restore()
    if (process.env.STABLE_QA_CLOUD_AUTHENTICATED === '1') await cloudAccount.login('qa-member', 'qa-password')
  }
  modelRegistry = new ModelRegistry(store, secrets, cloudGateway)
  modelRegistry.migrateLegacySecret()
  runner = createHarnessRunner()
  updateController = createUpdateController({
    autoUpdater, isPackaged: app.isPackaged, currentVersion: app.getVersion(),
    publish: (value) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stable:update:event', value) },
  })
  scriptRunner = new ScriptRunner({ workspace: paths.workspace })
  teamNetwork = new TeamNetwork({ onEvent: (event) => { void handleTeamNetworkEvent(event) }, capabilities: teamCapabilities })
  if (store.teamProfile()) {
    teamConnection = 'connecting'
    await teamNetwork.restore(store.teamProfile())
  }
  registerIpc()
  mainWindow = createWindow()
  // Closing only minimizes. Keep an explicit, discoverable exit route.
  tray = new Tray(resourcePath('build', 'stable_logo_transparent.png'))
  tray.setToolTip('Stable · 后台任务继续运行')
  const showWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show(); mainWindow.focus()
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 Stable', click: showWindow },
    { type: 'separator' },
    { label: '退出 Stable', click: () => app.quit() },
  ]))
  tray.on('double-click', showWindow)
  app.once('will-quit', () => tray?.destroy())
  await mainWindow.loadFile(resourcePath('dist', 'index.html'), { query: process.env.STABLE_QA_PAGE ? { page: process.env.STABLE_QA_PAGE } : undefined })
  if (app.isPackaged) setTimeout(() => cleanupStaleInstalls(process.execPath), 5_000)
  updateController.start()
  automationTimer = setInterval(checkDueAutomations, 15_000)
  setTimeout(checkDueAutomations, 1_500)
  if (process.env.STABLE_QA_CAPTURE) {
    if (process.env.STABLE_QA_REPORT_EDITOR) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.report-index-open')?.click()") }, 450)
    }
    if (process.env.STABLE_QA_AGENT_MENU) {
      const selector = process.env.STABLE_QA_AGENT_MENU === 'data'
        ? '.data-menu > summary'
        : process.env.STABLE_QA_AGENT_MENU === 'skill'
          ? '.skill-menu > summary'
          : process.env.STABLE_QA_AGENT_MENU === 'attachment'
            ? '.attachment-menu > summary'
            : '.capability-menu > summary'
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`) }, 650)
    }
    if (process.env.STABLE_QA_AGENT_SIDEBAR) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-sidebar-toggle')?.click()") }, 650)
    }
    if (process.env.STABLE_QA_TOGGLE_RAIL) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.window-titlebar-tools button[aria-controls=\"stable-main-navigation\"]')?.click()") }, 650)
    }
    if (process.env.STABLE_QA_CONVERSATION_SEARCH) {
      const searchQuery = process.env.STABLE_QA_CONVERSATION_SEARCH === '1' ? '' : process.env.STABLE_QA_CONVERSATION_SEARCH
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.window-titlebar-tools button[aria-label=\"搜索对话记录\"]')?.click()") }, 550)
      if (searchQuery) setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(() => { const input = document.querySelector('.conversation-search-field input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (input && setter) { setter.call(input, ${JSON.stringify(searchQuery)}); input.dispatchEvent(new Event('input', { bubbles: true })) } })()`) }, 850)
      if (process.env.STABLE_QA_CONVERSATION_SEARCH_SELECT) setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-search-result')?.click()") }, 1_250)
    }
    if (process.env.STABLE_QA_AGENT_TRACE) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("Array.from(document.querySelectorAll('.trace-summary[aria-expanded=\"false\"]')).at(-1)?.click()") }, 900)
    }
    if (process.env.STABLE_QA_AGENT_NEUTRAL_STATES) {
      setTimeout(async () => {
        const point = await mainWindow.webContents.executeJavaScript(`(() => {
          document.querySelector('.composer textarea')?.focus()
          const target = document.querySelector('.conversation-list-item')
          const rect = target?.getBoundingClientRect()
          return rect ? { x: Math.round(rect.right - 18), y: Math.round(rect.top + rect.height / 2) } : null
        })()`)
        if (point) mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
      }, 800)
    }
    if (process.env.STABLE_QA_MCP_TAB) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("Array.from(document.querySelectorAll('.extension-tabs button')).find((button) => button.textContent?.includes('MCP'))?.click()") }, 700)
    }
    if (process.env.STABLE_QA_WENDING_USE) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("Array.from(document.querySelectorAll('.extension-card-action button')).find((button) => button.textContent?.includes('使用'))?.click()") }, 700)
    }
    if (process.env.STABLE_QA_PIN_FIRST_CONVERSATION) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-list-item:not([data-pinned=\"true\"]) .conversation-pin-action')?.click()") }, 550)
    }
    if (process.env.STABLE_QA_CONVERSATION_ACTION_MENU) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-list-item:not([data-pinned=\"true\"]) .conversation-item-actions > button')?.click()") }, 900)
    }
    if (process.env.STABLE_QA_OPEN_CONVERSATION_FROM_TAB) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-conversation-tasks-slot .conversation-list-item:not([data-pinned=\"true\"]) .conversation-select')?.click()") }, 900)
    }
    if (process.env.STABLE_QA_UPDATE_AVAILABLE) {
      setTimeout(() => { mainWindow.webContents.send('stable:update:event', { status: 'available', currentVersion: app.getVersion(), availableVersion: '9.9.9', progress: 0 }) }, 450)
    }
    if (process.env.STABLE_QA_ACCOUNT_UPDATE_MENU) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-account-trigger')?.click()") }, 700)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.account-menu-popover button[data-update-ready=\"true\"]')?.click()") }, 1_000)
    }
    if (process.env.STABLE_QA_IMAGE_FIXTURE) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(async () => {
        const textarea = document.querySelector('.composer textarea')
        if (!textarea) return
        const preview = await window.stable.agent.imagePreview(${JSON.stringify(path.join(paths.workspace, 'qa-image.png'))})
        const blob = await (await fetch(preview)).blob()
        const transfer = new DataTransfer()
        transfer.items.add(new File([blob], 'qa-pasted-image.png', { type: 'image/png' }))
        textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
      })()`) }, 700)
    }
    if (process.env.STABLE_QA_IMAGE_PREVIEW) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.message-image')?.click()") }, 1_100)
    }
    if (process.env.STABLE_QA_IMAGE_ZOOM) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.image-lightbox [aria-label=\"放大图片\"]')?.click()") }, 1_500)
    }
    if (process.env.STABLE_QA_PREVIEW) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-file-card')?.click()") }, 900)
    }
    if (process.env.STABLE_QA_FILE_CONTEXT_MENU) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`new Promise((resolve) => { const target = document.querySelector('.conversation-file-card'); if (!target) return resolve(false); target.scrollIntoView({ block: 'center' }); setTimeout(() => { const rect = target.getBoundingClientRect(); target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 24, clientY: rect.top + 24 })); resolve(true) }, 120) })`) }, 900)
    }
    if (process.env.STABLE_QA_CONFIRM) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.conversation-list-item button[aria-label^=\"删除 \"]')?.click()") }, 850)
    }
    if (process.env.STABLE_QA_SKILL_PREVIEW) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.skill-preview-button')?.click()") }, 650)
    }
    if (process.env.STABLE_QA_SCRIPT_RUN) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("Array.from(document.querySelectorAll('.data-subnav nav button')).find((button) => button.textContent?.includes('数据清洗'))?.click()") }, 450)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.library-card .button.primary')?.click()") }, 850)
    }
    if (process.env.STABLE_QA_AGENT_TAB_ROUNDTRIP) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-button[aria-label=\"总览\"]')?.click()") }, 650)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-button[aria-label=\"对话\"]')?.click()") }, 900)
    }
    if (process.env.STABLE_QA_WORKFLOW_SELECT) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`document.querySelector('.react-flow__node[data-id=${JSON.stringify(process.env.STABLE_QA_WORKFLOW_SELECT)}]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`) }, 900)
    }
    if (process.env.STABLE_QA_WORKFLOW_TAB_ROUNDTRIP) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(() => { const input = document.querySelector('input[aria-label="工作流名称"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; if (input && setter) { setter.call(input, '切换后仍在的未保存草稿'); input.dispatchEvent(new Event('input', { bubbles: true })) } })()`) }, 1300)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-button[aria-label=\"总览\"]')?.click()") }, 1600)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.rail-button[aria-label=\"工作流\"]')?.click()") }, 1900)
    }
    if (process.env.STABLE_QA_WORKFLOW_IME) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`document.querySelector('.react-flow__node[data-id="qa-ai"], .react-flow__node[data-id="qa-brief"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`) }, 900)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(() => { const input = document.querySelector('textarea[aria-label="模块 AI 输入"]'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; if (input && setter) { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })); setter.call(input, '自动选择会员人群，并输出 English summary'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '自动选择会员人群，并输出 English summary' })) } })()`) }, 1300)
    }
    if (process.env.STABLE_QA_WORKFLOW_EXPAND) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.workflow-editor-expand')?.click()") }, 1600)
    }
    if (process.env.STABLE_QA_WORKFLOW_EDGE_RUNNING) {
      const workflow = store.listWorkflows()[0]
      if (workflow) setTimeout(() => {
        for (const edge of workflow.edges) mainWindow.webContents.send('stable:workflows:event', { workflowId: workflow.id, nodeId: edge.target, status: 'running', detail: '正在处理上游输入', time: Date.now() })
      }, 1500)
    }
    if (process.env.STABLE_QA_WORKFLOW_PAN) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(() => { const pane = document.querySelector('.react-flow__pane'); const rect = pane?.getBoundingClientRect(); if (!pane || !rect) return; const base = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }; pane.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 })); window.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: rect.left + rect.width / 2 - 1_400, clientY: rect.top + rect.height / 2 })); window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: rect.left + rect.width / 2 - 1_400, clientY: rect.top + rect.height / 2 })) })()`) }, 1750)
    }
    if (process.env.STABLE_QA_WORKFLOW_DOCK) {
      const dockLabel = process.env.STABLE_QA_WORKFLOW_DOCK === 'modules' ? '添加模块' : process.env.STABLE_QA_WORKFLOW_DOCK === 'ai' ? 'AI 生成工作流' : '工作流库'
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`document.querySelector('.workflow-dock button[aria-label=${JSON.stringify(dockLabel)}]')?.click()`) }, 900)
      if (process.env.STABLE_QA_WORKFLOW_DOCK === 'library') setTimeout(() => { void mainWindow.webContents.executeJavaScript("document.querySelector('.workflow-library-menu button:nth-of-type(2)')?.click()") }, 1200)
    }
    if (process.env.STABLE_QA_WORKFLOW_SELECT_SAVED) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.workflow-library-picker button')).find((button) => button.textContent?.includes(${JSON.stringify(process.env.STABLE_QA_WORKFLOW_SELECT_SAVED)}))?.click()`) }, 1550)
    }
    if (process.env.STABLE_QA_WORKFLOW_DELETE_EDGE) {
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`(() => { const edge = document.querySelector('.react-flow__edge'); const rect = edge?.getBoundingClientRect(); if (edge && rect) edge.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 })) })()`) }, 1100)
      setTimeout(() => { void mainWindow.webContents.executeJavaScript(`document.querySelector('.workflow-edge-menu button')?.click()`) }, 1450)
    }
    const captureDelay = Math.max(120, Number.parseInt(process.env.STABLE_QA_CAPTURE_DELAY || '3200', 10) || 3200)
    setTimeout(async () => {
      try {
        const metrics = await mainWindow.webContents.executeJavaScript(`(() => {
          const root = document.documentElement
          const body = document.body
          const stage = document.querySelector('.page-stage:not([hidden])')
          const messages = document.querySelector('.message-scroll')
          return {
            viewport: { width: root.clientWidth, height: root.clientHeight },
            document: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight },
            body: { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight },
            stage: stage ? { clientWidth: stage.clientWidth, scrollWidth: stage.scrollWidth, clientHeight: stage.clientHeight, scrollHeight: stage.scrollHeight, overflowY: getComputedStyle(stage).overflowY } : null,
            activePage: stage?.dataset.page || null,
            messages: messages ? { clientWidth: messages.clientWidth, scrollWidth: messages.scrollWidth, clientHeight: messages.clientHeight, scrollHeight: messages.scrollHeight, overflowY: getComputedStyle(messages).overflowY } : null,
            imageLayout: (() => {
              const gallery = document.querySelector('.message-image-gallery')?.getBoundingClientRect()
              const bubble = document.querySelector('.user-bubble')?.getBoundingClientRect()
              const sent = document.querySelector('.message-image')?.getBoundingClientRect()
              const draft = document.querySelector('.composer-image-selection')?.getBoundingClientRect()
              return gallery && bubble && sent && draft ? {
                sent: { width: Math.round(sent.width), height: Math.round(sent.height), bottom: Math.round(sent.bottom) },
                bubble: { top: Math.round(bubble.top) },
                draft: { width: Math.round(draft.width), height: Math.round(draft.height) },
                sentAboveBubble: sent.bottom <= bubble.top,
                visibleMetadata: Boolean(document.querySelector('.message-image-gallery figcaption, .composer-image-selection strong, .composer-image-selection small')),
              } : null
            })(),
            imageLightbox: (() => {
              const dialog = document.querySelector('.image-lightbox')
              const image = dialog?.querySelector('img')
              const rect = image?.getBoundingClientRect()
              return dialog && image && rect ? {
                visible: true,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                zoom: dialog.querySelector('.image-lightbox-zoom output')?.textContent?.trim() || null,
                downloadVisible: Boolean(dialog.querySelector('[aria-label="下载图片到本地"]')),
                closeVisible: Boolean(dialog.querySelector('[aria-label="关闭图片预览"]')),
                editVisible: Boolean(dialog.querySelector('[aria-label*="编辑"]')),
              } : null
            })(),
            preview: (() => { const pane = document.querySelector('.conversation-preview')?.getBoundingClientRect(); const workspace = document.querySelector('.conversation-workspace')?.getBoundingClientRect(); return pane && workspace ? { width: Math.round(pane.width), workspaceWidth: Math.round(workspace.width), ratio: Math.round(pane.width / workspace.width * 1000) / 1000 } : null })(),
            conversationActionMenu: (() => { const menu = document.querySelector('.conversation-action-menu'); const actions = menu?.parentElement; const rect = menu?.getBoundingClientRect(); return menu && actions && rect ? { text: menu.textContent?.replace(/\s+/g, ' ').trim(), opacity: getComputedStyle(actions).opacity, display: getComputedStyle(menu).display, left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null })(),
            rail: (() => { const shell = document.querySelector('.app-shell'); const main = document.querySelector('.main-frame')?.getBoundingClientRect(); return shell && main ? { collapsed: shell.dataset.railCollapsed === 'true', sidebarVisible: Boolean(document.querySelector('#stable-main-navigation')), mainLeft: Math.round(main.left), mainWidth: Math.round(main.width) } : null })(),
            conversationSearch: (() => { const dialog = document.querySelector('.conversation-search-dialog'); const input = dialog?.querySelector('input'); const rect = dialog?.getBoundingClientRect(); return dialog && input && rect ? { visible: true, query: input.value, resultCount: dialog.querySelectorAll('.conversation-search-result').length, focused: document.activeElement === input, left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null })(),
            currentTask: document.querySelector('.conversation-topbar strong')?.textContent?.trim() || null,
            composerPrompt: document.querySelector('.composer textarea')?.value || null,
            extensionMarket: (() => {
              const page = document.querySelector('.extension-market')
              const card = page?.querySelector('.extension-card')
              const activeTab = page?.querySelector('.extension-tabs button[data-active="true"]')
              return page ? {
                activeTab: activeTab?.textContent?.replace(/\s+/g, ' ').trim() || null,
                cardVisible: Boolean(card),
                cardStatus: card?.dataset.status || null,
                emptyText: page.querySelector('.extension-empty')?.textContent?.replace(/\s+/g, ' ').trim() || null,
              } : null
            })(),
            newConversation: (() => {
              const conversation = document.querySelector('.conversation[data-empty="true"]')
              const intro = conversation?.querySelector('.conversation-empty')?.getBoundingClientRect()
              const composer = conversation?.querySelector('.composer-box')?.getBoundingClientRect()
              const video = conversation?.querySelector('.conversation-start-animation')
              const frame = conversation?.getBoundingClientRect()
              return conversation && intro && composer && video && frame ? {
                title: conversation.querySelector('.conversation-empty h2')?.textContent?.trim() || '',
                video: { loop: video.loop, muted: video.muted, paused: video.paused, readyState: video.readyState, currentTime: Math.round(video.currentTime * 100) / 100 },
                composer: { left: Math.round(composer.left), top: Math.round(composer.top), width: Math.round(composer.width), height: Math.round(composer.height) },
                intro: { left: Math.round(intro.left), bottom: Math.round(intro.bottom), width: Math.round(intro.width), height: Math.round(intro.height) },
                gap: Math.round(composer.top - intro.bottom),
                centerDelta: Math.round((composer.top + composer.height / 2) - (frame.top + frame.height / 2)),
              } : null
            })(),
            workflowName: document.querySelector('input[aria-label="工作流名称"]')?.value || null,
            workflowInstruction: document.querySelector('textarea[aria-label="模块 AI 输入"]')?.value || null,
            workflowEditorVisible: Boolean(document.querySelector('.workflow-node-editor')),
            workflowEditorExpanded: document.querySelector('.workflow-node-editor')?.dataset.expanded === 'true',
            workflowEditorAnchor: (() => { const node = document.querySelector('.react-flow__node.selected')?.getBoundingClientRect(); const editor = document.querySelector('.workflow-node-editor')?.getBoundingClientRect(); return node && editor ? { centerDelta: Math.round(((editor.left + editor.width / 2) - (node.left + node.width / 2)) * 100) / 100, verticalGap: Math.round((editor.top - node.bottom) * 100) / 100, nodeLeft: Math.round(node.left * 100) / 100, editorLeft: Math.round(editor.left * 100) / 100 } : null })(),
            workflowNodeCopy: document.querySelector('.react-flow__node.selected .workflow-module-copy')?.textContent?.trim() || null,
            workflowOutputFormat: document.querySelector('select[aria-label="输出格式"]')?.value || null,
            workflowActions: Array.from(document.querySelectorAll('.workflow-studio-head .button')).map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
            workflowNodeCount: document.querySelectorAll('.react-flow__node').length,
            workflowEdgeCount: document.querySelectorAll('.react-flow__edge').length,
            workflowAnimatedEdgeCount: document.querySelectorAll('.react-flow__edge.animated .workflow-flow-streaks').length,
            workflowMotion: Array.from(document.querySelectorAll('.workflow-flow-streak-core')).map((edge) => ({ pathLength: Math.round(edge.getTotalLength() * 100) / 100, dashArray: getComputedStyle(edge).strokeDasharray, animationName: getComputedStyle(edge).animationName, playbackRate: edge.getAnimations()[0]?.playbackRate || 0 })),
            workflowLibraryGap: (() => { const menu = document.querySelector('.workflow-library-menu')?.getBoundingClientRect(); const picker = document.querySelector('.workflow-library-picker')?.getBoundingClientRect(); return menu && picker ? Math.round((picker.left - menu.right) * 100) / 100 : null })(),
            scriptConsoleVisible: Boolean(document.querySelector('.script-console')),
            scriptInputVisible: Boolean(document.querySelector('.script-input input')),
            componentBorders: Array.from(document.querySelectorAll('.button, .library-card, input, select')).slice(0, 20).map((element) => getComputedStyle(element).borderWidth),
          }
        })()`)
        if (previewView && !previewView.webContents.isDestroyed()) {
          metrics.previewContents = {
            kind: previewKind,
            title: previewView.webContents.getTitle(),
            url: previewView.webContents.getURL(),
            loading: previewView.webContents.isLoading(),
            javascript: previewKind === 'web' || previewKind === 'html',
          }
          if (previewKind === 'web' || previewKind === 'html') {
            try {
              Object.assign(metrics.previewContents, await previewView.webContents.executeJavaScript(`(() => {
                const qaButton = document.querySelector('#verify')
                qaButton?.click()
                return {
                  text: document.body?.innerText?.trim().slice(0, 240) || '',
                  readyState: document.readyState,
                  stableQa: document.documentElement.dataset.stableQa || '',
                  interactionText: qaButton?.textContent?.trim() || '',
                }
              })()`))
            } catch (error) { metrics.previewContents.error = error.message }
          }
        }
        const image = await mainWindow.webContents.capturePage()
        const fs = require('node:fs').promises
        await fs.writeFile(process.env.STABLE_QA_CAPTURE, image.toPNG())
        if (previewView && !previewView.webContents.isDestroyed()) {
          try {
            const previewImage = await previewView.webContents.capturePage()
            await fs.writeFile(`${process.env.STABLE_QA_CAPTURE}.preview.png`, previewImage.toPNG())
          } catch (error) { metrics.previewCaptureError = error.message }
        }
        if (process.env.STABLE_QA_INSPECT) await fs.writeFile(process.env.STABLE_QA_INSPECT, JSON.stringify(metrics, null, 2), 'utf8')
      } finally { app.quit() }
    }, captureDelay)
  }
}

if (updateHealthcheck) {
  app.whenReady().then(() => {
    if (process.env.STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE === '1') return app.exit(4)
    const userData = app.getPath('userData')
    const healthRunner = new HarnessRunner({ userData, workspace: path.join(userData, 'workspace'), packaged: app.isPackaged, resourcesPath: process.resourcesPath })
    app.exit(existsSync(app.getAppPath()) && healthRunner.ready() ? 0 : 2)
  }).catch(() => app.exit(3))
} else {
  app.whenReady().then(boot)
  app.on('activate', () => { if (!mainWindow) void boot() })
}
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => wendingCli?.login.dispose())
app.on('before-quit', () => { closePreviewView(); cancelWorkflow(); clearInterval(automationTimer); updateController?.dispose(); runner?.cancel(); for (const control of agentRunners.values()) { control.runner.cancel(); for (const reviewer of control.reviewers) reviewer.cancel() } for (const automationRunner of automationRunners.values()) automationRunner.cancel(); for (const taskRunner of teamTaskRunners.values()) taskRunner.cancel(); for (const collaborationRunner of collaborationRunners.values()) collaborationRunner.cancel(); for (const timer of pendingCollaborationChecks.values()) clearTimeout(timer); if (teamNetwork) { teamNetwork.onEvent = () => {}; void teamNetwork.close() } if (cloudGateway) void cloudGateway.stop(); scriptRunner?.cancel(); store?.recoverInterruptedRuns(); store?.close() })
