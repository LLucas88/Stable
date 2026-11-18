'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { drainSdkMessages, sdkDiagnostic, startupFailure } = require('../desktop/services/claude-sdk-completion.cjs')
const { ClaudeHarnessRunner, sessionDirectory } = require('../desktop/services/claude-harness.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')

const model = { providerId: 'fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' }
const success = { type: 'result', subtype: 'success', result: 'Report complete.' }
const lost = { type: 'system', subtype: 'session_writes_lost', error_code: 'ENOSPC', lost: ['transcript'], uuid: 'lost' }

function fixture(t, scenario, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-sdk-completion-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const captures = [], events = []
  const sdk = {
    tool: (name, description, shape, handler) => ({ name, description, shape, handler }),
    createSdkMcpServer: options => options,
    query(parameters) {
      let close; const closed = new Promise(resolve => { close = resolve })
      const capture = { parameters, closed, input: parameters.prompt[Symbol.asyncIterator](), closeCalled: false }; captures.push(capture)
      return {
        async initializationResult() { return { claude_code_version: '2.1.318' } },
        close() { capture.closeCalled = true; close() },
        async *[Symbol.asyncIterator]() {
          capture.first = (await capture.input.next()).value
          yield { type: 'system', subtype: 'init', session_id: parameters.options.resume || parameters.options.sessionId,
            mcp_servers: Object.keys(parameters.options.mcpServers).map(name => ({ name, status: 'connected' })) }
          yield { type: 'user', uuid: capture.first.uuid }
          yield* scenario(capture, captures.length)
        },
      }
    },
  }
  const runner = new ClaudeHarnessRunner({ userData: root, workspace, executable: process.execPath, sdk, sdkDrainTimeoutMs: 60, ...extra })
  const run = (session = {}) => runner.run('new question', model, 'fixture-secret', 2000, event => events.push(event), 'workspace-write', [], { cwd: workspace, ...session })
  t.after(() => { runner.cancel(); assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, runner, sdk, captures, events, run }
}

test('final result drains until EOF, retaining a delayed disk-full warning and the answer', async t => {
  const x = fixture(t, async function* (capture) {
    yield success
    assert.equal((await capture.input.next()).done, true, 'input must close gracefully before waiting for exit')
    await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(capture.closeCalled, false, 'query.close must not discard the final warning')
    yield lost
  })
  const answer = await x.run({ key: 'persist', initialPrompt: 'Original history and new question' })
  assert.match(answer, /Report complete\./); assert.match(answer, /磁盘空间不足/)
  assert.equal(x.runner.lastOutcome.status, 'completed')
  assert.equal(x.runner.lastOutcome.persistence, 'failed')
  const directory = sessionDirectory(x.root, 'persist')
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'stable-thread.json'))).persistence, 'failed')
  const history = await createClaudeLifecycle({ userData: x.root }).read('persist')
  assert.match(history.thread.turns.at(-1).items[0].text, /Report complete/)
  assert.equal(x.captures[0].closeCalled, true)
})

test('a transcript marked lost rebuilds from supplied local history without deleting prior journal', async t => {
  const x = fixture(t, async function* (_capture, run) { yield success; if (run === 1) yield lost })
  await x.run({ key: 'same', initialPrompt: 'First user message' })
  const oldId = x.captures[0].parameters.options.sessionId
  await x.run({ key: 'same', initialPrompt: 'LOCAL HISTORY: First user message; Report complete. NEW: next question' })
  assert.equal(x.captures[1].parameters.options.resume, undefined)
  assert.notEqual(x.captures[1].parameters.options.sessionId, oldId)
  assert.match(x.captures[1].first.message.content[0].text, /LOCAL HISTORY:.*Report complete/)
  const journal = fs.readFileSync(path.join(sessionDirectory(x.root, 'same'), 'stable-turns.jsonl'), 'utf8')
  assert.equal(journal.trim().split('\n').length, 2)
  assert(journal.includes(oldId))
})

test('rebuilding a lost transcript without local history fails before starting another runtime', async t => {
  const x = fixture(t, async function* () { yield success; yield lost })
  await x.run({ key: 'same', initialPrompt: 'Local history' })
  await assert.rejects(x.run({ key: 'same' }), /需要提供 Stable 本地对话历史/)
  assert.equal(x.captures.length, 1)
})

test('a full disk after SDK transcript loss leaves a prewritten pending pointer and cannot resume stale history', async t => {
  let failPointerWrite = false
  const writeFileSync = fs.writeFileSync
  const x = fixture(t, async function* (_capture, run) {
    yield success
    if (run === 1) { failPointerWrite = true; yield lost }
  })
  fs.writeFileSync = function (file, ...args) {
    if (failPointerWrite && path.basename(String(file)).startsWith('stable-thread.json.')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    return writeFileSync.call(this, file, ...args)
  }
  try {
    const answer = await x.run({ key: 'disk-full', initialPrompt: 'Initial history' })
    assert.match(answer, /Report complete\.[\s\S]*本地运行记录未能完整保存/)
    const pointer = path.join(sessionDirectory(x.root, 'disk-full'), 'stable-thread.json')
    assert.equal(JSON.parse(fs.readFileSync(pointer)).persistence, 'pending')
    const oldId = x.captures[0].parameters.options.sessionId
    failPointerWrite = false
    await x.run({ key: 'disk-full', initialPrompt: 'RECOVERED_HISTORY Report complete. Next question' })
    assert.equal(x.captures[1].parameters.options.resume, undefined)
    assert.notEqual(x.captures[1].parameters.options.sessionId, oldId)
    assert.match(x.captures[1].first.message.content[0].text, /RECOVERED_HISTORY/)
  } finally { fs.writeFileSync = writeFileSync }
})

test('cancellation after session_writes_lost cannot bypass persistence isolation', async t => {
  const x = fixture(t, async function* (_capture, run) {
    yield success
    if (run === 1) { yield lost; x.runner.cancel() }
  })
  await assert.rejects(x.run({ key: 'tail-cancel', initialPrompt: 'Original history' }), /停止|取消/)
  const pointer = path.join(sessionDirectory(x.root, 'tail-cancel'), 'stable-thread.json')
  assert.equal(JSON.parse(fs.readFileSync(pointer)).persistence, 'pending')
  await x.run({ key: 'tail-cancel', initialPrompt: 'LOCAL_HISTORY_AFTER_CANCEL' })
  assert.equal(x.captures[1].parameters.options.resume, undefined)
  assert.match(x.captures[1].first.message.content[0].text, /LOCAL_HISTORY_AFTER_CANCEL/)
})

test('failure to prewrite pending prevents SDK startup and preserves the previous clean pointer', async t => {
  const x = fixture(t, async function* () { yield success })
  await x.run({ key: 'preflight', initialPrompt: 'Original history' })
  const pointer = path.join(sessionDirectory(x.root, 'preflight'), 'stable-thread.json')
  const original = fs.readFileSync(pointer, 'utf8'), writeFileSync = fs.writeFileSync
  fs.writeFileSync = function (file, ...args) {
    if (path.basename(String(file)).startsWith('stable-thread.json.')) throw Object.assign(new Error('preflight disk full'), { code: 'ENOSPC' })
    return writeFileSync.call(this, file, ...args)
  }
  try {
    await assert.rejects(x.run({ key: 'preflight', initialPrompt: 'Original history and next message' }), /preflight disk full/)
    assert.equal(x.captures.length, 1, 'query must not be created if durable intent cannot be recorded')
    assert.equal(fs.readFileSync(pointer, 'utf8'), original)
  } finally { fs.writeFileSync = writeFileSync }
})

test('journal failure after a successful result keeps pending recovery and returns the valid answer', async t => {
  const x = fixture(t, async function* () { yield success })
  const appendFileSync = fs.appendFileSync
  fs.appendFileSync = function (file, ...args) {
    if (path.basename(String(file)) === 'stable-turns.jsonl') throw Object.assign(new Error('journal disk full'), { code: 'ENOSPC' })
    return appendFileSync.call(this, file, ...args)
  }
  try {
    assert.match(await x.run({ key: 'journal-full', initialPrompt: 'History' }), /Report complete\.[\s\S]*本地运行记录未能完整保存/)
    assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDirectory(x.root, 'journal-full'), 'stable-thread.json'))).persistence, 'unconfirmed')
    assert.equal(x.runner.lastOutcome.persistence, 'unconfirmed')
  } finally { fs.appendFileSync = appendFileSync }
})

test('global configuration loss warns without invalidating an intact transcript', async t => {
  const x = fixture(t, async function* () { yield success; yield { ...lost, lost: ['global_config'], error_code: 'EDQUOT' } })
  const answer = await x.run({ key: 'config', initialPrompt: 'hello' })
  assert.match(answer, /配额已用尽.*运行时配置/s)
  assert.equal(x.runner.lastOutcome.persistence, undefined)
  assert.equal(JSON.parse(fs.readFileSync(path.join(sessionDirectory(x.root, 'config'), 'stable-thread.json'))).persistence, undefined)
})

test('an output stream that never ends is bounded and cannot be reported as a saved transcript', async t => {
  const x = fixture(t, async function* (capture) { yield success; await capture.closed }, { sdkDrainTimeoutMs: 20 })
  const started = performance.now()
  const answer = await x.run({ key: 'hang', initialPrompt: 'history' })
  assert(performance.now() - started < 1500)
  assert.match(answer, /无法确认 SDK 会话已完整保存/)
  assert.equal(x.runner.lastOutcome.persistence, 'unconfirmed')
  assert.equal(x.runner.busy, false)
  assert.equal(x.captures[0].closeCalled, true)
})

test('post-result transport rejection preserves generated content and marks persistence uncertain', async t => {
  const x = fixture(t, async function* () { yield success; throw Error('pipe failed') })
  assert.match(await x.run({ key: 'pipe', initialPrompt: 'history' }), /Report complete\.[\s\S]*无法确认/)
  assert.equal(x.runner.lastOutcome.persistence, 'unconfirmed')
})

test('informational warning stays visible without failing a successful task or altering its answer', async t => {
  const x = fixture(t, async function* () {
    yield { type: 'system', subtype: 'informational', level: 'warning', content: 'A nonfatal SDK warning', uuid: 'warning' }
    yield success
  })
  assert.equal(await x.run(), success.result)
  assert.equal(x.runner.lastOutcome.status, 'completed')
  assert.equal(x.events.find(event => event.id === 'warning').title, '运行时提醒')
  assert.equal(x.events.find(event => event.id === 'warning').status, 'completed')
})

test('startup failure reasons identify configuration and required-sandbox fixes without retrying', async t => {
  for (const reason of ['config_file_invalid', 'sandbox_required_unavailable', 'initialize_not_first']) {
    const x = fixture(t, async function* () { yield { type: 'result', subtype: 'error_during_execution', is_error: true, startup_failure_reason: reason, errors: ['specific file detail'] } })
    await assert.rejects(x.run(), error => error.code === 'CLAUDE_STARTUP_FAILURE' && error.startupFailureReason === reason && error.message.includes('specific file detail'))
    assert.equal(x.captures.length, 1)
    assert.equal(x.captures[0].parameters.options.env.CLAUDE_CODE_STARTUP_FAILURE_RESULTS, '1')
  }
})

test('startup diagnostics survive initialization rejection before the message loop begins', async t => {
  const x = fixture(t, async function* () { throw Error('must not reach the model') })
  const query = x.sdk.query
  x.sdk.query = parameters => {
    const result = query(parameters)
    result.initializationResult = async () => { throw Object.assign(new Error('Invalid fixture settings'), { startupFailureReason: 'config_file_invalid' }) }
    return result
  }
  await assert.rejects(x.run(), error => error.code === 'CLAUDE_STARTUP_FAILURE' && /有效 JSON.*\nInvalid fixture settings/s.test(error.message))
  assert.equal(x.captures[0].closeCalled, true)
})

test('all authorization PreToolUse callbacks fail closed while Stop retains its own contract', async t => {
  const x = fixture(t, async function* () { yield success })
  await x.run()
  const hooks = x.captures[0].parameters.options.hooks
  assert(hooks.PreToolUse.length >= 6)
  assert(hooks.PreToolUse.every(hook => hook.onFailure === 'block'))
  assert(hooks.Stop.every(hook => hook.onFailure === undefined))
})

test('drain deadlines are absolute even when an infinite stream keeps producing events', async () => {
  let count = 0
  const result = await drainSdkMessages({ next: async () => ({ done: false, value: { type: 'keep_alive' } }) }, () => { count++ }, { timeoutMs: 15 })
  assert.equal(result.state, 'timeout'); assert(count > 0)
})

test('drain observes late rejection after timeout and cancellation wakes a stalled stream', async () => {
  let reject
  const pending = new Promise((_resolve, rejectPromise) => { reject = rejectPromise })
  const result = await drainSdkMessages({ next: () => pending }, () => {}, { timeoutMs: 5 })
  assert.equal(result.state, 'timeout'); reject(Error('late pipe error'))
  await new Promise(resolve => setImmediate(resolve))
  const controller = new AbortController()
  const draining = drainSdkMessages({ next: () => new Promise(() => {}) }, () => {}, { timeoutMs: 1000, signal: controller.signal })
  controller.abort()
  assert.equal((await draining).state, 'aborted')
})

test('unknown diagnostics and future startup reasons remain safe and understandable', () => {
  assert.equal(sdkDiagnostic({ type: 'system', subtype: 'future' }), null)
  assert.match(startupFailure('future_reason', 'original detail').message, /future_reason.*\noriginal detail/)
  assert.equal(startupFailure(undefined), null)
})
