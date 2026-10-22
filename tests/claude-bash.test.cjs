'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createNativeToolGuard } = require('../desktop/services/claude-native-tools.cjs')
const { claudeEnvironment } = require('../desktop/services/claude-harness.cjs')

function fixture(t, options = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-bash-guard-'))
  t.after(() => { assert.equal(path.dirname(workspace), fs.realpathSync(os.tmpdir())); fs.rmSync(workspace, { recursive: true, force: true }) })
  const approvals = [], events = []
  const guard = createNativeToolGuard({ workspace, networkAccess: true, requestApproval: async request => { approvals.push(request); return true }, onToolEvent: event => events.push(event), ...options })
  return { workspace, approvals, events, guard, pre: (input, id = 'bash-1') => guard.preToolUse({ tool_name: 'Bash', tool_input: input, tool_use_id: id, cwd: workspace }) }
}
const decision = value => value.hookSpecificOutput.permissionDecision

test('native timeout precedes the run watchdog and partial output can guide the next model step', async t => {
  const { BASH_TIMEOUT_MS } = require('../desktop/services/claude-native-tools.cjs')
  const { RunProgress, TOOL_WATCHDOG_MS } = require('../desktop/services/run-progress.cjs')
  const x = fixture(t), pre = await x.pre({ command: 'long job', timeout: 600000 })
  assert.equal(pre.hookSpecificOutput.updatedInput.timeout, BASH_TIMEOUT_MS)
  assert.equal(x.approvals[0].args.timeout, BASH_TIMEOUT_MS)
  assert.equal((await x.guard.canUseTool('Bash', pre.hookSpecificOutput.updatedInput, { toolUseID: 'bash-1' })).behavior, 'allow')
  assert(TOOL_WATCHDOG_MS - BASH_TIMEOUT_MS >= 60000)
  let now = 0; const progress = new RunProgress({ now: () => now })
  progress.start('bash-1', 'long job'); now = BASH_TIMEOUT_MS + 1000
  assert.equal(progress.check(), null)
  const response = { stdout: 'step one completed', stderr: 'Command timed out', interrupted: true }
  const hook = await x.guard.postToolUse({ tool_use_id: 'bash-1', tool_response: response })
  assert.deepEqual(x.events.at(-1).output, response)
  assert.equal(x.events.at(-1).status, 'failed')
  assert.match(hook.hookSpecificOutput.additionalContext, /拆分/)
  assert.equal(progress.complete('bash-1', { status: 'failed', aggregatedOutput: response.stderr }), null)
  progress.start('bash-2', 'smaller step'); now += 1000; assert.equal(progress.check(), null)
})

test('timeout failure hooks guide recovery but user cancellation does not', async t => {
  const controller = new AbortController(), x = fixture(t, { signal: controller.signal })
  await x.pre({ command: 'slow step', timeout: 1000 })
  const hook = await x.guard.postToolUseFailure({ tool_use_id: 'bash-1', error: 'Command timed out', is_interrupt: true })
  assert.match(hook.hookSpecificOutput.additionalContext, /整轮任务仍可继续/)
  assert.equal(x.events.at(-1).status, 'failed')
  await x.pre({ command: 'next step' }, 'bash-2'); controller.abort()
  assert.deepEqual(await x.guard.postToolUse({ tool_use_id: 'bash-2', tool_response: { interrupted: true } }), {})
  assert.equal(x.events.at(-1).status, 'cancelled')
})

test('native Bash requires exact approval, preserves native arguments and does not execute in the guard', async t => {
  const x = fixture(t)
  const args = { command: "printf '中文' > result.txt", timeout: 1234, description: '写入测试结果' }
  const pre = await x.pre(args)
  assert.equal(decision(pre), 'allow')
  assert.equal(fs.existsSync(path.join(x.workspace, 'result.txt')), false)
  assert.equal(x.approvals[0].name, 'Bash')
  assert.equal(x.approvals[0].command, args.command)
  assert.equal(x.approvals[0].cwd, x.workspace)
  assert.equal(pre.hookSpecificOutput.updatedInput.run_in_background, false)
  assert.equal((await x.guard.canUseTool('Bash', pre.hookSpecificOutput.updatedInput, { toolUseID: 'bash-1' })).behavior, 'allow')
  assert.equal(x.approvals.length, 1)
  assert.equal((await x.guard.canUseTool('Bash', { command: 'different' }, { toolUseID: 'bash-1' })).behavior, 'deny')
})

test('read-only and offline policies hide Bash and deny both hooks and fallback without approval', async t => {
  for (const options of [{ networkAccess: false }, { sandboxMode: 'read-only', networkAccess: true }]) {
    const x = fixture(t, options)
    assert(!x.guard.tools.includes('Bash'))
    assert.equal(decision(await x.pre({ command: 'pwd' })), 'deny')
    assert.equal((await x.guard.canUseTool('Bash', { command: 'pwd' })).behavior, 'deny')
    assert.equal(x.approvals.length, 0)
  }
})

test('Bash rejects unsupported options, background execution and sandbox overrides before approval', async t => {
  const x = fixture(t)
  for (const args of [{ command: '' }, { command: ' ' }, { command: 'pwd', cwd: x.workspace }, { command: 'pwd', timeoutMs: 10 }, { command: 'pwd', timeout: 600001 }, { command: 'pwd', timeout: NaN }, { command: 'pwd', run_in_background: true }, { command: 'pwd', dangerouslyDisableSandbox: true }]) {
    assert.equal(decision(await x.pre(args)), 'deny')
  }
  assert.equal(x.approvals.length, 0)
})

test('denial and cancellation during Bash approval prevent native execution', async t => {
  const denied = fixture(t, { requestApproval: async () => false })
  assert.equal(decision(await denied.pre({ command: 'pwd' })), 'deny')
  const controller = new AbortController()
  const cancelled = fixture(t, { signal: controller.signal, requestApproval: () => new Promise(() => {}) })
  const pending = cancelled.pre({ command: 'pwd' })
  controller.abort()
  assert.equal(decision(await pending), 'deny')
  assert.match(cancelled.events.at(-1).detail, /停止/)
})

test('Bash output, failure and interruption retain command identity for the terminal timeline', async t => {
  const x = fixture(t)
  await x.pre({ command: 'printf 中文' })
  await x.guard.postToolUse({ tool_use_id: 'bash-1', tool_response: { stdout: '中文', stderr: 'notice', interrupted: false } })
  assert.equal(x.events.at(-1).output.stdout, '中文')
  assert.equal(x.events.at(-1).status, 'completed')
  await x.pre({ command: 'exit 7' }, 'bash-2')
  await x.guard.postToolUseFailure({ tool_use_id: 'bash-2', error: 'Exit code 7' })
  assert.equal(x.events.at(-1).status, 'failed')
  await x.pre({ command: 'sleep 10' }, 'bash-3')
  await x.guard.postToolUseFailure({ tool_use_id: 'bash-3', error: 'Stopped', is_interrupt: true })
  assert.equal(x.events.at(-1).status, 'cancelled')
})

test('native Bash retains the existing browser screenshot route', async t => {
  const x = fixture(t, { browserAvailable: true })
  const result = await x.pre({ command: 'chrome.exe --headless --screenshot=shot.png file:///D:/report.html' })
  assert.equal(decision(result), 'deny')
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /stable_browser/)
  assert.equal(x.approvals.length, 0)
})

test('Git Bash configuration survives SDK environment scrubbing without retaining provider secrets', () => {
  const env = claudeEnvironment({ CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Custom Git\\bin\\bash.exe', ANTHROPIC_API_KEY: 'do-not-forward' }, 'home', { baseURL: 'http://localhost', token: 'bridge-only' })
  assert.equal(env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Custom Git\\bin\\bash.exe')
  assert.equal(env.ANTHROPIC_API_KEY, 'bridge-only')
})
