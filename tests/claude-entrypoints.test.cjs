'use strict'

// Run actual main-process entrypoint bodies in a VM, without opening Electron.
// Only SDK process/model transport and desktop UI services are fixtures. The
// model registry, runner, Messages bridge, store, lifecycle and output writer are real.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { randomUUID } = require('node:crypto')
const { createRequire } = require('node:module')
const { StableStore } = require('../desktop/services/store.cjs')
const { ModelRegistry, modelSecretKey } = require('../desktop/services/model-registry.cjs')
const { HarnessRunner } = require('../desktop/services/execution-harness.cjs')
const { ConversationLifecycle } = require('../desktop/services/conversation-lifecycle.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')
const { TaskAlerts } = require('../desktop/services/task-alerts.cjs')
const { writeWorkflowOutput } = require('../desktop/services/workflow-output.cjs')
const mainPath = path.resolve(__dirname, '../desktop/main.cjs')
const main = fs.readFileSync(mainPath, 'utf8')
const mainRequire = createRequire(mainPath)

function sourceBetween(start, end) {
  const from = main.indexOf(start)
  const to = main.indexOf(end, from + start.length)
  assert(from >= 0 && to > from, `Main entrypoint boundary missing: ${start}`)
  return main.slice(from, to)
}

function fixture(t) {
  const previousHarness = process.env.STABLE_HARNESS
  delete process.env.STABLE_HARNESS
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-entrypoints-'))
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'workflow-source.txt'), 'WORKFLOW_READ_OK：允许目录内的资料', 'utf8')
  const store = new StableStore(path.join(root, 'data'))
  const autoDirectory = path.join(root, 'auto-skill')
  fs.mkdirSync(autoDirectory)
  const autoFile = path.join(autoDirectory, 'SKILL.md')
  fs.writeFileSync(autoFile, 'AUTO_ENTRYPOINT_BODY')
  store.upsertSkill({id:'auto-fixture',name:'auto-fixture',description:'Fixture task instructions',path:autoDirectory,content:'AUTO_ENTRYPOINT_BODY'})
  store.setSetting('skillMarketMeta', {'auto-fixture':{invocationMode:'auto'}})
  const profile = store.saveModelProfile({ id: 'fixture', providerId: 'local-fixture', displayName: 'Local fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' })
  store.setDefaultModel(profile.id)
  const secrets = new Map([[modelSecretKey(profile.id), 'fixture-only-key']])
  // No Cloud gateway/account is configured. Any upstream request must resolve
  // to this synthetic local profile and be intercepted before a network call.
  const modelRegistry = new ModelRegistry(store, secrets)
  const captures = [], upstream = [], runners = [], approvals = [], handlers = new Map()
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://provider.invalid/v1/chat/completions')
    assert.equal(options.headers.authorization, 'Bearer fixture-only-key')
    const body = JSON.parse(options.body)
    assert.equal(body.model, profile.model)
    upstream.push(body)
    const text = body.messages.map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n')
    const answer = text.includes('执行前的信息充分性判断') ? '{"status":"ready"}'
      : text.includes('模块化工作流中的 AI 运算节点') ? 'WORKFLOW_VM_OK：本机计算结果'
        : 'CHAT_VM_OK：本机聊天结果'
    return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10 } }), { headers: { 'content-type': 'application/json' } })
  }
  const sdk = {
    tool: (name, description, shape, handler) => ({ name, description, shape, handler }),
    createSdkMcpServer: value => value,
    query(parameters) {
      const capture = { options: parameters.options }; captures.push(capture)
      return {
        close() { capture.closed = true },
        async *[Symbol.asyncIterator]() {
          const first = (await parameters.prompt[Symbol.asyncIterator]().next()).value
          capture.first = first
          const options = parameters.options
          if (options.tools.length) {
            assert.match(options.systemPrompt.prompt, /允许自动调用的 Skills/)
            assert.match(options.agents['stable-worker'].prompt, /auto-fixture/)
            assert.doesNotMatch(options.systemPrompt.prompt, /AUTO_ENTRYPOINT_BODY/)
            assert.equal((await options.canUseTool('Read', {file_path:autoFile})).behavior, 'allow')
            assert.equal((await options.canUseTool('Write', {file_path:autoFile,content:'not allowed'})).behavior, 'deny')
          }
          yield { type: 'system', subtype: 'init', session_id: options.resume || options.sessionId, mcp_servers: options.mcpServers.stable ? [{ name: 'stable', status: 'connected' }] : [] }
          yield { type: 'user', uuid: first.uuid }
          if (first.message.content.some(block => block.text?.includes('模块化工作流中的 AI 运算节点'))) {
            const tools = options.mcpServers.stable.tools
            assert(tools.some(tool => tool.name === 'stable_search'))
            assert(!tools.some(tool => tool.name === 'stable_file'))
            const hook = options.hooks.PreToolUse.find(item => item.matcher.includes('Read')).hooks[0]
            const readInput = await hook({ tool_name: 'Read', tool_input: { file_path: path.join(options.cwd, 'workflow-source.txt') }, tool_use_id: 'workflow-read' })
            assert.equal(readInput.hookSpecificOutput.permissionDecision, 'allow')
            capture.read = fs.readFileSync(readInput.hookSpecificOutput.updatedInput.file_path, 'utf8')
            assert.match(capture.read, /WORKFLOW_READ_OK/)
            capture.write = await hook({ tool_name: 'Write', tool_input: { file_path: path.join(options.cwd, 'forbidden.txt'), content: 'must not write' }, tool_use_id: 'workflow-write' })
            assert.equal(capture.write.hookSpecificOutput.permissionDecision, 'deny')
            assert.match(capture.write.hookSpecificOutput.permissionDecisionReason, /只读/)
            if (process.platform === 'win32') {
              assert(!tools.some(tool => tool.name === 'stable_exec'))
              assert(!options.tools.includes('Bash'))
              capture.command = await options.canUseTool('Bash', { command: 'printf SHOULD_NOT_RUN' })
              assert.equal(capture.command.behavior, 'deny')
              assert.match(capture.command.message, /只读|禁网/)
            }
          }
          // Exercise the real loopback Messages bridge and parent provider
          // conversion even though no native SDK subprocess is launched.
          const response = await fetch(options.env.ANTHROPIC_BASE_URL + '/v1/messages', {
            method: 'POST', headers: { 'x-api-key': options.env.ANTHROPIC_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ model: options.model, max_tokens: 4000, stream: false, messages: [{ role: 'user', content: first.message.content }], tools: [] }),
          })
          assert.equal(response.status, 200, await response.clone().text())
          const result = await response.json()
          yield { type: 'assistant', uuid: randomUUID(), message: { role: 'assistant', content: result.content } }
          yield { type: 'result', subtype: 'success', result: result.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }
        },
      }
    },
  }
  const cli = { environment: () => ({ SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }), root: () => workspace, login: { pending: false, snapshot: () => ({}) } }
  const context = vm.createContext({
    process, Buffer, randomUUID, path, mkdirSync: fs.mkdirSync, require: mainRequire,
    app: { isPackaged: false }, paths: { userData: root, workspace }, store, modelRegistry, HarnessRunner,
    wendingCli: { forConversation: () => cli }, agentRunners: new Map(), mainWindow: undefined,
    browserSession: {}, featureFlags: { sharedBrowser: true, compatibilityReviewer: true },
    BuiltinTools: class { execute() { throw new Error('Unexpected desktop tool execution') } cancel() {} dispose() {} },
    taskAlerts: new TaskAlerts({ notify: () => {} }), readGlobalInstructions: () => ({ content: '' }),
    publishAgentState: () => {}, agentState: id => ({ messages: store.listMessages(id) }),
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    prepareAgentMessage: async () => ({ attachments: [], messageAttachments: [], selectedReferences: [], extractedAttachments: { installedSkills: [], consumedDraftImages: [] }, selectedData: [], selectedKnowledge: [], selectedSkills: [], selectedScripts: [] }),
    CatchService: require('../desktop/services/catch.cjs').CatchService,
    ...require('../desktop/services/clarification.cjs'), ...require('../desktop/services/clarification-interaction.cjs'),
    ...require('../desktop/services/skill-selection.cjs'), ...require('../desktop/services/skill-invocation.cjs'),
    ...require('../desktop/services/inventory.cjs'), ...require('../desktop/services/prompts.cjs'),
    ...require('../desktop/services/delivery.cjs'), ...require('../desktop/services/stream-transcript.cjs'),
    ...require('../desktop/services/attachments.cjs'), ...require('../desktop/services/model-reasoning.cjs'),
    ...require('../desktop/services/tool-approval.cjs'), ...require('../desktop/services/approval-ledger.cjs'), redactApproval: require('../desktop/services/approval-ledger.cjs').redact,
    ...require('../desktop/services/workflow-graph.cjs'), ...require('../desktop/services/automation.cjs'),
    isWendingCliPrompt: () => false, writeWorkflowOutput, activeWorkflowRun: undefined,
  })
  vm.runInContext([
    sourceBetween('function createHarnessRunner(', '\nfunction cleanFilename('),
    sourceBetween('function cleanFilename(', '\nfunction normalizeTheme('),
    sourceBetween('function requireText(', '\nasync function runStoredScript('),
    sourceBetween('function conversationPaths(', '\nfunction agentState('),
    sourceBetween('function commitAgentMessage(', '\nasync function runAgent('),
    sourceBetween('async function runAgent(', '\nasync function runWorkflow('),
    sourceBetween('async function runWorkflow(', '\nfunction cancelWorkflow('),
  ].join('\n'), context, { filename: mainPath })
  const realFactory = context.createHarnessRunner
  context.createHarnessRunner = id => {
    const runner = realFactory(id)
    assert.equal(runner.constructor.name, 'ClaudeHarnessRunner')
    runner.options.sdk = sdk
    runner.options.fetchImpl = fetchImpl
    const answerApproval = runner.answerApproval.bind(runner)
    runner.answerApproval = (...args) => { approvals.push(args); return answerApproval(...args) }
    // The fixture SDK does not spawn this executable. Keep the real default
    // path check so an incomplete installed runtime also fails this test.
    assert.equal(runner.ready(), true)
    runners.push(runner)
    return runner
  }
  context.conversationLifecycle = new ConversationLifecycle(store, { userData: root, workspace, runtimeAdapter: createClaudeLifecycle({ userData: root }) })
  vm.runInContext(sourceBetween("ipcMain.handle('stable:agent:run'", "ipcMain.handle('stable:agent:steer'"), context, { filename: mainPath })
  t.after(() => {
    for (const runner of runners) runner.cancel()
    store.close()
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
    if (previousHarness === undefined) delete process.env.STABLE_HARNESS
    else process.env.STABLE_HARNESS = previousHarness
  })
  return { root, workspace, store, profile, modelRegistry, captures, upstream, runners, approvals, handlers, context }
}

async function assertTextOnly(capture) {
  const options = capture.options
  assert.deepEqual(options.tools, [])
  assert.deepEqual(options.mcpServers, {})
  assert.equal(options.persistSession, false)
  assert.equal((await options.canUseTool('mcp__stable__stable_exec', { command: 'anything' })).behavior, 'deny')
  assert.equal((await options.canUseTool('Agent', { prompt: 'anything' })).behavior, 'deny')
  assert.equal(capture.closed, true)
}

test('unattended shared task entry receives only the automatic catalog without manual selection', async t => {
  const env = fixture(t)
  const id = env.store.createConversation({ modelId:env.profile.id, permissionMode:'request' })
  const result = await env.context.runAgent('请解释 JavaScript 闭包', id, [], [], {manualSkillInvocation:false}, false, [], env.context.createHarnessRunner())
  assert.equal(result.answer, 'CHAT_VM_OK：本机聊天结果')
  assert.equal(env.captures.length, 1)
  const capture = env.captures[0]
  assert.match(capture.first.message.content[0].text, /允许自动调用的 Skills/)
  assert.match(capture.options.systemPrompt.prompt, /auto-fixture/)
  assert.doesNotMatch(capture.first.message.content[0].text, /AUTO_ENTRYPOINT_BODY/)
})

test('real chat IPC preflight and task use default Claude SDK and existing local provider without Cloud', async t => {
  const env = fixture(t)
  const id = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
  const result = await env.handlers.get('stable:agent:run')(null, { conversationId: id, clientRequestId: 'vm-chat', prompt: '请解释 JavaScript 闭包并给一个简短示例' })
  assert.equal(result.answer, 'CHAT_VM_OK：本机聊天结果')
  assert.equal(env.captures.length, 2)
  await assertTextOnly(env.captures[0])
  const execution = env.captures[1].options
  assert(execution.tools.includes('Read')); assert(execution.tools.includes('Agent')); assert(!execution.tools.includes('PowerShell'))
  assert.equal(execution.mcpServers.stable.name, 'stable')
  assert.equal(execution.persistSession, true)
  assert.equal(execution.resume, undefined)
  assert.equal(env.upstream.length, 2)
  assert.equal(env.upstream[0].tools, undefined)
  assert.equal(env.modelRegistry.cloudGateway, undefined)
  assert.equal(env.modelRegistry.resolve(env.profile.id).model.providerId, 'local-fixture')
  assert.equal(env.store.listMessages(id).at(-1).content, result.answer)
  assert.equal(env.store.db.prepare('SELECT state FROM message_deliveries WHERE id=?').get('vm-chat').state, 'completed')
  assert.equal(env.context.agentRunners.size, 0)
  assert.equal(env.runners.every(runner => !runner.busy && !runner.approvals.size), true)
})

test('real workflow AI retains read-only tools, rejects unattended command approval, and output node writes the result', { timeout: 10000 }, async t => {
  const env = fixture(t)
  const id = env.store.saveWorkflow({ name: 'Claude VM fixture', nodes: [
    { id: 'ai', type: 'ai', title: '计算', instruction: '返回本机验证标识' },
    { id: 'output', type: 'output', title: '输出', outputFormat: 'markdown' },
  ], edges: [{ id: 'ai-output', source: 'ai', target: 'output' }] })
  const result = await env.context.runWorkflow(id)
  assert.equal(result.output, 'WORKFLOW_VM_OK：本机计算结果')
  assert.equal(env.captures.length, 1)
  const capture = env.captures[0]
  assert(capture.options.tools.includes('Read')); assert(capture.options.tools.includes('Agent'))
  assert.equal(capture.options.persistSession, false)
  assert.equal(capture.options.mcpServers.stable.name, 'stable')
  assert.equal(capture.closed, true)
  assert.match(capture.read, /WORKFLOW_READ_OK/)
  assert.equal(capture.write.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(fs.existsSync(path.join(env.workspace, 'forbidden.txt')), false)
  if (process.platform === 'win32') {
    assert.equal(capture.command.behavior, 'deny')
    assert.equal(env.approvals.length, 0)
  }
  assert.equal(env.upstream.length, 1)
  assert.equal(env.upstream[0].tools, undefined)
  assert.equal(env.modelRegistry.cloudGateway, undefined)
  assert.equal(result.artifacts.length, 1)
  assert.equal(path.dirname(result.artifacts[0].path), path.join(env.workspace, 'outputs'))
  assert.equal(fs.readFileSync(result.artifacts[0].path, 'utf8'), result.output)
  assert.equal(env.store.workflow(id).last_status, 'completed')
  assert.equal(env.context.activeWorkflowRun, undefined)
  assert.equal(env.runners.every(runner => !runner.busy && !runner.approvals.size), true)
})
