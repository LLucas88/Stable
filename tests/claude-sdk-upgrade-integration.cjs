'use strict'

// Real SDK/CLI with a loopback bridge and a scripted, local provider. No live
// model, user database, installed application profile or external API is used.
// node --test --test-concurrency=1 tests/claude-sdk-upgrade-integration.cjs
// Required migration prerequisite: STABLE_LEGACY_SDK_DIR points at a preserved
// 0.3.308 SDK package, platform package, and pre-upgrade claude-harness.cjs.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { pathToFileURL } = require('node:url')
const { ClaudeHarnessRunner, SDK_VERSION, sessionDirectory } = require('../desktop/services/claude-harness.cjs')

const model = { providerId: 'fixture', model: 'sdk-upgrade-fixture', baseURL: 'https://provider.invalid/v1' }
const credential = 'local-sdk-upgrade-fixture-key'
const legacyDirectory = path.resolve(process.env.STABLE_LEGACY_SDK_DIR || path.join(__dirname, '../.qa-sdk-upgrade-legacy-runtime'))
const legacyEntry = path.join(legacyDirectory, 'claude-agent-sdk', 'sdk.mjs')
const legacyBinary = path.join(legacyDirectory, `claude-agent-sdk-${process.platform}-${process.arch}`, process.platform === 'win32' ? 'claude.exe' : 'claude')
const legacyHarness = path.join(legacyDirectory, 'claude-harness.cjs')
const legacyAvailable = [legacyEntry, legacyBinary, legacyHarness].every(file => fs.existsSync(file))

for (const samePolicy of [false, true]) test(`0.3.308 to 0.3.318 with ${samePolicy ? 'matching' : 'changed'} tool policy and a second process restart`, {
  timeout: 120_000,
}, async t => {
  assert.ok(legacyAvailable, 'The upgrade gate requires the preserved 0.3.308 SDK, native CLI and harness. Set STABLE_LEGACY_SDK_DIR; a missing migration fixture must not silently pass.')
  assert.equal(SDK_VERSION, '0.3.318')
  const legacyMetadata = JSON.parse(fs.readFileSync(path.join(legacyDirectory, 'claude-agent-sdk', 'package.json'), 'utf8'))
  assert.equal(legacyMetadata.version, '0.3.308')
  // Compile the preserved harness with its original module location so local
  // service imports resolve normally; never rewrite the source checkout.
  const harnessFilename = path.resolve(__dirname, '../desktop/services/claude-harness.cjs')
  const oldModule = new Module(harnessFilename, module)
  oldModule.filename = harnessFilename
  oldModule.paths = Module._nodeModulePaths(path.dirname(harnessFilename))
  let legacySource = fs.readFileSync(legacyHarness, 'utf8')
  if (samePolicy) {
    // Isolate native SDK transcript compatibility from Stable's deliberate policy reset.
    const declaration = /^const TOOL_POLICY = '[^']+'/m
    const current = fs.readFileSync(harnessFilename, 'utf8').match(declaration)
    assert.ok(current && declaration.test(legacySource))
    legacySource = legacySource.replace(declaration, current[0])
  }
  oldModule._compile(legacySource, harnessFilename)
  assert.equal(oldModule.exports.SDK_VERSION, '0.3.308')
  const oldSdk = await import(pathToFileURL(legacyEntry).href)
  const { root, workspace, createRunner, requests } = fixture(t, (body, number) => {
    const history = JSON.stringify(body.messages)
    if (number === 1) {
      assert.match(history, /LEGACY_USER_MARKER/)
      return upstream({ text: 'LEGACY_ASSISTANT_MARKER: 已保存旧版会话。' })
    }
    if (samePolicy) {
      assert.match(history, /LEGACY_USER_MARKER/)
      assert.match(history, /LEGACY_ASSISTANT_MARKER/)
    } else {
      assert.doesNotMatch(history, /LEGACY_USER_MARKER|LEGACY_ASSISTANT_MARKER/)
    }
    if (number === 2) return upstream({ text: 'UPGRADED_ASSISTANT_MARKER: 新版已恢复原会话。' })
    assert.equal(number, 3)
    assert.match(history, /UPGRADED_ASSISTANT_MARKER/)
    return upstream({ text: 'RESTARTED_UPGRADE_OK' })
  })
  const session = { key: 'native-0308-to-0318', cwd: workspace }
  const oldRunner = createRunner(oldModule.exports.ClaudeHarnessRunner, { sdk: oldSdk, executable: legacyBinary })
  assert.match(await oldRunner.run('LEGACY_USER_MARKER: 记住这条旧版记录。', model, credential, 40_000, undefined, 'workspace-write', [], session), /LEGACY_ASSISTANT_MARKER/)
  const pointer = path.join(sessionDirectory(root, session.key), 'stable-thread.json')
  const oldSaved = JSON.parse(fs.readFileSync(pointer, 'utf8'))
  assert.equal(oldSaved.version, '0.3.308')
  assert.equal(oldSaved.cliVersion, '2.1.308')
  const oldTranscript = findTranscript(oldSaved.home, oldSaved.threadId)
  const beforeTranscript = fs.readFileSync(oldTranscript, 'utf8')
  assert.match(beforeTranscript, /LEGACY_ASSISTANT_MARKER/)

  const newRunner = createRunner()
  assert.match(await newRunner.run('继续原会话。', model, credential, 40_000, undefined, 'workspace-write', [], session), /UPGRADED_ASSISTANT_MARKER/)
  const upgraded = JSON.parse(fs.readFileSync(pointer, 'utf8'))
  assert.equal(upgraded.threadId === oldSaved.threadId, samePolicy)
  assert.equal(upgraded.version, '0.3.318')
  assert.equal(upgraded.cliVersion, '2.1.318')
  assert.match(fs.readFileSync(oldTranscript, 'utf8'), /LEGACY_ASSISTANT_MARKER/)

  const restarted = createRunner()
  assert.equal(await restarted.run('再次启动后继续。', model, credential, 40_000, undefined, 'workspace-write', [], session), 'RESTARTED_UPGRADE_OK')
  assert.equal(restarted.threadId, upgraded.threadId)
  assert.equal(requests.length, 3)
  const journal = fs.readFileSync(path.join(sessionDirectory(root, session.key), 'stable-turns.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.equal(journal.length, 3)
  assert(journal.every(turn => turn.status === 'completed'))
  assert.deepEqual(journal.map(turn => turn.threadId), [oldSaved.threadId, upgraded.threadId, upgraded.threadId])
})

test('0.3.318 repeated Read returns contents and observes the next on-disk edit', { timeout: 60_000 }, async t => {
  let filename
  const { workspace, createRunner, requests } = fixture(t, (body, number) => {
    assert.equal(SDK_VERSION, '0.3.318')
    if (number === 1) return upstream({ calls: [{ id: 'read-first', name: 'Read', input: { file_path: filename } }] })
    if (number === 2) {
      assert.match(toolResult(body, 'read-first'), /原始报告 REPEATED_READ_CONTENT/)
      return upstream({ calls: [{ id: 'read-second', name: 'Read', input: { file_path: filename } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'read-second'), /原始报告 REPEATED_READ_CONTENT/)
      assert.doesNotMatch(toolResult(body, 'read-second'), /file unchanged/i)
      fs.writeFileSync(filename, '更新报告 UPDATED_READ_CONTENT\n', 'utf8')
      return upstream({ calls: [{ id: 'read-after-change', name: 'Read', input: { file_path: filename } }] })
    }
    assert.equal(number, 4)
    assert.match(toolResult(body, 'read-after-change'), /更新报告 UPDATED_READ_CONTENT/)
    assert.doesNotMatch(toolResult(body, 'read-after-change'), /REPEATED_READ_CONTENT/)
    return upstream({ text: 'REPEATED_READ_OK' })
  })
  filename = path.join(workspace, '重复读取报告.txt')
  fs.writeFileSync(filename, '原始报告 REPEATED_READ_CONTENT\n', 'utf8')
  const runner = createRunner()
  assert.equal(await runner.run('依次检查报告内容。', model, credential, 45_000, undefined, 'workspace-write', [], { cwd: workspace }), 'REPEATED_READ_OK')
  assert.equal(requests.length, 4)
})

test('0.3.318 a throwing permission hook blocks the native write and reports the failure', { timeout: 60_000 }, async t => {
  const realSdk = await import('@anthropic-ai/claude-agent-sdk')
  let filename, injected = false
  const events = []
  const { workspace, createRunner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'blocked-write', name: 'Write', input: { file_path: filename, content: 'MUST_NOT_BE_WRITTEN' } }] })
    assert.equal(number, 2)
    assert.equal(fs.existsSync(filename), false, 'a broken approval hook must never permit the native Write')
    const diagnostic = [toolResult(body, 'blocked-write'), ...events.map(event => [event.title, event.detail].join(' '))].join('\n')
    assert.match(diagnostic, /SDK_UPGRADE_HOOK_FAILURE|hook[^\n]*(?:fail|error|block)/i)
    return upstream({ text: 'HOOK_FAILURE_BLOCKED_OK' })
  })
  filename = path.join(workspace, 'must-not-exist.txt')
  const sdk = { ...realSdk, query(parameters) {
    const entries = parameters.options.hooks.PreToolUse
    const entry = entries.find(hook => hook.matcher?.includes('Write'))
    assert(entry, 'Stable must install its native file permission hook')
    assert.equal(entry.onFailure, 'block', 'the fail-closed policy must come from production configuration')
    entry.hooks = entry.hooks.map(callback => async (...args) => {
      if (args[0].tool_name === 'Write') { injected = true; throw Error('SDK_UPGRADE_HOOK_FAILURE') }
      return callback(...args)
    })
    return realSdk.query(parameters)
  } }
  const runner = createRunner(ClaudeHarnessRunner, { sdk })
  const capture = event => {
    events.push(event)
    // A later permission prompt cannot be the reason the write was prevented.
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }
  assert.equal(await runner.run('尝试写入验证文件。', model, credential, 45_000, capture, 'workspace-write', [], { cwd: workspace }), 'HOOK_FAILURE_BLOCKED_OK')
  assert.equal(injected, true)
  assert.equal(fs.existsSync(filename), false)
})

test('0.3.318 native Glob, Grep and Read handle a nested Chinese path longer than 260 characters', { timeout: 60_000 }, async t => {
  let filename, directory
  const { workspace, createRunner } = fixture(t, (body, number) => {
    assert.equal(SDK_VERSION, '0.3.318')
    if (number === 1) return upstream({ calls: [{ id: 'long-glob', name: 'Glob', input: { path: directory, pattern: '*.txt' } }] })
    if (number === 2) {
      assert.match(toolResult(body, 'long-glob'), /经营分析报告\.txt/)
      return upstream({ calls: [{ id: 'long-grep', name: 'Grep', input: { path: directory, pattern: 'LONG_PATH_CONTENT', output_mode: 'content' } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'long-grep'), /LONG_PATH_CONTENT/)
      return upstream({ calls: [{ id: 'long-read', name: 'Read', input: { file_path: filename } }] })
    }
    assert.equal(number, 4)
    assert.match(toolResult(body, 'long-read'), /中文数据 LONG_PATH_CONTENT/)
    return upstream({ text: 'CHINESE_LONG_PATH_OK' })
  })
  directory = workspace
  while (path.join(directory, '经营分析报告.txt').length <= 270) directory = path.join(directory, '月度经营分析与报告数据')
  fs.mkdirSync(directory, { recursive: true })
  filename = path.join(directory, '经营分析报告.txt')
  fs.writeFileSync(filename, '中文数据 LONG_PATH_CONTENT\n', 'utf8')
  const runner = createRunner()
  assert.equal(await runner.run('检查中文长路径文件。', model, credential, 45_000, undefined, 'workspace-write', [], { cwd: workspace }), 'CHINESE_LONG_PATH_OK')
  console.log('SDK_UPGRADE_LONG_PATH_VERIFIED', JSON.stringify({ characters: filename.length, tools: ['Glob', 'Grep', 'Read'] }))
})

function findTranscript(home, threadId) {
  for (const file of fs.readdirSync(home, { recursive: true })) {
    if (path.basename(file) === `${threadId}.jsonl`) return path.join(home, file)
  }
  throw new Error('The legacy CLI did not persist its native transcript')
}

function upstream({ text, calls, finish }) {
  const delta = { ...(text ? { content: text } : {}), ...(calls ? { tool_calls: calls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) }
  const chunk = { id: 'local-upgrade-fixture', object: 'chat.completion.chunk', model: model.model, choices: [{ index: 0, delta, finish_reason: finish || (calls ? 'tool_calls' : 'stop') }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
  return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}

const toolResult = (body, id) => body.messages.findLast(message => message.role === 'tool' && message.tool_call_id === id)?.content

function fixture(t, responder) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-sdk-upgrade-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const requests = [], runners = []
  function createRunner(Runner = ClaudeHarnessRunner, options = {}) {
    const runner = new Runner({
      userData: root, workspace, ...options,
      fetchImpl: async (url, request) => {
        assert.equal(url, model.baseURL + '/chat/completions', 'fixture must not contact an external service')
        assert.equal(request.headers.authorization, 'Bearer ' + credential)
        const body = JSON.parse(request.body)
        assert.equal(body.model, model.model)
        requests.push(body)
        return responder(body, requests.length)
      },
    })
    runners.push(runner)
    return runner
  }
  t.after(async () => {
    for (const runner of runners) runner.cancel()
    const deadline = Date.now() + 15_000
    while (runners.some(runner => runner.busy) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    assert(runners.every(runner => !runner.busy), 'all native runtimes must settle before fixture cleanup')
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return { root, workspace, requests, createRunner }
}


test('real SDK output-limit continuation preserves the full final answer', { timeout: 60000 }, async t => {
  const first = '## 一、分析\n完整的前半段内容。\n\n**⑥ '
  const last = '**⑥ 供给侧缺口。**\n\n## 四、行动规划\n最终行动。'
  const { workspace, requests, createRunner } = fixture(t, (_body, number) => {
    assert(number <= 2, 'continuation must not loop')
    return upstream({ text: number === 1 ? first : last, finish: number === 1 ? 'length' : 'stop' })
  })
  const runner = createRunner()
  const result = await runner.run('给出完整报告。', model, credential, 45000, undefined, 'read-only', [], { cwd: workspace })
  assert.equal(requests.length, 2)
  assert.equal(result, first.slice(0, -4) + last)
})


test('real SDK output-limit continuation survives native tool lookup with accurate source markers', {timeout:60000},async t=>{
 let filename
 const {workspace,requests,createRunner}=fixture(t,(body,n)=>{
  assert(n<=3)
  if(n===1)return upstream({text:'报告前文\n**⑥ ',finish:'length'})
  if(n===2)return upstream({text:'我再核对数据。',calls:[{id:'lookup',name:'Read',input:{file_path:filename}}]})
  assert.match(toolResult(body,'lookup'),/fixture supplement/)
  return upstream({text:'**⑥ 后文与行动计划。'})
 })
 filename=path.join(workspace,'supplement.txt');fs.writeFileSync(filename,'fixture supplement')
 const events=[]
 const answer=await createRunner().run('完成报告',model,credential,45000,e=>events.push(e),'read-only',[],{cwd:workspace})
 assert.equal(requests.length,3)
 assert.equal(answer,'报告前文\n**⑥ 后文与行动计划。')
 const sources=events.filter(e=>e.finalAnswerPart)
 assert.equal(sources.length,2)
 assert(!sources.some(e=>e.content.includes('我再核对')))
 for(const source of sources)assert(events.some(e=>e.eventType==='agent/answer-delta'&&e.id===source.id))
 const {buildTraceTimeline}=require('../src/trace-timeline.ts')
 assert.equal(buildTraceTimeline(sources,answer).length,0)
})
