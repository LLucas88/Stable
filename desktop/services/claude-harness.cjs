'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const { approvalScope } = require('./tool-approval.cjs')
const { RunProgress, EXECUTION_GUIDANCE, isPermissionAudit } = require('./run-progress.cjs')
const { CLARIFICATION_GUIDANCE, clarificationStream } = require('./clarification.cjs')
const { HTML_PREVIEW_GUIDANCE } = require('./browser-command-route.cjs')
const { MANUAL_SKILL_POLICY } = require('./skill-invocation.cjs')
const { sessionDirectory, clearClaudeSession, activeSessions: activeHomes, assertSessionPath } = require('./claude-session.cjs')
const { createNativeToolGuard } = require('./claude-native-tools.cjs')
const { prepareClaudeSkills } = require('./claude-skills.cjs')
const { prepareClaudeMemory } = require('./claude-memory.cjs')
const { loadClaudeExtensions } = require('./claude-extensions.cjs')
const { createExtensionRuntime } = require('./claude-extension-runtime.cjs')
const SDK_VERSION = '0.3.296'
const TOOL_POLICY = 'native-bash-v8'

function runtimePath(options = {}) {
  if (options.executable) return options.executable
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude'
  if (options.packaged) return path.join(options.resourcesPath, 'claude', name)
  try { return require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${name}`) }
  catch { return path.resolve(__dirname, '../../node_modules/@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`, name) }
}

function claudeEnvironment(base, home, bridge, memoryEnabled = false, toolSearch = false) {
  const env = { ...base }
  for (const name of Object.keys(env)) {
    if (/(API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION|CREDENTIAL|COOKIE|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)/i.test(name) || /^(CODEX|DSH|OPENAI|ANTHROPIC|CLAUDE|STABLE)_/i.test(name)) delete env[name]
  }
  // This non-secret SDK setting must survive the credential/environment scrub.
  if (base.CLAUDE_CODE_GIT_BASH_PATH) env.CLAUDE_CODE_GIT_BASH_PATH = base.CLAUDE_CODE_GIT_BASH_PATH
  else if (process.platform === 'win32') {
    const candidates = [base.ProgramW6432, base.ProgramFiles, base['ProgramFiles(x86)']].filter(Boolean).map(root => path.join(root, 'Git', 'bin', 'bash.exe'))
    if (base.LOCALAPPDATA) candidates.push(path.join(base.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'))
    const bash = candidates.find(file => fs.existsSync(file))
    if (bash) env.CLAUDE_CODE_GIT_BASH_PATH = bash
  }
  delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.ELECTRON_RUN_AS_NODE
  const bypass = new Set(['127.0.0.1', 'localhost', '::1'])
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'no_proxy') {
    String(env[key]).split(',').filter(Boolean).forEach(host => bypass.add(host.trim())); delete env[key]
  }
  env.NO_PROXY = env.no_proxy = [...bypass].join(',')
  return { ...env, CLAUDE_CONFIG_DIR: home, ANTHROPIC_BASE_URL: bridge.baseURL, ANTHROPIC_API_KEY: bridge.token,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'stable', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: memoryEnabled ? '0' : '1', ENABLE_TOOL_SEARCH: toolSearch ? 'true' : 'false',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(require('./model-limits.cjs').modelLimits(bridge.model).outputTokens) }
}

function inputQueue() {
  const values = []; let wake; let closed = false
  return {
    push(value) { if (closed) throw new Error('当前任务已经结束。'); values.push(value); wake?.(); wake = null },
    close() { closed = true; wake?.(); wake = null },
    async *[Symbol.asyncIterator]() {
      while (!closed || values.length) {
        if (values.length) yield values.shift()
        else await new Promise(resolve => { wake = resolve })
      }
    },
  }
}

function writePointer(pointer, saved) {
  const temporary = pointer + '.' + randomUUID() + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 })
  fs.renameSync(temporary, pointer)
}

function terminateWindowsRuntime(child) {
  if (process.platform !== 'win32' || !child?.pid || child.exitCode !== null || child.signalCode !== null) return
  // Killing only claude.exe leaves Git Bash and its command children running.
  // Reap this runtime's tree before SDK close/abort can detach the parent.
  spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 })
}

class ClaudeHarnessRunner {
  constructor(options = {}) {
    this.options = options; this.supportsPersistentSessions = true; this.supportsTextOnly = true
    this.busy = false; this.steerReady = false; this.approvals = new Map(); this.pendingInputs = new Map()
  }
  runtimePaths() {
    return { cli: runtimePath(this.options), sandbox: 'native-bash:unsandboxed' }
  }
  ready() { return fs.existsSync(this.runtimePaths().cli) }
  async run(prompt, model, apiKey, timeoutMs = 0, onEvent = () => {}, sandboxMode = 'workspace-write', imageAttachments = [], session = {}) {
    if (this.busy) throw new Error('已有任务正在运行。')
    if (!apiKey) throw new Error('请先配置模型服务。')
    if (!this.ready()) throw new Error('Claude Agent SDK 运行时不完整，请重新安装依赖或更新 Stable。')
    const workspace = path.resolve(session.cwd || this.options.workspace)
    const writableRoots = [...new Set([workspace, ...(session.writableRoots || []).map(root => path.resolve(root))])]
    if (process.platform === 'win32' && sandboxMode !== 'read-only' && writableRoots.some(root => path.parse(root).root === root)) throw new Error('不能将整个盘符根目录作为执行工作区，请选择具体子文件夹。')
    let workspaceInfo
    try { workspaceInfo = fs.statSync(workspace) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (workspaceInfo && !workspaceInfo.isDirectory()) throw new Error(`工作区路径不是文件夹：${workspace}`)
    if (!workspaceInfo) fs.mkdirSync(workspace, { recursive: true })
    if (this.options.environment?.WENDING_SESSION_LOCK_DIR && sandboxMode !== 'read-only') {
      fs.mkdirSync(this.options.environment.WENDING_SESSION_LOCK_DIR, { recursive: true })
      writableRoots.push(fs.realpathSync(this.options.environment.WENDING_SESSION_LOCK_DIR))
    }
    const readableRoots = [...new Set([...writableRoots, ...(session.readableRoots || [])].map(root => fs.realpathSync(root)))]
    this.readableRoots = readableRoots
    this.loadImages = images => images.map(image => {
      const file = fs.realpathSync(image.path)
      if (!readableRoots.some(root => { const relative = path.relative(root, file); return !relative.startsWith('..') && !path.isAbsolute(relative) })) throw new Error('图片只能从 Stable 工作区发送。')
      const mediaType = image.mediaType || image.type || ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' })[path.extname(file).toLowerCase()]
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) throw new Error('图片格式不受支持。')
      return { type: 'image', source: { type: 'base64', media_type: mediaType, data: fs.readFileSync(file).toString('base64') } }
    })
    const images = this.loadImages(imageAttachments)
    const runsRoot = path.join(this.options.userData, 'claude', 'runs')
    fs.mkdirSync(runsRoot, { recursive: true })
    const directory = session.key && !session.textOnly ? assertSessionPath(this.options.userData, session.key) : fs.mkdtempSync(path.join(runsRoot, 'run-'))
    if (activeHomes.has(directory)) throw new Error('此对话已有任务正在运行。')
    fs.mkdirSync(directory, { recursive: true })
    const home = path.join(directory, 'home')
    try { const info = fs.lstatSync(home); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Claude 运行目录不能使用链接，历史仍保留。') } catch (error) { if (error.code !== 'ENOENT') throw error }
    fs.mkdirSync(home, { recursive: true })
    const memory = prepareClaudeMemory({ userData: this.options.userData, workspace, textOnly: session.textOnly, sandboxMode })
    const extensionsDisabled = session.textOnly === true || sandboxMode === 'read-only'
    const extensions = loadClaudeExtensions(this.options.userData, { runtime: true, disabled: extensionsDisabled })
    readableRoots.push(...extensions.readableRoots.filter(root => !readableRoots.includes(root)))
    const skillOptions = prepareClaudeSkills({ directory, workspace, readableRoots,
      selectedSkills: session.textOnly ? [] : session.selectedSkills,
      automaticSkills: session.textOnly ? [] : [...(session.automaticSkills || []), ...extensions.skills] })
    const networkAccess = sandboxMode !== 'read-only' && (typeof session.networkAccess === 'boolean' ? session.networkAccess : session.permissionMode === 'full')
    const toolPolicy = `${TOOL_POLICY}:${sandboxMode}:${networkAccess}`
    const pointer = session.key && !session.textOnly ? assertSessionPath(this.options.userData, session.key, 'stable-thread.json') : path.join(directory, 'stable-thread.json')
    let saved
    if (session.key && !session.textOnly && fs.existsSync(pointer)) {
      try { saved = JSON.parse(fs.readFileSync(pointer, 'utf8')) }
      catch { throw new Error('Claude 会话索引损坏，历史已保留。请从本地历史重建上下文。') }
      if (saved.model !== model.model || saved.baseURL !== model.baseURL || saved.cwd !== workspace || saved.contextPolicy !== session.contextPolicy || saved.toolPolicy !== toolPolicy || saved.skillPolicy !== skillOptions.fingerprint || saved.memoryEnabled !== memory.enabled || saved.extensionPolicy !== extensions.fingerprint) saved = null
    }
    activeHomes.add(directory); this.busy = true; this.cancelled = false; this.steerReady = false
    this.contextModel = model; this.contextSnapshot = saved?.contextUsage || null; this.contextPending = null
    this.threadId = saved?.threadId || randomUUID(); this.turnId = randomUUID(); this.expectedResultUuid = this.turnId
    this.approvalConversation = session.key; this.abortController = new AbortController()
    const queue = inputQueue(); this.input = queue
    const publish = event => { if (!this.cancelled || event.status === 'cancelled' || event.kind === 'approval') onEvent({ time: Date.now(), sessionId: this.threadId, depth: 0, ...event }) }
    this.publish = publish

    const execution = { commandRuntime: 'sdk-native-bash', sandboxMode, networkAccess, workspace, writableRoots, readableRoots, cliProfile: this.options.environment?.WENDING_CONFIG_DIR || null }
    this.requestApproval = ({ name, args, command, cwd }) => {
      if (this.cancelled) return Promise.resolve(false)
      const params = { tool: name, command: command || name + ' ' + JSON.stringify(args), cwd: cwd || workspace, arguments: args }
      const scope = approvalScope('claude/tool', params, {}, execution)
      const id = randomUUID()
      const event = { id: `approval:${id}`, requestId: id, kind: 'approval', eventType: 'approval/request', toolName: params.command,
        actionType: 'claude/tool', actionDigest: scope.key, approvalParameters: { ...params, threadId: this.threadId, turnId: this.turnId }, approvalCategory: scope.label,
        title: '需要权限审批', reason: name === 'Bash' ? '允许本机 Bash 执行此命令？它可访问当前账户的文件和网络，不受 WSL2 隔离。' : '请确认本次工具操作及其访问范围。', detail: params.command, status: 'running' }
      return new Promise(resolve => {
        this.approvals.set(id, { resolve, event, scope, params, execution })
        if (session.key && this.options.hasConversationApproval?.(session.key, scope.key)) this.answerApproval(id, true)
        else publish(event)
      })
    }
    const progress = new RunProgress({ permissionAudit: isPermissionAudit(session.userQuery) })
    const visibleDelta = clarificationStream(); let answer = ''; let currentMessage; let step = 0; let accepted = false
    const acknowledge = message => {
      const ids = new Set([message.uuid, message.user_message_uuid, ...(message.user_message_uuids || [])].filter(Boolean))
      for (const id of ids) {
        const pending = this.pendingInputs.get(id)
        if (pending) { clearTimeout(pending.timer); this.pendingInputs.delete(id); pending.resolve({ accepted: true }) }
      }
    }
    const record = (text, status = 'completed') => {
      const item = { id: this.turnId, type: 'agentMessage', text, phase: 'final_answer', status }
      if (session.key && !session.textOnly) {
        this.options.onRuntimeItem?.(session.key, this.threadId, this.turnId, item)
        fs.appendFileSync(assertSessionPath(this.options.userData, session.key, 'stable-turns.jsonl'), JSON.stringify({ threadId: this.threadId, id: this.turnId, status, items: [item] }) + '\n', { mode: 0o600 })
      }
    }
    let cliVersion
    const metadata = () => ({ threadId: this.threadId, home, cwd: workspace, model: model.model, baseURL: model.baseURL, version: SDK_VERSION, cliVersion, contextPolicy: session.contextPolicy, toolPolicy, skillPolicy: skillOptions.fingerprint, extensionPolicy: extensions.fingerprint, memoryEnabled: memory.enabled, seeded: accepted || Boolean(saved?.seeded), contextUsage: this.contextSnapshot })
    const acceptTurn = () => {
      if (accepted) return
      accepted = true; this.steerReady = !session.textOnly
      this.options.onTurnAccepted?.(session.key, this.threadId, this.turnId)
      if (session.key && !session.textOnly) { writePointer(pointer, metadata()); this.options.saveRuntimeSession?.(session.key, { ...metadata(), state: 'ready', engine: 'claude' }) }
    }
    this.saveContextSnapshot = () => { if (accepted && session.key && !session.textOnly) writePointer(pointer, metadata()) }
    let bridge; let timer; let progressTimer; let stopReason; let nativeProcess; let nativeExit
    try {
      const sdk = this.options.sdk || await import('@anthropic-ai/claude-agent-sdk')
      bridge = new (require('./claude-messages-bridge.cjs').ClaudeMessagesBridge)({ model, apiKey, fetchImpl: this.options.fetchImpl, onRequest: (...args) => { acceptTurn(); progress.touch(); this.options.onModelRequest?.(...args) }, search: this.options.search,
        textOnly: session.textOnly === true, expectedImages: images.length, reasoningFile: path.join(directory, 'stable-reasoning.jsonl') })
      await bridge.start()
      const env = claudeEnvironment(this.options.environment || process.env, home, bridge, memory.enabled, !session.textOnly)
      this.builtins = session.textOnly ? null : this.options.builtinTools?.({ workspace, writableRoots, conversationId: session.key })
      const onToolEvent = event => {
        if (event.status === 'running') progress.start(event.id, event.args?.command || event.name)
        if (event.output) progress.output(event.id)
        const bash = event.name === 'Bash'
        const output = event.output
        const detail = bash
          ? event.detail || (output === undefined ? event.args?.command : typeof output === 'string' ? output : [
            output.stdout, output.stderr, output.interrupted ? '命令已中断' : '',
            output.persistedOutputPath ? '完整输出：' + output.persistedOutputPath : '',
          ].filter(Boolean).join('\n') || '命令执行完成，无输出。')
          : event.detail || JSON.stringify(event.args || {}).slice(0, 8000)
        if (event.status !== 'running') { const issue = progress.complete(event.id, { status: event.status, aggregatedOutput: detail }); if (issue) { stopReason = issue; this.cancel() } }
        publish({ id: event.id, kind: 'tool', entity: 'tool', eventType: event.status === 'running' ? 'tool/start' : 'tool/end',
          title: `使用工具 ${event.name}`, toolName: event.name, inputDetail: bash ? event.args?.command : JSON.stringify(event.args || {}, null, 2).slice(0, 32000), detail: String(detail || '').slice(-32000), status: event.status })
      }
      const extensionRuntime = createExtensionRuntime({ userData: this.options.userData, config: extensions, disabled: extensionsDisabled,
        networkAccess, requestApproval: this.requestApproval, signal: this.abortController.signal, onToolEvent })
      // Approve discovery/connection before passing any remote URL to the SDK.
      await extensionRuntime.activate()
      const nativeTools = session.textOnly ? null : createNativeToolGuard({ workspace, writableRoots: [...writableRoots, ...memory.roots], readableRoots: [...readableRoots, ...memory.roots], sandboxMode, networkAccess, browserAvailable: Boolean(this.builtins),
        requestApproval: this.requestApproval, signal: this.abortController.signal, onToolEvent })
      const server = session.textOnly ? null : require('./claude-tools.cjs').createClaudeTools({ sdk, workspace, writableRoots, readableRoots, sandboxMode,
        builtinTools: this.builtins, trustedCli: this.options.trustedCli, signal: this.abortController.signal, requestApproval: this.requestApproval,
        search: (args, signal) => bridge.runSearch(args, signal), onToolEvent })
      const instructions = [
        '已启用原生 ToolSearch。需要的工具不在当前列表时，先用 ToolSearch 查询工具名称或用途；获得工具定义后再调用。搜索工具不会授予调用权限，命令和写入仍需审批。',
        '你在 Stable 中执行用户任务。优先使用 Claude Agent SDK 原生工具：Bash 执行终端命令，Read 读取文件，Write 新建或写入，Edit 精确编辑，Glob 查找文件，Grep 搜索内容，NotebookEdit 编辑笔记本，Agent 委派子任务。原生文件工具遵守目录边界；Bash 遵守审批，但本机命令不受目录隔离。仅用 Stable 工具补充原生工具缺少或当前环境无法提供的能力。模型服务由 Stable 用户选择，不要假设你连接的是 Anthropic 模型。',
        session.globalInstructions, CLARIFICATION_GUIDANCE, EXECUTION_GUIDANCE, MANUAL_SKILL_POLICY, skillOptions.instruction, memory.instruction, HTML_PREVIEW_GUIDANCE,
        this.options.trustedCli ? require('./wending-cli.cjs').wendingCliAgentInstruction() + '\n本分支通过 stable_wending 的 args 数组调用上述 CLI，优先使用该结构化工具调用业务 CLI。' : '',
        '命令通过 SDK 原生 Bash 在本机执行；Windows 下使用 Git Bash 语法和 /c/...、/d/... 路径，原生文件工具使用 Windows 路径。Bash 不提供 WSL2 隔离，审批通过后可能访问工作区以外的文件和网络。使用 timeout 参数（毫秒），不使用 stable_exec、cwd 或 timeoutMs 参数。禁止后台运行；任务停止前等待命令完成。当前模型服务的联网搜索使用 stable_search；共享浏览器交互使用 stable_browser；文档任务优先使用当前授权且适用的 Skill，stable_excel 等工具保留备用。只可读取当前手动选择或自动授权目录中的技能；禁止通过 shell 安装 Skill。',
        !networkAccess || sandboxMode === 'read-only' ? '本轮只读或禁网，不提供 Bash；请使用获准的原生文件工具，不可请求其他工具绕过此限制。' : '',
        session.textOnly ? '本轮只输出所要求的文字或 JSON，禁止调用任何工具。' : '',
        `本轮工作目录：${workspace}\n可读取目录：${readableRoots.join('\n')}\n可写入目录：${sandboxMode === 'read-only' ? '无（只读模式）' : writableRoots.join('\n')}`,
      ].filter(Boolean).join('\n\n')
      const first = { type: 'user', uuid: this.turnId, session_id: this.threadId, parent_tool_use_id: null, client_composed: true,
        message: { role: 'user', content: [{ type: 'text', text: !saved?.seeded && session.initialPrompt ? session.initialPrompt : prompt }, ...images] } }
      queue.push(first)
      const skillTools = skillOptions.names.length ? ['Skill'] : []
      const workerTools = ['ToolSearch', ...(nativeTools?.tools || []), ...skillTools, ...extensionRuntime.names, ...['stable_search', ...(this.options.trustedCli ? ['stable_wending'] : []), ...(this.builtins ? ['stable_excel', 'stable_browser', 'stable_skill_install'] : [])].map(name => `mcp__stable__${name}`)]
      const skillPermission = input => {
        try { return { behavior: 'allow', updatedInput: skillOptions.authorize(input) } }
        catch (error) { return { behavior: 'deny', message: '此 Skill 不在本轮授权白名单中。' } }
      }
      const workerInput = input => {
        const value = { ...input, subagent_type: 'stable-worker', run_in_background: false }
        delete value.model; delete value.isolation; delete value.mode
        return value
      }
      // The CLI rejects the entire agent definition for windows below 100k.
      const compactBudget = require('./model-limits.cjs').modelLimits(model).autoCompactTokenLimit
      const workerCompactWindow = compactBudget >= 100_000 ? Math.min(1_000_000, Math.max(100_000, Math.floor(compactBudget * 0.8))) : undefined
      this.query = sdk.query({ prompt: queue, options: {
        cwd: workspace, pathToClaudeCodeExecutable: this.runtimePaths().cli, env,
        // Recent SDKs may default to auto/classifier mode. Stable owns approval
        // routing through its hooks and callbacks, including child agents.
        permissionMode: 'default',
        ...(saved?.threadId ? { resume: saved.threadId } : { sessionId: this.threadId }),
        // The SDK's model name describes the Messages wire contract; the bridge
        // always routes to the user's actual model and never the alias above.
        model: 'claude-sonnet-4-6', tools: server ? ['Agent', 'ToolSearch', ...nativeTools.tools, ...skillTools] : [], skills: skillOptions.names, plugins: skillOptions.plugins, settingSources: [], strictMcpConfig: true,
        systemPrompt: { type: 'custom', prompt: instructions, snapshot: false }, settings: { autoCompactWindow: require('./model-limits.cjs').modelLimits(model).autoCompactTokenLimit, autoMemoryEnabled: memory.enabled, ...(memory.enabled ? { autoMemoryDirectory: memory.directory } : {}) },
        includePartialMessages: true, persistSession: Boolean(session.key && !session.textOnly),
        ...(server ? { mcpServers: { stable: server, ...extensions.servers }, allowedTools: ['mcp__stable__*'] } : { mcpServers: {} }),
        ...(server ? {
          agents: { 'stable-worker': { description: '在当前任务目录与审批边界内执行可独立委派的子任务。', prompt: instructions, model: 'inherit', tools: workerTools,
            ...(workerCompactWindow ? { autoCompactWindow: workerCompactWindow } : {}) } },
          hooks: {
            PreToolUse: [
              { matcher: '^mcp__', hooks: [input => extensionRuntime.preToolUse(input)] },
              { matcher: '^ToolSearch$', hooks: [async input => { onToolEvent({ id: input.tool_use_id, name: 'ToolSearch', args: input.tool_input, status: 'running' }); return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } } }] },
              { matcher: '^(Agent|Task)$', hooks: [async input => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: workerInput(input.tool_input) } })] },
              { matcher: '^(' + nativeTools.tools.join('|') + ')$', hooks: [nativeTools.preToolUse] },
              { matcher: '^Skill$', hooks: [async input => {
                const permission = skillPermission(input.tool_input)
                onToolEvent({ id: input.tool_use_id, name: 'Skill', args: input.tool_input, status: permission.behavior === 'allow' ? 'running' : 'failed', detail: permission.message })
                return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: permission.behavior, updatedInput: permission.updatedInput, permissionDecisionReason: permission.message } }
              }] },
            ],
            PostToolUse: [{ matcher: '^mcp__', hooks: [async input => { extensionRuntime.completed(input); return {} }] }, { matcher: '^(' + nativeTools.tools.join('|') + ')$', hooks: [nativeTools.postToolUse] }, { matcher: '^(Skill|ToolSearch)$', hooks: [async input => { onToolEvent({ id: input.tool_use_id, name: input.tool_name, args: input.tool_input, status: 'completed' }); return {} }] }],
            PostToolUseFailure: [{ matcher: '^mcp__', hooks: [async input => { extensionRuntime.completed(input, true); return {} }] }, { matcher: '^(' + nativeTools.tools.join('|') + ')$', hooks: [nativeTools.postToolUseFailure] }, { matcher: '^(Skill|ToolSearch)$', hooks: [async input => { onToolEvent({ id: input.tool_use_id, name: input.tool_name, args: input.tool_input, status: 'failed', detail: input.error }); return {} }] }],
          },
        } : {}),
        canUseTool: async (name, input, options) => server && (name === 'Agent' || name === 'Task')
          ? { behavior: 'allow', updatedInput: workerInput(input) }
          : server && name === 'Skill' ? skillPermission(input)
          : server && name === 'ToolSearch' ? { behavior: 'allow', updatedInput: input }
          : server && name.startsWith('mcp__') && !name.startsWith('mcp__stable__') ? extensionRuntime.permission(name, input)
          : nativeTools ? nativeTools.canUseTool(name, input, options) : { behavior: 'deny', message: '本轮不允许调用工具。' },
        abortController: this.abortController, extraArgs: { 'replay-user-messages': null },
        spawnClaudeCodeProcess: options => {
          nativeProcess = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, signal: options.signal })
          this.nativeProcess = nativeProcess
          nativeExit = new Promise(resolve => nativeProcess.once('close', resolve))
          return nativeProcess
        },
      } })
      if (timeoutMs > 0) timer = setTimeout(() => { stopReason = 'Claude 任务执行超时。'; this.cancel() }, timeoutMs)
      if (typeof this.query.initializationResult === 'function') {
        const initialization = await this.query.initializationResult()
        cliVersion = initialization.claude_code_version
        if (typeof cliVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(cliVersion)) cliVersion = undefined
        publish({ id: 'runtime-info', kind: 'status', title: '执行环境', detail: `Claude Agent SDK ${SDK_VERSION} · Claude Code ${cliVersion || '版本未返回'} · SDK 原生 Bash（${nativeTools?.tools.includes('Bash') ? '本机执行，无 WSL2 隔离' : '本轮已禁用'}）`, status: 'completed' })
        if (accepted && session.key && !session.textOnly) { writePointer(pointer, metadata()); this.options.saveRuntimeSession?.(session.key, { ...metadata(), state: 'ready', engine: 'claude' }) }
      }
      progressTimer = setInterval(() => {
        const issue = progress.check(this.approvals.size > 0)
        if (issue) { stopReason = issue; this.cancel() }
        else publish({ id: 'run-progress', kind: 'status', title: this.approvals.size ? '等待权限审批' : '正在执行任务', detail: progress.detail(), status: 'running' })
      }, 5000)
      publish({ id: `${this.threadId}:agent`, kind: 'status', entity: 'agent', eventType: 'agent/start', title: 'Stable 总控', detail: saved ? '继续 Claude Agent SDK 会话' : '启动 Claude Agent SDK 会话', status: 'running' })
      for await (const message of this.query) {
        if (this.cancelled) throw new Error(stopReason || '任务已停止。')
        progress.touch(); acknowledge(message)
        if (message.type === 'system' && message.subtype === 'init') {
          if (message.session_id) this.threadId = message.session_id
          if (server && !(message.mcp_servers || []).some(item => item.name === 'stable' && item.status === 'connected')) throw new Error('Claude SDK 未连接 Stable 工具服务。')
          const unavailable = Object.keys(extensions.servers).filter(name => !(message.mcp_servers || []).some(item => item.name === name && item.status === 'connected'))
          if (unavailable.length) throw new Error(`外部 MCP 未连接：${unavailable.join('、')}。请检查扩展配置后重试。`)
        }
        if (message.type === 'user' && message.uuid === first.uuid) acceptTurn()
        if (message.type === 'system' && ['task_started', 'task_notification'].includes(message.subtype)) {
          publish({ id: `${message.task_id}:agent`, sessionId: message.task_id, parentSessionId: this.threadId, depth: 1, kind: 'status', entity: 'agent',
            eventType: message.subtype === 'task_started' ? 'agent/descriptor' : 'agent/end', title: message.description || '子 Agent',
            detail: message.summary || '', status: message.subtype === 'task_started' ? 'running' : message.status === 'completed' ? 'completed' : 'failed' })
        }
        if (message.parent_tool_use_id) continue
        if (message.type === 'stream_event') {
          acceptTurn()
          const event = message.event
          if (event.type === 'message_start') { currentMessage = event.message.id; step++ }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const id = currentMessage || message.uuid
            publish({ id, kind: 'answer', eventType: 'agent/answer-delta', delta: visibleDelta(id, event.delta.text), step, status: 'running' })
          }
        } else if (message.type === 'assistant') {
          acceptTurn()
          const text = message.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
          if (text) { answer = text; this.options.onRuntimeItem?.(session.key, this.threadId, this.turnId, { id: message.uuid, type: 'agentMessage', text, status: 'completed' }) }
        } else if (message.type === 'result') {
          if (this.expectedResultUuid !== first.uuid) {
            const resultInputs = [message.user_message_uuid, ...(message.user_message_uuids || [])].filter(Boolean)
            // A receipt means queued input was accepted, not that the earlier
            // turn's result already includes it. Wait for the correct result.
            if (!resultInputs.includes(this.expectedResultUuid)) continue
          }
          if (message.is_error || message.subtype !== 'success') throw new Error((message.errors || []).join('\n') || 'Claude Agent SDK 执行失败。')
          answer = message.result || answer
          if (this.pendingInputs.size) continue
          if (!answer.trim()) throw new Error('Claude Agent SDK 未返回最终回答。')
          const resultFor = this.expectedResultUuid
          if (session.key && !session.textOnly) await this.getContextUsage()
          if (this.cancelled) throw new Error('任务已停止。')
          if (this.pendingInputs.size || this.expectedResultUuid !== resultFor) continue
          record(answer.trim()); queue.close()
          publish({ id: `${this.threadId}:agent`, kind: 'status', entity: 'agent', eventType: 'agent/end', title: 'Stable 总控', status: 'completed' })
          return answer.trim()
        }
      }
      throw new Error(this.cancelled ? stopReason || '任务已停止。' : 'Claude 连接提前结束，未取得任务完成结果。')
    } catch (error) {
      if (accepted) record(answer, this.cancelled ? 'interrupted' : 'failed')
      if (this.cancelled) throw new Error(stopReason || '任务已停止。')
      error.message = String(error.message || error).split(apiKey).join('[redacted]')
      throw error
    } finally {
      clearTimeout(timer); clearInterval(progressTimer); this.steerReady = false; queue.close()
      for (const entry of this.approvals.values()) entry.resolve(false)
      this.approvals.clear()
      for (const pending of this.pendingInputs.values()) { clearTimeout(pending.timer); pending.reject(Object.assign(new Error('补充消息接收状态尚未确认，不会自动重发。'), { code: 'STEER_UNCERTAIN' })) }
      this.pendingInputs.clear()
      const query = this.query
      terminateWindowsRuntime(nativeProcess)
      try { query?.close(); await query?.return?.() } catch { /* Preserve the run's result or primary error while reaping its process. */ }
      if (nativeProcess?.exitCode === null && nativeProcess?.signalCode === null) { try { nativeProcess.kill('SIGKILL') } catch {} }
      try {
        await nativeExit
        try { this.builtins?.dispose() } finally { await bridge?.close() }
      } finally {
        this.saveContextSnapshot = null; this.query = null; this.nativeProcess = null; this.builtins = null; activeHomes.delete(directory); this.busy = false
      }
      publish({ id: 'run-progress', kind: 'status', title: this.cancelled ? '任务已取消' : '执行已结束', status: this.cancelled ? 'cancelled' : 'completed', detail: progress.detail() })
    }
  }
  async getContextUsage() {
    const query = this.query
    if (!query?.getContextUsage || this.cancelled) return this.contextSnapshot || null
    if (!this.contextPending) {
      const request = Promise.resolve().then(() => query.getContextUsage({ detail: 'summary' })).then(raw => {
        if (this.query !== query || this.cancelled) return
        const snapshot = require('./context-usage.cjs').normalizeContextUsage(raw, this.contextModel)
        if (snapshot) { this.contextSnapshot = snapshot; this.saveContextSnapshot?.() }
      }).catch(() => { /* Usage display must not interrupt the conversation. */ })
      this.contextPending = request
      void request.finally(() => { if (this.contextPending === request) this.contextPending = null })
    }
    let timer
    try { await Promise.race([this.contextPending, new Promise(resolve => { timer = setTimeout(resolve, 2500) })]) }
    finally { clearTimeout(timer) }
    return this.contextSnapshot || null
  }
  answerApproval(requestId, allowed, duration = 'once') {
    const key = String(requestId); const entry = this.approvals.get(key)
    if (!entry || this.cancelled) return false
    const changed = allowed && approvalScope('claude/tool', entry.params, {}, entry.execution).key !== entry.scope.key
    if (changed) { allowed = false; duration = 'once' }
    if (duration === 'conversation') {
      if (!allowed || !this.approvalConversation || !this.options.grantConversationApproval) throw new Error('此请求无法保存对话授权，请选择允许一次。')
      this.options.grantConversationApproval(this.approvalConversation, entry.scope.key, entry.scope.label)
    }
    this.approvals.delete(key)
    this.publish?.({ ...entry.event, actualDecision: allowed ? 'approved' : 'denied', title: allowed ? '已允许本次操作' : '已拒绝本次操作', status: 'completed' })
    entry.resolve(Boolean(allowed))
    if (duration === 'conversation') for (const [id, pending] of [...this.approvals]) if (pending.scope.key === entry.scope.key) this.answerApproval(id, true)
    return !changed
  }
  cancel() {
    if (!this.busy) return false
    this.cancelled = true; this.steerReady = false
    for (const entry of this.approvals.values()) entry.resolve(false)
    terminateWindowsRuntime(this.nativeProcess)
    this.abortController?.abort(); this.builtins?.dispose(); this.query?.close(); this.input?.close()
    return true
  }
  async steer(prompt, images = []) {
    if (!this.steerReady || !this.input || this.cancelled) throw new Error('当前任务尚未准备好接收调整方向。')
    const content = [{ type: 'text', text: prompt }, ...this.loadImages(images)]
    const uuid = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingInputs.delete(uuid); reject(Object.assign(new Error('补充消息接收状态尚未确认，不会自动重发。'), { code: 'STEER_UNCERTAIN' })) }, 15000)
      this.pendingInputs.set(uuid, { resolve, reject, timer })
      this.input.push({ type: 'user', uuid, session_id: this.threadId, parent_tool_use_id: null, priority: 'now', client_composed: true, message: { role: 'user', content } })
      this.expectedResultUuid = uuid
    })
  }
}

module.exports = { ClaudeHarnessRunner, claudeEnvironment, runtimePath, SDK_VERSION, sessionDirectory, clearClaudeSession }
