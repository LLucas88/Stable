'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { CodexRpc } = require('./codex-rpc.cjs')
const { CodexResponsesBridge } = require('./codex-responses-bridge.cjs')
const { isDeepSeekModel, isZhipuModel } = require('./model-registry.cjs')
const { cleanupHarnessRunDirectory } = require('./harness.cjs')
const { classifyCodexApproval } = require('./codex-approval.cjs')

const PINNED_CODEX_VERSION = '0.142.2'
const activeHomes = new Set()
function readableCodexErrorMessage(error) {
  let message = String(error?.message || error)
  for (let depth = 0; depth < 3; depth++) {
    try {
      const parsed = JSON.parse(message); const next = parsed.error?.message || parsed.message
      if (typeof next !== 'string' || next === message) break
      message = next
    } catch { break }
  }
  return message
}
const sessionHash = (key) => createHash('sha256').update(String(key)).digest('hex')
function sessionDirectory(userData, key) { return path.join(userData, 'codex', 'sessions', sessionHash(key)) }
function clearCodexSession(userData, key) {
  const directory = sessionDirectory(userData, key)
  if (activeHomes.has(directory)) throw new Error('请先停止当前任务，再清空对话。')
  // Keep rollout files for diagnostics; removing this pointer starts a fresh
  // model context without recursively deleting a user-controlled directory.
  const pointer = path.join(directory, 'stable-thread.json')
  if (fs.existsSync(pointer)) fs.unlinkSync(pointer)
}
function codexEnvironment(base, home, token, executable) {
  const env = { ...base }
  for (const key of Object.keys(env)) {
    if (/(API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)/i.test(key) || /^(CODEX|DSH|OPENAI|STABLE)_/i.test(key)) delete env[key]
  }
  delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.ELECTRON_RUN_AS_NODE
  env.CODEX_HOME = home
  env.STABLE_CODEX_GATEWAY_TOKEN = token
  const root = path.dirname(path.dirname(executable))
  env.PATH = [path.join(root, 'codex-path'), path.join(root, 'codex-resources'), env.PATH || env.Path || ''].join(path.delimiter)
  return env
}
function runtimePath(options) {
  if (options.executable) return options.executable
  if (process.env.STABLE_CODEX_PATH) return path.resolve(process.env.STABLE_CODEX_PATH)
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex'
  return options.packaged
    ? path.join(options.resourcesPath, 'codex', 'bin', name)
    : path.resolve(__dirname, '../../runtime/codex/bin', name)
}
function buildConfig({ model, baseURL, searchCommand, searchScript, token, searchEnabled }) {
  const q = JSON.stringify
  const lines = [
    `model = ${q(model.model)}`, 'model_provider = "stable"', 'approval_policy = "untrusted"', 'sandbox_mode = "workspace-write"',
    'web_search = "disabled"', 'model_supports_reasoning_summaries = false', 'model_context_window = 128000', 'model_auto_compact_token_limit = 90000',
    'check_for_update_on_startup = false', 'cli_auth_credentials_store = "file"',
    '[model_providers.stable]', 'name = "Stable"', `base_url = ${q(baseURL)}`, 'wire_api = "responses"',
    'env_key = "STABLE_CODEX_GATEWAY_TOKEN"', 'requires_openai_auth = false', 'supports_websockets = false', 'request_max_retries = 0',
    '[features]', 'multi_agent = true', 'apps = false', 'plugins = false', 'hooks = false', 'workspace_dependencies = false',
    'computer_use = false', 'browser_use = false', 'image_generation = false', 'memories = false', 'skill_mcp_dependency_install = false', 'remote_compaction_v2 = false',
    '[agents]', 'max_threads = 3',
    '[sandbox_workspace_write]', 'network_access = false',
    '[windows]', 'sandbox = "unelevated"',
  ]
  if (searchEnabled) lines.push('[mcp_servers.stable_search]', `command = ${q(searchCommand)}`, `args = [${q(searchScript)}]`, 'startup_timeout_sec = 15',
    '[mcp_servers.stable_search.env]', 'ELECTRON_RUN_AS_NODE = "1"', `STABLE_CODEX_GATEWAY = ${q(baseURL)}`, `STABLE_CODEX_GATEWAY_TOKEN = ${q(token)}`,
    '[mcp_servers.stable_search.tools.web_search]', 'approval_mode = "auto"')
  return `${lines.join('\n')}\n`
}

class CodexHarnessRunner {
  constructor(options) { this.options = options; this.supportsPersistentSessions = true; this.busy = false; this.approvals = new Map() }
  runtimePaths() { return { cli: runtimePath(this.options) } }
  ready() { return fs.existsSync(this.runtimePaths().cli) }
  async run(prompt, model, apiKey, timeoutMs = 0, onEvent = () => {}, sandboxMode = 'workspace-write', imageAttachments = [], session = {}) {
    if (this.busy) throw new Error('已有任务正在运行。')
    if (!apiKey) throw new Error('请先配置模型服务。')
    if (imageAttachments.length && isDeepSeekModel(model)) throw new Error('DeepSeek 暂不支持图片分析，请切换其他模型。')
    if (!this.ready()) throw new Error(this.options.packaged ? 'Codex 运行时不完整，请重新安装 Stable。' : 'Codex 运行时不完整，请先运行 npm run runtime:codex。')
    const workspace = path.resolve(this.options.workspace)
    fs.mkdirSync(workspace, { recursive: true })
    const canonicalWorkspace = fs.realpathSync(workspace)
    for (const image of imageAttachments) {
      const relative = path.relative(canonicalWorkspace, fs.realpathSync(image.path))
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('图片只能从 Stable 工作区发送。')
    }
    const runsRoot = path.join(this.options.userData, 'codex', 'runs')
    fs.mkdirSync(runsRoot, { recursive: true })
    const home = session.key ? sessionDirectory(this.options.userData, session.key) : fs.mkdtempSync(path.join(runsRoot, 'run-'))
    if (activeHomes.has(home)) throw new Error('此对话已有任务正在运行。')
    activeHomes.add(home); this.busy = true; this.cancelled = false; this.threadId = null; this.turnId = null; this.approvals.clear()
    const pointer = path.join(home, 'stable-thread.json')
    let saved
    let migrated = false
    let timer; let rpc; let bridge; let settled = false; let rejectTurn; let resolveTurn
    const turn = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject })
    turn.catch(() => {})
    const answers = new Map(); const finalAnswers = new Map(); const parents = new Map(); const answerSteps = new Map()
    const depthOf = (id) => { let depth = 0; const seen = new Set(); while (id && id !== this.threadId && !seen.has(id)) { seen.add(id); depth++; id = parents.get(id) }; return depth }
    const publish = (event) => onEvent({ time: Date.now(), ...event })
    const fail = (error) => { if (!settled) { settled = true; rejectTurn(error) } }
    this.failRun = fail
    const handleNotification = ({ method, params: p = {} }) => {
      const child = p.threadId && this.threadId && p.threadId !== this.threadId
      if (method === 'thread/started' && p.thread?.parentThreadId) {
        const thread = p.thread; parents.set(thread.id, thread.parentThreadId)
        publish({ id: `${thread.id}:agent`, sessionId: thread.id, parentSessionId: thread.parentThreadId, depth: depthOf(thread.id), kind: 'status', entity: 'agent', eventType: 'agent/descriptor', title: thread.agentNickname || thread.agentRole || '子 Agent', status: 'running' })
      }
      const base = { sessionId: p.threadId || this.threadId, ...(child ? { parentSessionId: parents.get(p.threadId) || this.threadId, depth: depthOf(p.threadId) || 1 } : { depth: 0 }) }
      if (method === 'turn/started' && !child) this.turnId = p.turn?.id
      if (method === 'item/agentMessage/delta' && !child) {
        answers.set(p.itemId, (answers.get(p.itemId) || '') + p.delta)
        if (!answerSteps.has(p.itemId)) answerSteps.set(p.itemId, answerSteps.size)
        publish({ ...base, id: `${p.threadId}:${p.itemId}`, kind: 'answer', eventType: 'agent/answer-delta', delta: p.delta, turn: 0, step: answerSteps.get(p.itemId), status: 'running' })
      } else if (['item/started', 'item/completed'].includes(method)) {
        const item = p.item || {}; const completed = method === 'item/completed'
        const status = ['failed', 'declined', 'errored'].includes(item.status) ? 'failed' : completed ? 'completed' : 'running'
        if (item.type === 'agentMessage') { if (!child && completed) { answers.set(item.id, item.text || ''); if (item.phase === 'final_answer') finalAnswers.set(item.id, item.text || '') }; return }
        if (item.type === 'userMessage') return
        publish({ ...base, id: `${p.threadId}:${item.id}`, kind: ['reasoning', 'plan', 'contextCompaction'].includes(item.type) ? 'reasoning' : 'tool', entity: 'tool', eventType: completed ? 'tool/end' : 'tool/start',
          title: item.type === 'reasoning' ? '分析任务与上下文' : `使用工具 ${item.tool || item.type}`, detail: String(status === 'failed' ? item.error?.message || item.aggregatedOutput || item.command || '' : item.command || item.query || item.text || item.prompt || '').slice(0, 500), status })
        if (item.type === 'collabAgentToolCall') for (const id of item.receiverThreadIds || []) {
          parents.set(id, item.senderThreadId || this.threadId)
          const state = item.agentsStates?.[id]
          publish({ id: `${id}:agent`, sessionId: id, parentSessionId: item.senderThreadId || this.threadId, depth: depthOf(id), kind: 'status', entity: 'agent', eventType: 'agent/descriptor', title: '子 Agent',
            detail: state?.message || item.prompt || '', status: state?.status === 'completed' ? 'completed' : ['errored', 'notFound'].includes(state?.status) ? 'failed' : ['interrupted', 'shutdown'].includes(state?.status) ? 'cancelled' : 'running' })
        }
      } else if (method === 'turn/completed') {
        const result = p.turn
        publish({ ...base, id: `${p.threadId}:agent`, kind: 'status', entity: 'agent', eventType: 'agent/end', title: child ? '子 Agent' : 'Stable 总控', status: result?.status === 'completed' ? 'completed' : result?.status === 'interrupted' ? 'cancelled' : 'failed' })
        if (child || settled) return
        if (this.cancelled || result?.status === 'interrupted') { fail(new Error('任务已停止。')); return }
        if (result?.status !== 'completed') { fail(new Error(result?.error?.message || 'Codex 执行失败。')); return }
        for (const item of result.items || []) if (item.type === 'agentMessage') answers.set(item.id, item.text)
        const finalItems = (result.items || []).filter((item) => item.type === 'agentMessage' && item.phase === 'final_answer')
        const answer = finalItems.length ? finalItems.map((item) => item.text).join('\n\n') : finalAnswers.size ? [...finalAnswers.values()].join('\n\n') : [...answers.values()].at(-1) || ''
        if (!answer.trim()) { fail(new Error('Codex 未返回最终回答。')); return }
        settled = true; resolveTurn(answer.trim())
      } else if (method === 'serverRequest/resolved') this.approvals.delete(String(p.requestId))
    }
    const handleRequest = async (message) => {
      const { method, params: p, id } = message
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval'].includes(method)) {
        const key = String(id)
        const toolName = p.command || (method.includes('fileChange') ? '修改文件' : '扩大访问权限')
        this.approvals.set(key, { id, method, params: p })
        // commandActions is a best-effort display summary, not a safety verdict.
        const assessment = await classifyCodexApproval(method, p, workspace)
        if (settled || this.cancelled || !this.approvals.has(key)) return
        const danger = assessment.risk === 'high'
        publish({ id: `approval:${key}`, requestId: key, sessionId: p.threadId, ...(p.threadId !== this.threadId ? { parentSessionId: parents.get(p.threadId) || this.threadId, depth: depthOf(p.threadId) || 1 } : {}), kind: 'approval', eventType: 'approval/request', toolName,
          title: danger ? '高风险操作需要确认' : assessment.risk === 'unknown' ? '此操作需要复核' : '需要权限审批',
          reason: [assessment.reason, p.reason].filter(Boolean).join('；'), detail: toolName, danger, approvalRisk: assessment.risk, status: 'running' })
      } else if (method === 'item/tool/requestUserInput') {
        publish({ id: `input:${id}`, kind: 'status', title: '需要补充信息', detail: (p.questions || []).map((q) => q.question).join('\n'), status: 'completed' })
        rpc.reply(id, { answers: {} })
      } else if (method === 'mcpServer/elicitation/request') rpc.reply(id, { action: 'decline', content: null })
      else rpc.send({ id, error: { code: -32601, message: `Stable does not support ${method}` } })
    }
    try {
      fs.mkdirSync(home, { recursive: true })
      if (session.key && fs.existsSync(pointer)) {
        try { saved = JSON.parse(fs.readFileSync(pointer, 'utf8')) } catch { throw new Error('Codex 会话索引损坏，请清空该对话后重试。') }
        if (saved.threadId && saved.reasoningVersion !== 1) {
          if (!session.initialPrompt) throw new Error('旧版 Codex 会话缺少模型上下文，请从 Stable 对话继续或新建对话重试。')
          // Old releases discarded provider state. Seed a compatible thread from
          // Stable's visible history; keep original rollouts and workspace files.
          saved = null; migrated = true
        }
      }
      bridge = new CodexResponsesBridge({ model, apiKey, fetchImpl: this.options.fetchImpl, onRequest: this.options.onModelRequest, search: this.options.search, expectedImages: imageAttachments.length, reasoningFile: path.join(home, 'stable-reasoning.jsonl') })
      const baseURL = await bridge.start()
      const executable = this.runtimePaths().cli
      const config = buildConfig({ model, baseURL, token: bridge.token, searchCommand: process.execPath, searchScript: path.join(__dirname, 'codex-search-mcp.cjs'), searchEnabled: model.providerId !== 'stable-cloud' && (isZhipuModel(model) || isDeepSeekModel(model)) })
      fs.writeFileSync(path.join(home, 'config.toml'), config, { mode: 0o600 })
      if (this.cancelled) throw new Error('任务已停止。')
      rpc = new CodexRpc({ executable, args: this.options.executableArgs, cwd: workspace, env: codexEnvironment(this.options.environment || process.env, home, bridge.token, executable),
        spawnImpl: this.options.spawn, onNotification: handleNotification, onRequest: (message) => { void handleRequest(message).catch(fail) }, onClose: (error) => fail(this.cancelled ? new Error('任务已停止。') : error) })
      this.rpc = rpc
      if (timeoutMs > 0) timer = setTimeout(() => { this.cancel(); fail(new Error('Codex 任务执行超时。')) }, timeoutMs)
      await rpc.request('initialize', { clientInfo: { name: 'stable', version: require('../../package.json').version }, capabilities: { experimentalApi: false } })
      rpc.send({ method: 'initialized', params: {} })
      const params = { model: model.model, modelProvider: 'stable', cwd: workspace, sandbox: sandboxMode === 'read-only' ? 'read-only' : 'workspace-write', approvalPolicy: sandboxMode === 'read-only' ? 'never' : 'untrusted', approvalsReviewer: 'user',
        config: { 'model_providers.stable.base_url': baseURL }, developerInstructions: '你在 Stable 中工作。遵循用户提供的任务、资源和交付约束。需要补充信息时在最终回答中提问。联网查询优先使用 stable_search。' }
      const started = saved?.threadId
        ? await rpc.request('thread/resume', { ...params, threadId: saved.threadId })
        : await rpc.request('thread/start', { ...params, ephemeral: !session.key })
      this.threadId = started.thread.id
      if (session.key) {
        fs.writeFileSync(`${pointer}.tmp`, JSON.stringify({ threadId: this.threadId, seeded: Boolean(saved?.seeded), version: PINNED_CODEX_VERSION, reasoningVersion: 1 }))
        fs.renameSync(`${pointer}.tmp`, pointer)
      }
      publish({ id: `${this.threadId}:agent`, sessionId: this.threadId, depth: 0, kind: 'status', entity: 'agent', eventType: 'agent/start', title: 'Stable 总控', detail: saved ? '继续已有 Codex 会话' : '启动 Codex 会话', status: 'running' })
      if (migrated) publish({ id: 'codex-context-upgrade', kind: 'status', title: '已升级模型上下文', detail: '已从 Stable 对话记录建立兼容会话，原有文件保留。', status: 'completed' })
      if (this.cancelled) throw new Error('任务已停止。')
      let text = !saved?.seeded && session.initialPrompt ? session.initialPrompt : prompt
      if (migrated) text += '\n\n模型上下文刚从 Stable 历史记录恢复。上一次失败前可能已经执行部分操作，请先核对现有文件和内容，避免重复追加或覆盖已完成结果。'
      const input = [{ type: 'text', text }, ...imageAttachments.map((image) => ({ type: 'localImage', path: path.resolve(image.path) }))]
      const result = await rpc.request('turn/start', { threadId: this.threadId, input, model: model.model })
      this.turnId = result.turn.id
      if (session.key) {
        fs.writeFileSync(`${pointer}.tmp`, JSON.stringify({ threadId: this.threadId, seeded: true, version: PINNED_CODEX_VERSION, reasoningVersion: 1 }))
        fs.renameSync(`${pointer}.tmp`, pointer)
      }
      if (this.cancelled) void rpc.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId }).catch(() => {})
      return await turn
    } catch (error) {
      if (this.cancelled) throw new Error('任务已停止。')
      error.message = readableCodexErrorMessage(error)
      throw error
    } finally {
      settled = true; if (timer) clearTimeout(timer)
      this.approvals.clear(); this.rpc = null; this.failRun = null
      if (bridge) await bridge.close()
      if (rpc) await rpc.close({ terminate: this.cancelled })
      // This file contains only a short-lived loopback token, never the model key.
      try { fs.unlinkSync(path.join(home, 'config.toml')) } catch {}
      try {
        if (!session.key) {
          try { cleanupHarnessRunDirectory(home, runsRoot) }
          catch { publish({ id: 'codex-cleanup', kind: 'status', title: '运行记录暂未清理', detail: '临时文件仍被系统占用，模型连接已关闭。', status: 'completed' }) }
        }
      }
      finally { activeHomes.delete(home); this.busy = false }
    }
  }
  answerApproval(requestId, allowed) {
    const entry = this.approvals.get(String(requestId))
    if (!entry || !this.rpc) return false
    const result = entry.method === 'item/permissions/requestApproval'
      ? { permissions: allowed ? entry.params.permissions || {} : {}, scope: 'turn' }
      : { decision: allowed ? 'accept' : 'decline' }
    this.rpc.reply(entry.id, result); this.approvals.delete(String(requestId)); return true
  }
  cancel() {
    if (!this.busy) return false
    this.cancelled = true
    if (this.rpc && this.threadId && this.turnId) void this.rpc.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId }, 3000).catch(() => {})
    this.failRun?.(new Error('任务已停止。'))
    if (this.rpc) void this.rpc.close({ terminate: true })
    return true
  }
}

module.exports = { CodexHarnessRunner, clearCodexSession, sessionDirectory, codexEnvironment, buildConfig, PINNED_CODEX_VERSION, readableCodexErrorMessage }
