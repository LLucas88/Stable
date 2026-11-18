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

function fixture(t, scenario) {
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
          if (scenario) { yield* scenario({ parameters, first }); return }
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
    messagePredictions: { interrupt() {} }, conversationTitles: undefined, chatgptAccount: undefined,
    process, Buffer, AbortController, randomUUID, path, mkdirSync: fs.mkdirSync, require: mainRequire,
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
    sourceBetween('function scheduleConversationTitle(', '\nconst messagePredictions'),
    sourceBetween('function createHarnessRunner(', '\nfunction cleanFilename('),
    sourceBetween('function cleanFilename(', '\nfunction normalizeTheme('),
    sourceBetween('function requireText(', '\nasync function runStoredScript('),
    sourceBetween('async function runStoredScript(', '\nasync function decideScriptInput('),
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
  vm.runInContext(sourceBetween("ipcMain.handle('stable:agent:cancel'", "ipcMain.handle('stable:agent:answerApproval'"), context, { filename: mainPath })
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

test('real entrypoint records one blocked terminal status and keeps authorized data limits visible through delivery', async t => {
  const basis = '当数据不足时，说明缺失信息，绝不编造数据。'
  for (const functional of [false, true]) await t.test(functional ? 'required interaction remains blocked' : 'authorized data limitation', async t => {
    const env = fixture(t, async function* ({ parameters }) {
      const browser = parameters.options.mcpServers.stable.tools.find(tool => tool.name === 'stable_browser')
      const reviewUpdates = functional
        ? [{ check: '键盘实测', status: 'blocked', note: '尚未验证键盘交互' }]
        : [{ check: '城市范围差额', status: 'limited', category: 'data', limitationBasis: basis, note: '明细不能覆盖总额，已披露不可归因差额。' }]
      const result = await browser.handler({ action: 'review', tabId: 'fixture', reviewUpdates })
      assert(!result.isError, JSON.stringify(result))
      yield { type: 'result', subtype: 'success', result: '分析结果与当前限制。' }
    })
    const id = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
    const result = await env.context.runAgent('文字分析。' + basis, id, [], [], {}, false, [], env.context.createHarnessRunner())
    if (functional) {
      assert.equal(result.status, 'failed')
      assert.equal(result.trace.filter(e => ['任务受阻', '任务仍有未完成项'].includes(e.title)).length, 1)
      assert.match(result.reason, /键盘/)
    } else {
      assert.notEqual(result.status, 'failed'); assert.match(result.answer, /已披露的数据限制/)
      assert.equal(result.trace.findLast(e => e.id === 'complete').title, '已交付，存在数据限制')
      assert.equal(env.store.db.prepare('SELECT status FROM run_logs').get().status, 'completed')
    }
  })
})

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

test('main-process trace retains trailing tool failure after a large snapshot', async t => {
  const error='CONTEXT_BEGIN\n'+'snapshot '.repeat(9000)+'\nTRAILING_TOOL_FAILURE'
  const env=fixture(t,async function*(){
    yield {type:'assistant',message:{role:'assistant',content:[{type:'tool_use',id:'long-failure',name:'Bash',input:{command:'fixture-only'}}]}}
    yield {type:'user',message:{role:'user',content:[{type:'tool_result',tool_use_id:'long-failure',is_error:true,content:error}]}}
    yield {type:'assistant',message:{role:'assistant',content:[{type:'text',text:'检查完成，工具错误已记录。'}]}}
    yield {type:'result',subtype:'success',result:'检查完成，工具错误已记录。'}
  })
  const id=env.store.createConversation({modelId:env.profile.id,permissionMode:'request'})
  const result=await env.context.runAgent('解释这条错误',id,[],[],{},false,[],env.context.createHarnessRunner())
  const event=result.trace.find(e=>e.id==='long-failure')
  assert(event,'tool event must reach main process')
  assert.equal(event.status,'failed');assert(event.detail.endsWith('TRAILING_TOOL_FAILURE'));assert(event.detail.length<=8000)
})

test('user cancellation agrees across conversation and run logs; genuine SDK errors stay failed', async t => {
  for (const cancelled of [true, false]) await t.test(cancelled ? 'user stop' : 'SDK failure', async t => {
    let conversationId
    const env = fixture(t, async function* () {
      if (cancelled) {
        const control = env.context.agentRunners.get(conversationId)
        control.cancelled = true
        control.runner.cancel()
        throw new Error('fixture aborted transport')
      }
      yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['fixture provider failure'] }
    })
    conversationId = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
    await assert.rejects(env.handlers.get('stable:agent:run')(null, { conversationId, clientRequestId: 'terminal-status', prompt: '请解释 JavaScript 闭包' }), cancelled ? /任务已停止/ : /fixture provider failure/)
    assert.equal(env.store.db.prepare('SELECT state FROM message_deliveries WHERE id=?').get('terminal-status').state, cancelled ? 'interrupted' : 'failed')
    const rows = env.store.db.prepare('SELECT status FROM run_logs').all()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, cancelled ? 'cancelled' : 'failed')
  })
})

test('cancelled saved script and workflow never become completed chat runs', async t => {
  for (const type of ['script', 'workflow']) await t.test(type, async t => {
    const env = fixture(t)
    const conversationId = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
    env.context.requestedWorkbenchAction = () => ({ type, item: { id: 'saved-task', name: 'fixture task' } })
    env.context.runStoredScript = async () => ({ cancelled: true })
    env.context.runWorkflow = async () => ({ cancelled: true, output: '' })
    await assert.rejects(env.handlers.get('stable:agent:run')(null, { conversationId, clientRequestId: 'cancel-saved', prompt: '运行 fixture task' }), /取消|停止/)
    assert.equal(env.store.db.prepare('SELECT state FROM message_deliveries WHERE id=?').get('cancel-saved').state, 'interrupted')
    assert.equal(env.store.db.prepare('SELECT status FROM run_logs').get().status, 'cancelled')
    assert(env.captures.every(capture => capture.options.tools.length === 0), 'only preflight may run before the saved action')
  })
})

test('shared runner cancellation retains its typed status without an interactive chat control', async t => {
  const env = fixture(t, async function* () {
    env.runners.at(-1).cancel()
    throw new Error('fixture transport aborted')
  })
  const conversationId = env.store.createConversation({ modelId: env.profile.id })
  await assert.rejects(env.context.runAgent('解释 JavaScript 闭包', conversationId, [], [], {}, false, [], env.context.createHarnessRunner()), error => error.code === 'STABLE_RUN_CANCELLED')
  assert.equal(env.store.db.prepare('SELECT status FROM run_logs').get().status, 'cancelled')
  const { isCancelled } = require('../desktop/services/run-cancellation.cjs')
  assert.equal(isCancelled(new Error('任务已停止。')), false, 'error text is not proof of user cancellation')
})

test('chat stop reaches the saved action and prevents late completion', { timeout: 5000 }, async t => {
  for (const type of ['script', 'workflow']) await t.test(type, async t => {
    let enter, settle, stopped = false
    const entered = new Promise(resolve => { enter = resolve })
    const pending = new Promise(resolve => { settle = resolve })
    const env = fixture(t)
    const conversationId = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
    env.context.requestedWorkbenchAction = () => ({ type, item: { id: 'saved', name: 'fixture' } })
    const action = async options => {
      options?.signal?.addEventListener('abort', () => { stopped = true; settle() }, { once: true })
      enter(); await pending
      return { result: { output: 'late output' }, output: 'late output' }
    }
    env.context.runStoredScript = (_item, _publish, options) => action(options)
    env.context.runWorkflow = (_id, _route, _manual, options) => action(options)
    const running = env.handlers.get('stable:agent:run')(null, { conversationId, clientRequestId: 'stop-saved', prompt: '运行 fixture' })
    const rejected = assert.rejects(running, /取消|停止/)
    await entered
    env.handlers.get('stable:agent:cancel')(null, { conversationId })
    settle()
    await rejected
    assert.equal(stopped, true)
    assert.equal(env.store.db.prepare('SELECT status FROM run_logs').get().status, 'cancelled')
    assert.equal(env.store.db.prepare('SELECT state FROM message_deliveries WHERE id=?').get('stop-saved').state, 'interrupted')
  })
})

test('saved script cancellation settles its owned worker before recording cancellation', async t => {
  const env = fixture(t), controller = new AbortController()
  env.context.isInside = (root, file) => !path.relative(root, file).startsWith('..')
  env.context.libraryRoot = () => env.workspace
  env.context.publishLibraryEvent = () => {}
  let reject, stopped = 0
  const worker = { child: null, run() { this.child = {}; return new Promise((_resolve, fail) => { reject = fail }) }, cancel() { stopped++; this.child = null; reject(require('../desktop/services/run-cancellation.cjs').cancelledError('脚本已停止。')) } }
  const running = env.context.runStoredScript({ id: 'owned-script', kind: 'script', name: 'fixture', path: path.join(env.workspace, 'fixture.cmd') }, () => {}, { confirm: false, signal: controller.signal }, worker)
  const rejected = assert.rejects(running, error => error.code === 'STABLE_RUN_CANCELLED')
  controller.abort(); await rejected
  assert.equal(stopped, 1); assert.equal(worker.child, null)
  assert.equal(env.store.db.prepare('SELECT status FROM run_logs').get().status, 'cancelled')
})

test('chat cancellation reaches real workflow workers and both run logs', { timeout: 5000 }, async t => {
  let enter
  const entered = new Promise(resolve => { enter = resolve })
  const env = fixture(t, async function* ({ parameters }) {
    if (!parameters.options.tools.length) { yield { type: 'result', subtype: 'success', result: '{"status":"ready"}' }; return }
    enter()
    await new Promise(resolve => parameters.options.abortController.signal.addEventListener('abort', resolve, { once: true }))
    throw new Error('workflow transport aborted')
  })
  const conversationId = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
  const workflowId = env.store.saveWorkflow({ name: 'fixture', nodes: [{ id: 'ai', type: 'ai', title: '计算', instruction: '本地验证' }, { id: 'output', type: 'output', title: '输出', outputFormat: 'markdown' }], edges: [{ id: 'link', source: 'ai', target: 'output' }] })
  const workflow = env.store.workflow(workflowId)
  env.context.requestedWorkbenchAction = () => ({ type: 'workflow', item: workflow })
  const running = env.handlers.get('stable:agent:run')(null, { conversationId, clientRequestId: 'stop-real-workflow', prompt: '运行 fixture' })
  const rejected = assert.rejects(running, /工作流已停止/)
  await entered; env.handlers.get('stable:agent:cancel')(null, { conversationId }); await rejected
  assert.equal(env.store.workflow(workflow.id).last_status, 'cancelled')
  const rows = env.store.db.prepare('SELECT status FROM run_logs').all()
  assert.equal(rows.length, 2); assert(rows.every(row => row.status === 'cancelled'))
  assert.equal(env.context.activeWorkflowRun, undefined)
  assert.equal(env.store.db.prepare('SELECT state FROM message_deliveries WHERE id=?').get('stop-real-workflow').state, 'interrupted')
})

test('real simple chat IPC skips redundant preflight and uses the existing local provider without Cloud', async t => {
  const env = fixture(t)
  const id = env.store.createConversation({ modelId: env.profile.id, permissionMode: 'request' })
  const result = await env.handlers.get('stable:agent:run')(null, { conversationId: id, clientRequestId: 'vm-chat', prompt: '请解释 JavaScript 闭包并给一个简短示例' })
  assert.equal(result.answer, 'CHAT_VM_OK：本机聊天结果')
  assert.equal(env.captures.length, 1)
  const execution = env.captures[0].options
  assert(execution.tools.includes('Read')); assert(execution.tools.includes('Agent')); assert(!execution.tools.includes('PowerShell'))
  assert.equal(execution.mcpServers.stable.name, 'stable')
  assert.equal(execution.persistSession, true)
  assert.equal(execution.resume, undefined)
  assert.equal(env.upstream.length, 1)
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
