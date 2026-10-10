'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ClaudeHarnessRunner, claudeEnvironment, sessionDirectory } = require('../desktop/services/claude-harness.cjs')
const { activeSessions } = require('../desktop/services/claude-session.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')

const model = { providerId: 'fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' }
const secret = 'fixture-provider-secret'
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function mockSdk(scenario = async function* () { yield { type: 'result', subtype: 'success', result: 'done' } }) {
  const captures = []
  return {
    captures,
    tool: (name, description, shape, handler) => ({ name, description, shape, handler }),
    createSdkMcpServer: options => options,
    query(parameters) {
      const closed = deferred(), capture = { parameters, closed: false }; captures.push(capture)
      const iterator = parameters.prompt[Symbol.asyncIterator]()
      return {
        async initializationResult() { return { claude_code_version: '2.1.296' } },
        close() { capture.closed = true; closed.resolve() },
        async *[Symbol.asyncIterator]() {
          const first = (await iterator.next()).value; capture.first = first
          yield { type: 'system', subtype: 'init', session_id: parameters.options.resume || parameters.options.sessionId, mcp_servers: Object.keys(parameters.options.mcpServers).map(name => ({ name, status: 'connected' })) }
          yield { type: 'user', uuid: first.uuid }
          yield* scenario({ ...capture, iterator, closed: closed.promise })
        },
      }
    },
  }
}

function fixture(t, sdk = mockSdk(), options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-runner-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const runner = new ClaudeHarnessRunner({ userData: root, workspace, executable: process.execPath, sdk, ...options })
  t.after(() => {
    runner.cancel()
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, workspace, runner, sdk }
}

test('persistent SDK turns resume without repeating initialPrompt and restart after a context-policy change', async t => {
  const { root, workspace, runner, sdk } = fixture(t)
  const session = { key: 'same', cwd: workspace, contextPolicy: 'uploaded-only-v1', initialPrompt: 'full initial context' }
  assert.equal(await runner.run('first', model, secret, 1000, undefined, 'workspace-write', [], session), 'done')
  const first = sdk.captures[0]
  assert.equal(first.first.message.content[0].text, 'full initial context')
  assert.equal(first.parameters.options.resume, undefined)
  assert(first.closed)
  for (const name of ['Agent', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit']) assert(first.parameters.options.tools.includes(name))
  assert(first.parameters.options.agents['stable-worker'].tools.includes('Read'))
  assert.equal(first.parameters.options.agents['stable-worker'].autoCompactWindow, undefined, 'never send a sub-100k window that makes the CLI discard the agent')
  assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDirectory(root, 'same'), 'stable-thread.json'), 'utf8')).cliVersion, '2.1.296')
  assert(!first.parameters.options.agents['stable-worker'].tools.includes('mcp__stable__stable_exec'))
  assert(!first.parameters.options.mcpServers.stable.tools.some(tool => tool.name === 'stable_exec'))
  assert(!first.parameters.options.mcpServers.stable.tools.some(tool => tool.name === 'stable_file'))
  const delegated = await first.parameters.options.canUseTool('Agent', { subagent_type: 'Explore', model: 'outside-model', isolation: 'worktree', mode: 'bypassPermissions', run_in_background: true, prompt: 'inspect' })
  assert.equal(delegated.updatedInput.subagent_type, 'stable-worker')
  assert.equal(delegated.updatedInput.run_in_background, false)
  for (const key of ['model', 'isolation', 'mode']) assert.equal(delegated.updatedInput[key], undefined)
  assert.equal((await first.parameters.options.canUseTool('Bash', { command: 'anything' })).behavior, 'deny')
  assert.equal(first.parameters.options.strictMcpConfig, true)
  assert.equal(first.parameters.options.permissionMode, 'default')
  assert.deepEqual(first.parameters.options.settingSources, [])
  assert.equal(first.parameters.options.env.ANTHROPIC_API_KEY === secret, false)
  assert.equal(first.parameters.options.env.CLAUDE_CONFIG_DIR, path.join(sessionDirectory(root, 'same'), 'home'))
  assert.equal(first.parameters.options.env.ENABLE_TOOL_SEARCH, 'true')
  assert.equal(first.parameters.options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '0')
  assert.equal(first.parameters.options.settings.autoMemoryEnabled, true)
  assert(first.parameters.options.settings.autoMemoryDirectory.startsWith(path.join(root, 'claude', 'project-memory')))
  assert.equal(await runner.run('follow-up', model, secret, 1000, undefined, 'workspace-write', [], session), 'done')
  assert.equal(sdk.captures[1].parameters.options.resume, first.parameters.options.sessionId)
  assert.equal(sdk.captures[1].first.message.content[0].text, 'follow-up')
  await runner.run('new policy', model, secret, 1000, undefined, 'workspace-write', [], { ...session, contextPolicy: 'uploaded-only-v2' })
  assert.equal(sdk.captures[2].parameters.options.resume, undefined)
  assert.notEqual(sdk.captures[2].parameters.options.sessionId, first.parameters.options.sessionId)
  assert.equal(sdk.captures[2].first.message.content[0].text, 'full initial context')
  assert.equal(activeSessions.has(sessionDirectory(root, 'same')), false)
  const local = await createClaudeLifecycle({ userData: root }).read('same')
  assert.equal(local.thread.turns.length, 1)
  assert.equal(local.thread.turns[0].items[0].text, 'done')
})

test('external config requires opt-in and activation approval; revoked config rebuilds resumed context', async t => {
  const { root, workspace, runner, sdk } = fixture(t)
  const file = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const value = { version: 1, mcpServers: { reports: { type: 'http', url: 'https://mcp.invalid/api', tools: ['query'] } } }
  fs.writeFileSync(file, JSON.stringify(value))
  const session = { key: 'extensions', cwd: workspace, networkAccess: true }
  await runner.run('disabled', model, secret, 1000, undefined, 'workspace-write', [], session)
  assert.deepEqual(Object.keys(sdk.captures[0].parameters.options.mcpServers), ['stable'])
  value.enabled = true; fs.writeFileSync(file, JSON.stringify(value))
  await assert.rejects(runner.run('deny activation', model, secret, 1000, event => {
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, false)
  }, 'workspace-write', [], session), /未批准/)
  assert.equal(sdk.captures.length, 1, 'denial prevents SDK from starting or contacting remote MCP')
  let approvals = 0; const events = []
  await runner.run('approve activation', model, secret, 1000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], session)
  assert.equal(approvals, 1)
  assert.equal(sdk.captures[1].parameters.options.resume, undefined)
  assert(sdk.captures[1].parameters.options.mcpServers.reports)
  assert.deepEqual(sdk.captures[1].parameters.options.allowedTools, ['mcp__stable__*'])
  assert(events.some(event => event.id === 'runtime-info' && event.detail.includes('2.1.296')))
  value.enabled = false; fs.writeFileSync(file, JSON.stringify(value))
  await runner.run('revoke', model, secret, 1000, undefined, 'workspace-write', [], session)
  assert.equal(sdk.captures[2].parameters.options.resume, undefined)
  assert.equal(sdk.captures[2].parameters.options.mcpServers.reports, undefined)
  value.enabled = true; fs.writeFileSync(file, JSON.stringify(value))
  await runner.run('read-only', model, secret, 1000, undefined, 'read-only', [], session)
  assert.equal(sdk.captures[3].parameters.options.mcpServers.reports, undefined)
})

test('child compaction is independently lowered within the runtime supported window', async t => {
  const { workspace, runner, sdk } = fixture(t)
  for (const [contextWindow, expected] of [[1_000_000, 640_000], [150_000, 100_000], [10_000_000, 1_000_000]]) {
    await runner.run('inspect compaction settings', { ...model, contextWindow }, secret, 1000, undefined, 'workspace-write', [], { cwd: workspace })
    const options = sdk.captures.at(-1).parameters.options
    assert.equal(options.agents['stable-worker'].autoCompactWindow, expected)
    assert(options.agents['stable-worker'].autoCompactWindow <= options.settings.autoCompactWindow)
  }
})

test('legacy or changed tool policies rebuild SDK context instead of resuming obsolete MCP definitions', async t => {
  const { root, workspace, runner, sdk } = fixture(t)
  const session = { key: 'tool-policy', cwd: workspace, initialPrompt: 'visible Stable history for the new SDK context' }
  await runner.run('first', model, secret, 1000, undefined, 'workspace-write', [], session)
  const pointer = path.join(sessionDirectory(root, session.key), 'stable-thread.json')
  const currentPolicy = JSON.parse(fs.readFileSync(pointer, 'utf8')).toolPolicy
  for (const oldPolicy of [undefined, 'mcp-files-v0', 'native-files-v1', 'native-files-auto-skills-v2']) {
    const previous = JSON.parse(fs.readFileSync(pointer, 'utf8'))
    if (oldPolicy === undefined) delete previous.toolPolicy
    else previous.toolPolicy = oldPolicy
    fs.writeFileSync(pointer, JSON.stringify(previous))
    await runner.run('continue', model, secret, 1000, undefined, 'workspace-write', [], session)
    const capture = sdk.captures.at(-1)
    assert.equal(capture.parameters.options.resume, undefined)
    assert.notEqual(capture.parameters.options.sessionId, previous.threadId)
    assert.equal(capture.first.message.content[0].text, session.initialPrompt)
    assert.equal(JSON.parse(fs.readFileSync(pointer, 'utf8')).toolPolicy, currentPolicy)
  }
})

test('text-only requests use an ephemeral session with no tools or persistent context', async t => {
  let toolFactories = 0
  const { root, workspace, runner, sdk } = fixture(t, mockSdk(), { builtinTools: () => { toolFactories++; return { dispose() {} } } })
  await runner.run('return JSON', model, secret, 1000, undefined, 'read-only', [], { key: 'text', cwd: workspace, textOnly: true })
  const options = sdk.captures[0].parameters.options
  assert.deepEqual(options.tools, [])
  assert.deepEqual(options.mcpServers, {})
  assert.equal(options.persistSession, false)
  assert.equal(options.allowedTools, undefined)
  assert.equal(options.env.ENABLE_TOOL_SEARCH, 'false')
  assert.equal(options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1')
  assert.equal(options.settings.autoMemoryEnabled, false)
  assert.equal(options.settings.autoMemoryDirectory, undefined)
  assert.equal((await options.canUseTool('Bash', {})).behavior, 'deny')
  assert.equal(fs.existsSync(path.join(sessionDirectory(root, 'text'), 'stable-thread.json')), false)
  assert.equal(toolFactories, 0)
})

test('network policy changes rebuild the SDK tool catalog for parent and child sessions', async t => {
  const { workspace, runner, sdk } = fixture(t)
  let previous
  for (const networkAccess of [true, false, true]) {
    await runner.run('inspect tools', model, secret, 1000, undefined, 'workspace-write', [], { key: 'bash-policy', cwd: workspace, networkAccess })
    const options = sdk.captures.at(-1).parameters.options
    assert.equal(options.tools.includes('Bash'), networkAccess)
    assert.equal(options.agents['stable-worker'].tools.includes('Bash'), networkAccess)
    assert(!options.agents['stable-worker'].tools.includes('mcp__stable__stable_exec'))
    assert.equal(options.resume, undefined)
    assert.notEqual(options.sessionId, previous)
    previous = options.sessionId
  }
})

test('skill allowlists combine selected and automatic grants, discard metadata permissions, and revoke on resume', async t => {
  const { root, workspace, runner, sdk } = fixture(t)
  const skills = ['manual', 'auto'].map(name => {
    const folder = path.join(root, name); fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\nallowed-tools: Bash\ncontext: fork\n---\nRead supporting files in this skill directory.\nDynamic: !\`echo host-shell\`\nExcel errors: \`#VALUE!\`.`)
    return { name, path: folder }
  })
  const session = { key: 'skill-grants', cwd: workspace, readableRoots: skills.map(s => s.path), selectedSkills: [skills[0]], automaticSkills: [skills[1]] }
  await runner.run('skills', model, secret, 1000, undefined, 'workspace-write', [], session)
  const first = sdk.captures[0].parameters.options
  assert.equal(first.skills.length, 2); assert(first.tools.includes('Skill')); assert.deepEqual(first.settingSources, [])
  const plugin = first.plugins[0].path
  for (const file of fs.readdirSync(path.join(plugin, 'skills'))) {
    const content = fs.readFileSync(path.join(plugin, 'skills', file, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(content, /allowed-tools:|context: fork/)
    assert.doesNotMatch(content, /!`echo/)
    assert.match(content, /#VALUE!`/)
    assert.match(content, /资源根目录/)
  }
  assert.equal((await first.canUseTool('Skill', { skill: first.skills[0] })).behavior, 'allow')
  assert.equal((await first.canUseTool('Skill', { skill: 'unknown' })).behavior, 'deny')
  await runner.run('grant removed', model, secret, 1000, undefined, 'workspace-write', [], { ...session, selectedSkills: [], automaticSkills: [] })
  const second = sdk.captures[1].parameters.options
  assert.deepEqual(second.skills, []); assert.deepEqual(second.plugins, []); assert(!second.tools.includes('Skill'))
  assert.equal(second.resume, undefined)
})

test('the SDK subprocess receives only its local bridge capability and no inherited service credentials', () => {
  const base = { PATH: 'fixture-path', SystemRoot: 'C:\\Windows', ANTHROPIC_API_KEY: 'external', CLAUDE_CODE_OAUTH_TOKEN: 'oauth', OPENAI_API_KEY: 'openai', AWS_ACCESS_KEY_ID: 'aws', GOOGLE_APPLICATION_CREDENTIALS: 'credentials.json', SESSION_COOKIE: 'cookie', SSH_PRIVATE_KEY: 'private', NODE_OPTIONS: '--inspect', STABLE_API_URL: 'external-stable', no_proxy: 'example.invalid' }
  const environment = claudeEnvironment(base, 'isolated-home', { baseURL: 'http://127.0.0.1:1234', token: 'local-capability', model })
  for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'SESSION_COOKIE', 'SSH_PRIVATE_KEY', 'NODE_OPTIONS', 'STABLE_API_URL']) assert.equal(environment[key], undefined, key)
  assert.equal(environment.PATH, base.PATH)
  assert.equal(environment.SystemRoot, base.SystemRoot)
  assert.equal(environment.ANTHROPIC_API_KEY, 'local-capability')
  assert.equal(environment.ANTHROPIC_BASE_URL, 'http://127.0.0.1:1234')
  assert.match(environment.NO_PROXY, /127\.0\.0\.1/)
  assert.match(environment.NO_PROXY, /example\.invalid/)
  assert.equal(base.ANTHROPIC_API_KEY, 'external')
})

test('an unapproved write stays blocked and cancellation cannot later approve or execute it', async t => {
  const entered = deferred(), handled = deferred()
  const sdk = mockSdk(async function* ({ parameters, closed }) {
    const hook = parameters.options.hooks.PreToolUse.find(item => item.matcher.includes('Write')).hooks[0]
    const operation = hook({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_use_id: 'cancelled-write', tool_input: { file_path: path.join(parameters.options.cwd, 'cancelled.txt'), content: 'must not exist' } })
    const result = await operation; handled.resolve(result)
    await closed
  })
  const { root, workspace, runner } = fixture(t, sdk)
  let approval
  const running = runner.run('write a file', model, secret, 2000, event => { if (event.kind === 'approval' && event.eventType === 'approval/request') { approval = event; entered.resolve() } }, 'workspace-write', [], { key: 'cancel', cwd: workspace })
  const outcome = assert.rejects(running, /任务已停止/)
  await entered.promise
  assert(approval)
  assert.equal(fs.existsSync(path.join(workspace, 'cancelled.txt')), false)
  assert.equal(runner.cancel(), true)
  assert.equal(runner.answerApproval(approval.requestId, true), false)
  await outcome
  assert.equal((await handled.promise).hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(fs.existsSync(path.join(workspace, 'cancelled.txt')), false)
  assert.equal(runner.busy, false)
  assert.equal((await createClaudeLifecycle({ userData: root }).read('cancel')).thread.turns[0].status, 'interrupted')
})

test('steering is acknowledged only by a matching SDK message receipt', async t => {
  const waiting = deferred(), resume = deferred()
  const sdk = mockSdk(async function* ({ iterator }) {
    waiting.resolve()
    const steer = (await iterator.next()).value
    yield { type: 'user', uuid: 'unrelated-receipt' }
    await resume.promise
    yield { type: 'user', uuid: steer.uuid }
    yield { type: 'result', subtype: 'success', result: 'steered answer', user_message_uuid: steer.uuid }
  })
  const { workspace, runner } = fixture(t, sdk)
  const running = runner.run('start', model, secret, 2000, undefined, 'workspace-write', [], { key: 'steer', cwd: workspace })
  await waiting.promise
  let accepted = false
  const steering = runner.steer('change direction').then(result => { accepted = true; return result })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(accepted, false)
  resume.resolve()
  assert.deepEqual(await steering, { accepted: true })
  assert.equal(await running, 'steered answer')
})

test('lost steering receipt is uncertain and a disconnected run cannot turn it into acceptance', async t => {
  const waiting = deferred()
  const sdk = mockSdk(async function* ({ iterator }) {
    waiting.resolve()
    await iterator.next()
    yield { type: 'result', subtype: 'success', result: 'earlier answer' }
  })
  const { workspace, runner } = fixture(t, sdk)
  const running = runner.run('start', model, secret, 2000, undefined, 'workspace-write', [], { key: 'lost-steer', cwd: workspace })
  const failure = assert.rejects(running, /连接提前结束/)
  await waiting.promise
  const steering = assert.rejects(runner.steer('unknown delivery'), error => error.code === 'STEER_UNCERTAIN')
  await Promise.all([failure, steering])
  assert.equal(runner.busy, false)
})

test('a steering acknowledgment does not close the run before the extra prompt receives its result', async t => {
  const waiting = deferred()
  const sdk = mockSdk(async function* ({ iterator, first }) {
    waiting.resolve()
    const extra = (await iterator.next()).value
    yield { type: 'user', uuid: extra.uuid }
    yield { type: 'result', subtype: 'success', result: 'original answer', user_message_uuid: first.uuid }
    yield { type: 'result', subtype: 'success', result: 'extra prompt answer', user_message_uuid: extra.uuid }
  })
  const { workspace, runner } = fixture(t, sdk)
  const running = runner.run('start', model, secret, 2000, undefined, 'workspace-write', [], { key: 'steer-result', cwd: workspace })
  await waiting.promise
  assert.deepEqual(await runner.steer('extra prompt'), { accepted: true })
  assert.equal(await running, 'extra prompt answer')
})

test('a runner refuses linked session homes and pointers before starting the SDK', async t => {
  for (const name of ['home', 'stable-thread.json']) await t.test(name, async subtest => {
    const { root, workspace, runner, sdk } = fixture(subtest)
    const directory = sessionDirectory(root, 'linked-session')
    const outside = path.join(root, 'outside-session')
    fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'preserved.txt'), 'must not change')
    const link = path.join(directory, name)
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(runner.run('start', model, secret, 1000, undefined, 'workspace-write', [], { key: 'linked-session', cwd: workspace }), /不能使用链接|安全的本地文件/)
    assert.equal(sdk.captures.length, 0)
    assert.equal(runner.busy, false)
    assert.equal(activeSessions.has(directory), false)
    assert.equal(fs.readFileSync(path.join(outside, 'preserved.txt'), 'utf8'), 'must not change')
  })
})



test('steering during context statistics collection is not lost when the earlier result arrives', async t => {
  const requested = deferred(), release = deferred()
  const sdk = mockSdk(async function* ({ iterator, first }) {
    yield { type: 'result', subtype: 'success', result: 'original', user_message_uuid: first.uuid }
    const extra = (await iterator.next()).value
    yield { type: 'user', uuid: extra.uuid }
    yield { type: 'result', subtype: 'success', result: 'steered result', user_message_uuid: extra.uuid }
  })
  const query = sdk.query
  sdk.query = parameters => {
    const result = query(parameters)
    result.getContextUsage = async () => { requested.resolve(); await release.promise; return { totalTokens: 100, categories: [] } }
    return result
  }
  const { runner, workspace } = fixture(t, sdk)
  const running = runner.run('start', model, secret, 5000, undefined, 'workspace-write', [], { key: 'usage-steer', cwd: workspace })
  await requested.promise
  const receipt = runner.steer('extra while collecting usage')
  release.resolve()
  assert.deepEqual(await receipt, { accepted: true })
  assert.equal(await running, 'steered result')
})
