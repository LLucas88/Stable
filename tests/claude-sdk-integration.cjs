'use strict'

// Explicit native smoke suite: real SDK + packaged Claude binary, a loopback
// Messages bridge, and an in-memory Chat Completions provider. No real key or
// external inference is used. Run: node --test --test-concurrency=1 tests/claude-sdk-integration.cjs
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ClaudeHarnessRunner, sessionDirectory } = require('../desktop/services/claude-harness.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')

const model = { providerId: 'fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' }
const credential = 'local-native-fixture-key'

test('real SDK external MCP connects only after approval and enforces per-call grants', { timeout: 120_000 }, async t => {
  for (const mode of ['disabled', 'read-only', 'deny-connect', 'allow', 'allow-sse', 'deny-tool', 'cancel-tool']) await t.test(mode, async t => {
    const http = require('node:http'); const remoteCalls = [], remoteRequests = []; let connectedApproved = false, sseResponse
    const server = http.createServer(async (req, res) => {
      remoteRequests.push(req.method)
      if (!connectedApproved) { res.writeHead(403).end(); return }
      if (mode === 'allow-sse' && req.method === 'GET') {
        sseResponse = res
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write('event: endpoint\ndata: /messages\n\n'); return
      }
      if (req.method !== 'POST') { res.writeHead(req.method === 'DELETE' ? 200 : 405).end(); return }
      let raw = ''; for await (const chunk of req) raw += chunk
      const message = JSON.parse(raw)
      if (message.id === undefined) { res.writeHead(202).end(); return }
      let result
      if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      else if (message.method === 'tools/list') result = { tools: ['queryReadAgent', 'erase'].map(name => ({ name, description: 'Local fixture ' + name, inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } })) }
      else if (message.method === 'tools/call') { remoteCalls.push(message.params); result = { content: [{ type: 'text', text: 'EXTERNAL_MCP_OK' }] } }
      else result = {}
      const response = JSON.stringify({ jsonrpc: '2.0', id: message.id, result })
      if (mode === 'allow-sse') { res.writeHead(202).end(); sseResponse.write('event: message\ndata: ' + response + '\n\n') }
      else res.writeHead(200, { 'content-type': 'application/json' }).end(response)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
    let approvals = 0
    const { root, workspace, runner, requests } = fixture(t, (body, number) => {
      if (['disabled', 'read-only'].includes(mode)) {
        assert(!body.tools.some(tool => tool.function.name.startsWith('mcp__reports__')))
        return upstream({ text: 'EXT_DISABLED' })
      }
      if (number === 1) return upstream({ calls: [{ id: 'external-discover', name: 'ToolSearch', input: { query: 'select:mcp__reports__queryReadAgent,mcp__reports__erase', max_results: 2 } }] })
      if (number === 2) return upstream({ calls: [{ id: 'external-denied', name: 'mcp__reports__erase', input: { value: 'never' } }] })
      if (number === 3) {
        assert.match(toolResult(body, 'external-denied'), /白名单/)
        return upstream({ calls: [{ id: 'external-query', name: 'mcp__reports__queryReadAgent', input: { value: 'fixture' } }] })
      }
      if (mode !== 'cancel-tool') assert.match(toolResult(body, 'external-query'), mode.startsWith('allow') ? /EXTERNAL_MCP_OK/ : /未批准/)
      return upstream({ text: 'EXT_FINISHED' })
    })
    const configFile = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
    fs.mkdirSync(path.dirname(configFile), { recursive: true })
    fs.writeFileSync(configFile, JSON.stringify({ version: 1, enabled: mode !== 'disabled', mcpServers: { reports: { type: mode === 'allow-sse' ? 'sse' : 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, tools: ['queryReadAgent'] } } }))
    const events = []
    const run = runner.run('Use the fixture MCP', model, credential, 30_000, event => {
      events.push(event)
      if (event.kind !== 'approval' || event.status !== 'running') return
      approvals++
      if (event.detail.startsWith('external_extensions_activate')) {
        assert.equal(remoteRequests.length, 0, 'no discovery before connection approval')
        connectedApproved = mode !== 'deny-connect'
        runner.answerApproval(event.requestId, connectedApproved)
      } else if (mode === 'cancel-tool') runner.cancel()
      else runner.answerApproval(event.requestId, mode.startsWith('allow'))
    }, mode === 'read-only' ? 'read-only' : 'workspace-write', [], { key: 'external-' + mode, cwd: workspace, networkAccess: true })
    if (mode === 'deny-connect') { await assert.rejects(run, /未批准/); assert.equal(requests.length, 0) }
    else if (mode === 'cancel-tool') await assert.rejects(run, /停止/)
    else assert.equal(await run, ['disabled', 'read-only'].includes(mode) ? 'EXT_DISABLED' : 'EXT_FINISHED')
    assert.equal(remoteCalls.length, mode.startsWith('allow') ? 1 : 0)
    if (mode.startsWith('allow')) {
      assert.equal(remoteCalls[0].name, 'queryReadAgent')
      assert.deepEqual(remoteCalls[0].arguments, { value: 'fixture' })
      assert(events.some(event => event.id === 'runtime-info' && /Claude Code 2\.1\.296/.test(event.detail)))
    }
    assert.equal(approvals, ['disabled', 'read-only'].includes(mode) ? 0 : mode === 'deny-connect' ? 1 : 2)
    if (['disabled', 'read-only', 'deny-connect'].includes(mode)) assert.equal(remoteRequests.length, 0)
  })
})

test('real SDK loads opted-in plugin skills through the sanitized whitelist and retains write approval', { timeout: 45_000 }, async t => {
  let skillName, approvals = 0
  const { root, workspace, runner } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => tool.function.name === 'Bash'))
    if (number === 1) return upstream({ calls: [{ id: 'external-skill', name: 'Skill', input: { skill: skillName } }] })
    if (number === 2) {
      assert.match(JSON.stringify(body.messages), /EXTERNAL_SKILL_BODY/)
      return upstream({ calls: [{ id: 'plugin-write', name: 'Write', input: { file_path: path.join(workspace, 'plugin.txt'), content: 'PLUGIN_OK' } }] })
    }
    return upstream({ text: 'EXTERNAL_PLUGIN_OK' })
  })
  const plugin = path.join(root, 'external-plugin'), skillRoot = path.join(plugin, 'skills', 'report')
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true }); fs.mkdirSync(skillRoot, { recursive: true })
  fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'external-fixture' }))
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: report\ndescription: External fixture\nallowed-tools: Bash\ncontext: fork\n---\nEXTERNAL_SKILL_BODY')
  const configFile = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify({ version: 1, enabled: true, plugins: [{ path: plugin }] }))
  skillName = 'stable-authorized:report-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  assert.equal(await runner.run('Use external report skill', model, credential, 30_000, event => {
    if (event.kind === 'approval' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], { key: 'external-plugin', cwd: workspace }), 'EXTERNAL_PLUGIN_OK')
  assert.equal(approvals, 2, 'activation and native Write need independent Stable approvals')
  assert.equal(fs.readFileSync(path.join(workspace, 'plugin.txt'), 'utf8'), 'PLUGIN_OK')
})

test('native memory writes require approval and are read by a new conversation only in the same project', { timeout: 60_000 }, async t => {
  let index, approvals = 0
  const { root, workspace, runner } = fixture(t, (body, number) => {
    const sent = JSON.stringify(body.messages)
    if (number === 1) return upstream({ calls: [{ id: 'memory-write', name: 'Write', input: { file_path: index, content: 'PROJECT_MEMORY_FIXTURE: Prefer concise Chinese reports.' } }] })
    if (number === 2) { assert(toolResult(body, 'memory-write')); return upstream({ text: 'MEMORY_SAVED' }) }
    if (number === 3) { assert.match(sent, /PROJECT_MEMORY_FIXTURE/); return upstream({ text: 'MEMORY_RECALLED' }) }
    assert.doesNotMatch(sent, /PROJECT_MEMORY_FIXTURE/)
    return upstream({ text: 'MEMORY_ISOLATED' })
  })
  const memory = require('../desktop/services/claude-memory.cjs').prepareClaudeMemory({ userData: root, workspace })
  index = path.join(memory.directory, 'MEMORY.md')
  const approve = event => { if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) } }
  assert.equal(await runner.run('Remember my preference', model, credential, 30_000, approve, 'workspace-write', [], { key: 'memory-first', cwd: workspace }), 'MEMORY_SAVED')
  assert.equal(approvals, 1)
  assert.match(fs.readFileSync(index, 'utf8'), /PROJECT_MEMORY_FIXTURE/)
  assert.equal(await runner.run('What is my preference?', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'memory-second', cwd: workspace }), 'MEMORY_RECALLED')
  const other = path.join(root, 'another-project'); fs.mkdirSync(other)
  assert.equal(await runner.run('Inspect preferences', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'memory-other', cwd: other }), 'MEMORY_ISOLATED')
  assert.equal(await runner.run('Read only', model, credential, 30_000, undefined, 'read-only', [], { key: 'memory-second', cwd: workspace }), 'MEMORY_ISOLATED')
})

test('native ToolSearch discovers a deferred tool before it is called', { timeout: 60_000 }, async t => {
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeTool(body, 'ToolSearch')
      assert(!body.tools.some(tool => tool.function.name === 'mcp__stable__stable_search'))
      return upstream({ calls: [{ id: 'discover-search', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_search', max_results: 1 } }] })
    }
    if (number === 2) {
      nativeTool(body, 'mcp__stable__stable_search')
      assert(toolResult(body, 'discover-search'))
      return upstream({ calls: [{ id: 'use-search', name: 'mcp__stable__stable_search', input: { query: 'fixture question' } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'use-search'), /SEARCH_DISCOVERED_OK/)
      return upstream({ text: 'NATIVE_DISCOVERY_OK' })
    }
    assert.equal(number, 4)
    nativeTool(body, 'mcp__stable__stable_search')
    return upstream({ text: 'NATIVE_DISCOVERY_RESUMED' })
  }, { search: async () => 'SEARCH_DISCOVERED_OK' })
  assert.equal(await runner.run('discover then search', model, credential, 45_000, undefined, 'workspace-write', [], { key: 'discover', cwd: workspace }), 'NATIVE_DISCOVERY_OK')
  assert.equal(await runner.run('continue after discovery', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'discover', cwd: workspace }), 'NATIVE_DISCOVERY_RESUMED')
})

test('native ToolSearch cannot discover a disabled host shell', { timeout: 45_000 }, async t => {
  const { workspace, runner } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => ['Bash', 'PowerShell'].includes(tool.function.name)))
    if (number === 1) return upstream({ calls: [{ id: 'find-host-shell', name: 'ToolSearch', input: { query: 'select:Bash', max_results: 1 } }] })
    assert.equal(number, 2)
    assert(toolResult(body, 'find-host-shell'))
    return upstream({ text: 'HOST_SHELL_NOT_AVAILABLE' })
  })
  assert.equal(await runner.run('inspect the fixture catalog', model, credential, 30_000, undefined, 'workspace-write', [], { cwd: workspace }), 'HOST_SHELL_NOT_AVAILABLE')
})

test('real SDK invokes only authorized native skills and keeps file approval boundaries', { timeout: 60_000 }, async t => {
  let skillName, approved = 0
  const { root, workspace, runner, requests } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => tool.function.name === 'Bash'))
    if (number === 1) {
      nativeTool(body, 'Skill')
      assert(!JSON.stringify(body.messages).includes('UNAUTHORIZED_SKILL_BODY'))
      return upstream({ calls: [{ id: 'denied-skill', name: 'Skill', input: { skill: 'outside:forbidden' } }] })
    }
    if (number === 2) {
      assert.match(String(toolResult(body, 'denied-skill')), /白名单|not|Unknown|available|denied/i)
      return upstream({ calls: [{ id: 'authorized-skill', name: 'Skill', input: { skill: skillName } }] })
    }
    if (number === 3) {
      assert.match(JSON.stringify(body.messages), /AUTHORIZED_SKILL_BODY/)
      return upstream({ calls: [{ id: 'skill-write', name: 'Write', input: { file_path: path.join(workspace, 'skill-result.txt'), content: 'SKILL_OK' } }] })
    }
    assert.equal(number, 4)
    return upstream({ text: 'NATIVE_SKILL_OK' })
  })
  const skillRoot = path.join(root, 'approved-skill'); fs.mkdirSync(skillRoot)
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: fixture-skill\ndescription: Authorized fixture skill\nallowed-tools: Bash\ncontext: fork\n---\nAUTHORIZED_SKILL_BODY\nWrite the requested file using approved tools.')
  const ambient = path.join(workspace, '.claude', 'skills', 'forbidden'); fs.mkdirSync(ambient, { recursive: true })
  fs.writeFileSync(path.join(ambient, 'SKILL.md'), '---\nname: forbidden\ndescription: Unauthorized fixture\n---\nUNAUTHORIZED_SKILL_BODY')
  skillName = 'stable-authorized:fixture-skill-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  const result = await runner.run('Use the approved fixture skill', model, credential, 45_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { approved++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], { key: 'skills', cwd: workspace, readableRoots: [skillRoot], automaticSkills: [{ name: 'fixture-skill', path: skillRoot }] })
  assert.equal(result, 'NATIVE_SKILL_OK'); assert.equal(approved, 1)
  assert.equal(fs.readFileSync(path.join(workspace, 'skill-result.txt'), 'utf8'), 'SKILL_OK')
  assert.equal(requests.length, 4)
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function until(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error('native SDK did not reach the expected state')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
function pendingUpstream(request, release) {
  const encoder = new TextEncoder()
  const content = { choices: [{ index: 0, delta: { content: 'FIRST_REPLY' }, finish_reason: null }] }
  const finish = { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: ' + JSON.stringify(content) + '\n\n'))
      request.signal.addEventListener('abort', () => controller.error(Object.assign(new Error('fixture request cancelled'), { name: 'AbortError' })), { once: true })
      if (release) void release.then(() => { controller.enqueue(encoder.encode('data: ' + JSON.stringify(finish) + '\n\ndata: [DONE]\n\n')); controller.close() })
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}
function upstream({ text, calls, reasoning = 'fixture thinking' }) {
  const delta = { reasoning_content: reasoning, ...(text ? { content: text } : {}), ...(calls ? { tool_calls: calls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) }
  const chunk = { id: 'chat-native-fixture', object: 'chat.completion.chunk', model: model.model, choices: [{ index: 0, delta, finish_reason: calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
  return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
function fixture(t, responder, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-native-claude-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const requests = []
  const runner = new ClaudeHarnessRunner({
    userData: root, workspace,
    ...options,
    fetchImpl: async (url, request) => {
      assert.equal(url, 'https://provider.invalid/v1/chat/completions')
      assert.equal(request.headers.authorization, 'Bearer ' + credential)
      const body = JSON.parse(request.body); requests.push(body)
      assert.equal(body.model, model.model)
      return responder(body, requests.length, request)
    },
  })
  t.after(async () => {
    runner.cancel()
    if (runner.busy) await until(() => !runner.busy)
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  })
  return { root, workspace, runner, requests }
}
const texts = body => body.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).join('\n')
const toolResult = (body, id) => body.messages.findLast(message => message.role === 'tool' && message.tool_call_id === id)?.content
function nativeTool(body, name) {
  const value = body.tools?.find(tool => tool.function.name === name)
  assert(value, 'native tool must be advertised: ' + name)
  return value.function
}
function nativeCatalog(body) {
  for (const name of ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'ToolSearch']) nativeTool(body, name)
  const names = body.tools.map(tool => tool.function.name)
  assert.equal(new Set(names).size, names.length, 'native/MCP tools must not be registered twice')
  assert.equal(names.some(name => /(?:^|__)stable_file$/.test(name)), false, 'native file tools replace stable_file')
  assert.equal(names.some(name => ['Bash', 'PowerShell', 'Shell', 'Execute'].includes(name)), false, 'shell remains behind stable_exec sandbox')
  assert(names.includes('mcp__stable__stable_exec'))
  assert(!names.includes('DeferredToolPlaceholder'))
}

test('real native SDK returns text with no tools in a text-only run', { timeout: 45_000 }, async t => {
  const { workspace, runner, requests } = fixture(t, () => upstream({ text: 'NATIVE_TEXT_OK' }))
  const result = await runner.run('return NATIVE_TEXT_OK', model, credential, 30_000, undefined, 'read-only', [], { textOnly: true, cwd: workspace })
  assert.equal(result, 'NATIVE_TEXT_OK')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].tools, undefined)
  assert.equal(runner.busy, false)
})

test('real native SDK resumes local history without resending initial context', { timeout: 60_000 }, async t => {
  const { root, workspace, runner, requests } = fixture(t, (_body, number) => upstream({ text: 'NATIVE_REPLY_' + number }))
  const home = path.join(sessionDirectory(root, 'native-resume'), 'home')
  const projectConfig = path.join(workspace, '.claude')
  const styles = path.join(projectConfig, 'output-styles')
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(styles, { recursive: true })
  const ambient = ['AMBIENT_PROJECT_CLAUDE_MARKER', 'AMBIENT_PARENT_CLAUDE_MARKER', 'AMBIENT_USER_CLAUDE_MARKER', 'AMBIENT_SETTINGS_STYLE_MARKER', 'AMBIENT_USER_SETTINGS_MARKER', 'AMBIENT_FILE_MENTION_MARKER']
  fs.writeFileSync(path.join(workspace, 'CLAUDE.md'), ambient[0])
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), ambient[1])
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), ambient[2])
  fs.writeFileSync(path.join(styles, 'ambient-isolation.md'), '---\nname: ambient-isolation\ndescription: Fixture style\n---\n' + ambient[3])
  fs.writeFileSync(path.join(projectConfig, 'settings.json'), JSON.stringify({ outputStyle: 'ambient-isolation' }))
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ companyAnnouncements: [ambient[4]], outputStyle: 'ambient-isolation' }))
  fs.writeFileSync(path.join(workspace, 'ambient-material.txt'), ambient[5])
  const session = { key: 'native-resume', cwd: workspace, contextPolicy: 'uploaded-materials-v1', globalInstructions: 'EXPLICIT_STABLE_GLOBAL_INSTRUCTION_MARKER', initialPrompt: 'initial context marker: SEED_ONCE @ambient-material.txt' }
  assert.equal(await runner.run('first user turn', model, credential, 30_000, undefined, 'workspace-write', [], session), 'NATIVE_REPLY_1')
  const thread = JSON.parse(fs.readFileSync(path.join(sessionDirectory(root, session.key), 'stable-thread.json'), 'utf8')).threadId
  assert.equal(await runner.run('follow-up marker: FOLLOW_UP', model, credential, 30_000, undefined, 'workspace-write', [], session), 'NATIVE_REPLY_2')
  assert.equal(requests.length, 2)
  assert.equal((texts(requests[1]).match(/SEED_ONCE/g) || []).length, 1)
  assert.match(texts(requests[1]), /FOLLOW_UP/)
  assert(requests[1].messages.some(message => message.role === 'assistant' && message.content === 'NATIVE_REPLY_1'))
  for (const request of requests) {
    const sent = JSON.stringify(request.messages)
    for (const marker of ambient) assert.equal(sent.includes(marker), false, 'ambient context leaked: ' + marker)
    assert.match(sent, /EXPLICIT_STABLE_GLOBAL_INSTRUCTION_MARKER/)
    assert.match(sent, /@ambient-material\.txt/)
  }
  const read = await createClaudeLifecycle({ userData: root }).read(session.key)
  assert.equal(read.thread.id, thread)
  assert.equal(read.thread.turns.length, 2)
})

test('real SDK native Write requires Stable approval and returns its result to the provider', { timeout: 45_000 }, async t => {
  let approved = 0
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeCatalog(body)
      const tool = nativeTool(body, 'Write')
      assert(tool.parameters.properties.file_path)
      return upstream({ calls: [{ id: 'native-file-call', name: 'Write', input: { file_path: path.join(workspace, 'sdk-written.txt'), content: 'NATIVE_WRITE_OK' } }] })
    }
    assert(body.messages.some(message => message.role === 'tool' && message.tool_call_id === 'native-file-call'))
    return upstream({ text: 'NATIVE_FILE_OK' })
  })
  const output = path.join(workspace, 'sdk-written.txt')
  const result = await runner.run('create sdk-written.txt', model, credential, 30_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') {
      assert.equal(fs.existsSync(output), false)
      assert.match(event.detail, /sdk-written\.txt/)
      assert.equal(runner.answerApproval(event.requestId, true), true); approved++
    }
  }, 'workspace-write', [], { key: 'native-file', cwd: workspace })
  assert.equal(result, 'NATIVE_FILE_OK')
  assert.equal(approved, 1, JSON.stringify(requests.at(-1).messages.filter(message => message.role === 'tool')))
  assert.equal(fs.readFileSync(output, 'utf8'), 'NATIVE_WRITE_OK')
  assert.equal(requests.length, 2)
})

test('a denied real SDK native Write returns an error tool result without creating the file', { timeout: 45_000 }, async t => {
  let denied = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'native-denied-call', name: 'Write', input: { file_path: path.join(workspace, 'denied.txt'), content: 'must not exist' } }] })
    const result = body.messages.find(message => message.role === 'tool' && message.tool_call_id === 'native-denied-call')
    assert.match(result?.content || '', /未批准|未执行|denied|拒绝/i)
    return upstream({ text: 'NATIVE_DENIAL_OK' })
  })
  const result = await runner.run('try a write', model, credential, 30_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { runner.answerApproval(event.requestId, false); denied++ }
  }, 'workspace-write', [], { key: 'native-denied', cwd: workspace })
  assert.equal(result, 'NATIVE_DENIAL_OK')
  assert.equal(denied, 1)
  assert.equal(fs.existsSync(path.join(workspace, 'denied.txt')), false)
})

test('real SDK native Write, Read and Edit preserve provider tool chains and file contents', { timeout: 60_000 }, async t => {
  const approvals = []; const toolEvents = []
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    const file = path.join(workspace, 'native-chain.txt')
    if (number === 1) { nativeCatalog(body); return upstream({ calls: [{ id: 'chain-write', name: 'Write', input: { file_path: file, content: 'NATIVE_CHAIN_BEFORE\n' } }] }) }
    if (number === 2) {
      assert(toolResult(body, 'chain-write'))
      const assistant = body.messages.find(message => message.tool_calls?.some(call => call.id === 'chain-write'))
      assert.equal(assistant?.reasoning_content, 'fixture thinking', 'provider thinking must survive the native tool round trip')
      return upstream({ calls: [{ id: 'chain-read-before', name: 'Read', input: { file_path: file } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'chain-read-before') || '', /NATIVE_CHAIN_BEFORE/)
      return upstream({ calls: [{ id: 'chain-edit', name: 'Edit', input: { file_path: file, old_string: 'NATIVE_CHAIN_BEFORE', new_string: 'NATIVE_CHAIN_AFTER' } }] })
    }
    if (number === 4) { assert(toolResult(body, 'chain-edit')); return upstream({ calls: [{ id: 'chain-read-after', name: 'Read', input: { file_path: file } }] }) }
    assert.equal(number, 5)
    assert.match(toolResult(body, 'chain-read-after') || '', /NATIVE_CHAIN_AFTER/)
    return upstream({ text: 'NATIVE_CHAIN_OK' })
  })
  const result = await runner.run('create, inspect and edit the fixture', model, credential, 45_000, event => {
    if (event.kind === 'tool') toolEvents.push(event)
    if (event.eventType === 'approval/request' && event.status === 'running') { approvals.push(event); assert.equal(runner.answerApproval(event.requestId, true), true) }
  }, 'workspace-write', [], { key: 'native-chain', cwd: workspace })
  assert.equal(result, 'NATIVE_CHAIN_OK')
  assert.equal(fs.readFileSync(path.join(workspace, 'native-chain.txt'), 'utf8'), 'NATIVE_CHAIN_AFTER\n')
  assert.equal(approvals.length, 2, 'Write and Edit require approval; Read does not')
  for (const name of ['Write', 'Read', 'Edit']) assert(toolEvents.some(event => event.title?.includes(name) && event.status === 'completed'), name + ' must publish a completed native tool event')
  assert.equal(requests.length, 5)
})

test('real SDK native Read, Glob and Grep inspect allowed files in read-only mode', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeCatalog(body)
      return upstream({ calls: [
        { id: 'native-read', name: 'Read', input: { file_path: path.join(workspace, 'search-source.txt') } },
        { id: 'native-glob', name: 'Glob', input: { pattern: '**/*.txt', path: workspace } },
        { id: 'native-grep', name: 'Grep', input: { pattern: 'LOCAL_SEARCH_MARKER', path: workspace, output_mode: 'content' } },
      ] })
    }
    assert.match(toolResult(body, 'native-read') || '', /LOCAL_READ_MARKER/)
    assert.match(toolResult(body, 'native-glob') || '', /search-source\.txt/)
    assert.match(toolResult(body, 'native-grep') || '', /LOCAL_SEARCH_MARKER/)
    return upstream({ text: 'NATIVE_READ_SEARCH_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'search-source.txt'), 'LOCAL_READ_MARKER\nLOCAL_SEARCH_MARKER\n')
  const result = await runner.run('inspect fixture source and search matches', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, false) } }, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_READ_SEARCH_OK')
  assert.equal(approvals, 0)
})

test('real SDK native NotebookEdit requires approval and modifies the requested cell', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    const notebook = path.join(workspace, 'fixture.ipynb')
    if (number === 1) return upstream({ calls: [{ id: 'notebook-read', name: 'Read', input: { file_path: notebook } }] })
    if (number === 2) { assert.match(toolResult(body, 'notebook-read') || '', /NOTEBOOK_BEFORE/); return upstream({ calls: [{ id: 'notebook-discover', name: 'ToolSearch', input: { query: 'select:NotebookEdit', max_results: 1 } }] }) }
    if (number === 3) { nativeTool(body, 'NotebookEdit'); return upstream({ calls: [{ id: 'notebook-edit', name: 'NotebookEdit', input: { notebook_path: notebook, cell_id: 'fixture-cell', edit_mode: 'replace', new_source: 'NOTEBOOK_AFTER' } }] }) }
    assert(toolResult(body, 'notebook-edit'))
    assert.doesNotMatch(toolResult(body, 'notebook-edit'), /Tool execution error|denied|拒绝/i)
    return upstream({ text: 'NATIVE_NOTEBOOK_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'fixture.ipynb'), JSON.stringify({ cells: [{ id: 'fixture-cell', cell_type: 'markdown', metadata: {}, source: ['NOTEBOOK_BEFORE'] }], metadata: {}, nbformat: 4, nbformat_minor: 5 }))
  const result = await runner.run('replace the fixture notebook cell', model, credential, 30_000, event => { if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) } }, 'workspace-write', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_NOTEBOOK_OK')
  assert.equal(approvals, 1)
  const source = JSON.parse(fs.readFileSync(path.join(workspace, 'fixture.ipynb'), 'utf8')).cells[0].source
  assert.equal(Array.isArray(source) ? source.join('') : source, 'NOTEBOOK_AFTER')
})

test('real SDK native out-of-scope Read and Write are denied before approval or data exposure', { timeout: 45_000 }, async t => {
  let approvals = 0
  const outsideMarker = 'OUTSIDE_NATIVE_READ_MUST_NOT_LEAK'
  const { root, workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [
      { id: 'outside-read', name: 'Read', input: { file_path: path.join(root, 'outside-secret.txt') } },
      { id: 'outside-write', name: 'Write', input: { file_path: path.join(root, 'outside-created.txt'), content: 'must not exist' } },
    ] })
    for (const id of ['outside-read', 'outside-write']) assert.match(toolResult(body, id) || '', /超出.*允许.*目录|路径.*越界/)
    assert.equal(JSON.stringify(body.messages).includes(outsideMarker), false)
    return upstream({ text: 'NATIVE_BOUNDARY_OK' })
  })
  fs.writeFileSync(path.join(root, 'outside-secret.txt'), outsideMarker)
  const result = await runner.run('exercise explicit forbidden fixture paths', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, true) } }, 'workspace-write', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_BOUNDARY_OK')
  assert.equal(approvals, 0, 'a path outside allowed roots must not become approvable')
  assert.equal(fs.existsSync(path.join(root, 'outside-created.txt')), false)
  assert.equal(fs.readFileSync(path.join(root, 'outside-secret.txt'), 'utf8'), outsideMarker)
})

test('real SDK read-only native Write is rejected even if an approval callback would allow it', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'readonly-write', name: 'Write', input: { file_path: path.join(workspace, 'readonly-created.txt'), content: 'must not exist' } }] })
    assert.match(toolResult(body, 'readonly-write') || '', /只读.*不能写|read.only/i)
    return upstream({ text: 'NATIVE_READONLY_OK' })
  })
  const result = await runner.run('exercise read-only fixture write refusal', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, true) } }, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_READONLY_OK')
  assert.equal(approvals, 0)
  assert.equal(fs.existsSync(path.join(workspace, 'readonly-created.txt')), false)
})

test('real SDK native Glob and Grep reject an external directory junction without leaking file names or contents', { timeout: 45_000 }, async t => {
  const marker = 'JUNCTION_EXTERNAL_CONTENT_MUST_NOT_LEAK'
  const { root, workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [
      { id: 'junction-glob', name: 'Glob', input: { pattern: '**/*.txt', path: path.join(workspace, 'junction') } },
      { id: 'junction-grep', name: 'Grep', input: { pattern: 'JUNCTION_EXTERNAL_CONTENT', path: path.join(workspace, 'junction'), output_mode: 'content' } },
      { id: 'junction-root-glob', name: 'Glob', input: { pattern: '**/*.txt', path: workspace } },
      { id: 'junction-root-grep', name: 'Grep', input: { pattern: 'JUNCTION_EXTERNAL_CONTENT', path: workspace, output_mode: 'content' } },
    ] })
    for (const id of ['junction-glob', 'junction-grep', 'junction-root-glob', 'junction-root-grep']) {
      const result = toolResult(body, id) || ''
      assert.match(result, /超出.*允许.*目录|越界.*链接|不.*允许.*链接/)
      assert.equal(result.includes(marker), false)
      assert.equal(result.includes('private-external.txt'), false)
    }
    return upstream({ text: 'NATIVE_JUNCTION_OK' })
  })
  const external = path.join(root, 'outside'); fs.mkdirSync(external)
  fs.writeFileSync(path.join(external, 'private-external.txt'), marker)
  fs.symlinkSync(external, path.join(workspace, 'junction'), process.platform === 'win32' ? 'junction' : 'dir')
  const result = await runner.run('search only within approved fixture directories', model, credential, 30_000, undefined, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_JUNCTION_OK')
})

test('real SDK provider search keeps the Stable MCP transport alongside native files without duplicate tools', { timeout: 45_000 }, async t => {
  let searches = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) { nativeCatalog(body); return upstream({ calls: [{ id: 'provider-discover', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_search', max_results: 1 } }] }) }
    if (number === 2) { nativeTool(body, 'mcp__stable__stable_search'); return upstream({ calls: [{ id: 'provider-search', name: 'mcp__stable__stable_search', input: { query: 'native fixture query' } }] }) }
    assert.match(toolResult(body, 'provider-search') || '', /https:\/\/source\.example\/fixture/)
    return upstream({ text: 'NATIVE_PROVIDER_SEARCH_OK' })
  }, { search: async (args, signal) => { searches++; assert.equal(args.query, 'native fixture query'); assert.equal(signal.aborted, false); return { sources: [{ url: 'https://source.example/fixture', title: 'Fixture source', snippet: 'Fixture evidence' }] } } })
  const result = await runner.run('search the fixture provider', model, credential, 30_000, undefined, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_PROVIDER_SEARCH_OK'); assert.equal(searches, 1)
})

test('real SDK steering receipt is delivered and the provider processes the extra prompt', { timeout: 45_000 }, async t => {
  const reached = deferred(), release = deferred()
  const { workspace, runner, requests } = fixture(t, (body, number, request) => {
    if (number === 1) { reached.resolve(); return pendingUpstream(request, release.promise) }
    assert.match(texts(body), /NATIVE_STEER_MARKER/)
    return upstream({ text: 'NATIVE_STEER_OK' })
  })
  const running = runner.run('start first task', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'native-steer', cwd: workspace })
  // Attach rejection handling immediately so a startup error remains reported
  // as this test's failure rather than an unhandled rejection.
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  const steering = runner.steer('NATIVE_STEER_MARKER: change the task')
  release.resolve()
  assert.deepEqual(await steering, { accepted: true })
  const outcome = await settled
  if (outcome.error) throw outcome.error
  assert.equal(outcome.value, 'NATIVE_STEER_OK')
  assert.equal(requests.length, 2)
})

test('real SDK cancellation stops a pending provider request and records an interrupted turn', { timeout: 45_000 }, async t => {
  const reached = deferred(); let providerSignal
  const { root, workspace, runner } = fixture(t, (_body, _number, request) => {
    providerSignal = request.signal; reached.resolve()
    return pendingUpstream(request)
  })
  const running = runner.run('wait for provider', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'native-cancel', cwd: workspace })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  assert.equal(runner.cancel(), true)
  const outcome = await settled
  assert.match(outcome.error?.message || '', /任务已停止/)
  assert.equal(providerSignal.aborted, true)
  assert.equal(runner.busy, false)
  const local = await createClaudeLifecycle({ userData: root }).read('native-cancel')
  assert.equal(local.thread.turns[0].status, 'interrupted')
})

test('cancellation before the provider returns any token still preserves the accepted local turn', { timeout: 45_000 }, async t => {
  const reached = deferred(); let providerSignal; let deltas = 0
  const { root, workspace, runner } = fixture(t, (_body, _number, request) => {
    providerSignal = request.signal
    reached.resolve()
    return new Promise((_resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('fixture cancelled before response'), { name: 'AbortError' }))
      if (request.signal.aborted) abort()
      else request.signal.addEventListener('abort', abort, { once: true })
    })
  })
  const running = runner.run('wait before first token', model, credential, 30_000, event => {
    if (event.eventType === 'agent/answer-delta') deltas++
  }, 'workspace-write', [], { key: 'native-no-token', cwd: workspace })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  assert.equal(runner.cancel(), true)
  const outcome = await settled
  assert.match(outcome.error?.message || '', /任务已停止/)
  assert.equal(providerSignal.aborted, true)
  assert.equal(deltas, 0)
  const local = await createClaudeLifecycle({ userData: root }).read('native-no-token')
  assert.equal(local.thread.turns.length, 1)
  assert.equal(local.thread.turns[0].status, 'interrupted')
  assert.equal(local.thread.turns[0].items[0].text, '')
})

test('real SDK Agent delegation inherits bounded native file tools and keeps child inference on the chosen provider', { timeout: 60_000 }, async t => {
  let childRequests = 0; let childResult; let approvals = 0; let skillName
  const { root, workspace, runner, requests } = fixture(t, (body, number) => {
    const users = body.messages.filter(message => message.role === 'user')
    if (users.some(message => JSON.stringify(message.content).includes('NATIVE_CHILD_MARKER'))) {
      childRequests++
      nativeCatalog(body)
      assert(!body.tools?.some(tool => ['Bash', 'PowerShell', 'Agent'].includes(tool.function.name)))
      nativeTool(body, 'Skill')
      if (!toolResult(body, 'native-child-skill')) return upstream({ calls: [{ id: 'native-child-skill', name: 'Skill', input: { skill: skillName } }] })
      assert.match(JSON.stringify(body.messages), /CHILD_AUTHORIZED_SKILL/)
      if (!toolResult(body, 'native-child-read')) return upstream({ calls: [{ id: 'native-child-read', name: 'Read', input: { file_path: path.join(workspace, 'child-source.txt') } }] })
      assert.match(toolResult(body, 'native-child-read'), /NATIVE_CHILD_SOURCE/)
      if (!toolResult(body, 'native-child-outside-write')) return upstream({ calls: [{ id: 'native-child-outside-write', name: 'Write', input: { file_path: path.join(root, 'outside-child.txt'), content: 'must not exist' } }] })
      assert.match(toolResult(body, 'native-child-outside-write'), /超出.*允许.*目录|路径.*越界/)
      assert.equal(fs.existsSync(path.join(root, 'outside-child.txt')), false)
      return upstream({ text: 'NATIVE_CHILD_OK' })
    }
    if (number === 1) {
      const agent = body.tools?.find(tool => tool.function.name === 'Agent')
      assert(agent, 'the bounded native Agent tool must remain enabled')
      return upstream({ calls: [{ id: 'native-agent-call', name: agent.function.name, input: { description: 'Inspect fixture', prompt: 'NATIVE_CHILD_MARKER: read child-source.txt and return NATIVE_CHILD_OK.', subagent_type: 'Explore', model: 'haiku', run_in_background: true, isolation: 'worktree' } }] })
    }
    childResult = body.messages.findLast(message => message.role === 'tool' && message.tool_call_id === 'native-agent-call')?.content
    assert.match(childResult || '', /NATIVE_CHILD_OK/)
    return upstream({ text: 'NATIVE_PARENT_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'child-source.txt'), 'NATIVE_CHILD_SOURCE')
  const skillRoot = path.join(root, 'child-skill'); fs.mkdirSync(skillRoot)
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: child-skill\ndescription: Child inspection skill\n---\nCHILD_AUTHORIZED_SKILL')
  skillName = 'stable-authorized:child-skill-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  const result = await runner.run('delegate a fixture inspection', { ...model, contextWindow: 1_000_000 }, credential, 45_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, false) }
  }, 'workspace-write', [], { key: 'native-agent', cwd: workspace, readableRoots: [skillRoot], automaticSkills: [{ name: 'child-skill', path: skillRoot }] })
  assert.equal(result, 'NATIVE_PARENT_OK')
  assert.equal(childRequests, 4)
  assert.equal(approvals, 0, 'a child Agent must not escalate an out-of-scope path through approval')
  assert.equal(fs.existsSync(path.join(root, 'outside-child.txt')), false)
  assert(requests.length >= 5)
})
