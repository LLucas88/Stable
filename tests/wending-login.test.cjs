'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { WendingLoginBridge, registerWendingLoginIpc } = require('../desktop/services/wending-login.cjs')
const { WendingCliService } = require('../desktop/services/wending-cli.cjs')
const root = path.join(__dirname, '..')
const vendor = path.join(root, 'vendor', 'wending-cli')
const python = path.join(vendor, 'python', 'python.exe')

function fakeBridge(options = {}) {
  const writes = [], launches = []
  let child
  const bridge = new WendingLoginBridge({
    workspace: root, root: () => vendor, environment: () => ({ PYTHONUTF8: '1' }),
    spawn: (command, args, opts) => {
      launches.push({ command, args, opts })
      child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.stdin = new PassThrough()
      child.stdin.on('data', (chunk) => writes.push(JSON.parse(chunk.toString())))
      child.kill = () => { child.killed = true }
      return child
    }, ...options,
  })
  return { bridge, writes, launches, child: () => child, respond: (value) => child.stdout.write(JSON.stringify(value) + '\n') }
}

test('real bundled Python runs offline login sequence and privacy regression suite', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync(python, ['-B', '-X', 'utf8', path.join(__dirname, 'fixtures/wending-login-flow.py')], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30_000 })
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''))
  assert.match(result.stderr, /Ran 15 tests/)
})

test('real stdin worker checks an empty isolated workspace without reading user login or contacting API', { skip: process.platform !== 'win32' }, () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'stable-login-empty-'))
  try {
    const result = spawnSync(python, ['-B', '-X', 'utf8', '-u', path.join(vendor, 'stable-login.py')], {
      cwd: workspace, input: JSON.stringify({ operation: 'check', payload: {} }) + '\n', windowsHide: true, encoding: 'utf8', timeout: 15_000,
    })
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.equal(JSON.parse(result.stdout).phase, 'signed_out')
  } finally { rmSync(workspace, { recursive: true, force: true }) }
})

test('bridge puts secrets only in stdin, returns allowlisted fields and prevents duplicate requests', async (t) => {
  const env = fakeBridge()
  t.after(() => env.bridge.dispose())
  const request = env.bridge.request('send', { mobile: '13800000000', channel: '0', unexpected: 'ignored' })
  assert.equal((await env.bridge.request('send', { mobile: '13800000000', channel: '0' })).error.code, 'BUSY')
  const launch = env.launches[0]
  assert.equal(launch.opts.windowsHide, true)
  assert.deepEqual(launch.opts.stdio, ['pipe', 'pipe', 'pipe'])
  assert.equal(launch.opts.shell, undefined)
  assert.doesNotMatch(JSON.stringify(launch), /13800000000/)
  assert.deepEqual(env.writes, [{ operation: 'send', payload: { mobile: '13800000000', channel: '0' } }])
  env.respond({ phase: 'code_sent', channel: '0', detail: '已发码', mobileHint: '138****0000', wnToken: 'must-not-leak', accounts: [{ id: 'a'.repeat(24), label: '测试账号', thirdToken: 'must-not-leak' }] })
  const result = await request
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|13800000000|thirdToken|wnToken/)
  assert.deepEqual(result.accounts, [{ id: 'a'.repeat(24), label: '测试账号' }])
  assert.equal(result.retryAfter, 60)
  env.bridge.dispose()
  assert.equal((await env.bridge.request('send', { mobile: '13800000000', channel: '0' })).error.code, 'SMS_COOLDOWN')
  assert.equal(env.launches.length, 1)
})

test('malformed input cannot spawn a shell, select arbitrary IDs or invoke other CLI commands', async () => {
  const env = fakeBridge()
  for (const [operation, payload] of [
    ['send', { mobile: '1;Remove-Item', channel: '0' }], ['send', { mobile: '13800000000', channel: '99' }],
    ['verify', { code: 'abc' }], ['account', { id: '../config.json' }], ['brand', { id: '100' }],
    ['exec', { command: 'anything' }], ['send', null],
  ]) assert.ok((await env.bridge.request(operation, payload)).error)
  assert.equal(env.launches.length, 0)
})

test('timeout discards secret context without logging raw stderr or automatically retrying SMS', async (t) => {
  const env = fakeBridge({ timeoutMs: 10 })
  t.after(() => env.bridge.dispose())
  const pending = env.bridge.request('send', { mobile: '13800000000', channel: '1' })
  env.child().stderr.write('private token=NEVER_LOG_ME mobile=13800000000')
  const result = await pending
  assert.equal(result.error.code, 'TIMEOUT')
  assert.doesNotMatch(JSON.stringify(result), /NEVER_LOG_ME|13800000000/)
  assert.equal(env.child().killed, true)
  assert.equal(env.writes.length, 1)
  assert.equal((await env.bridge.request('send', { mobile: '13800000000', channel: '1' })).error.code, 'SMS_COOLDOWN')
})

test('cancel and worker exit settle pending requests; late responses cannot restore an old session', async (t) => {
  const env = fakeBridge()
  t.after(() => env.bridge.dispose())
  const first = env.bridge.request('check')
  const old = env.child()
  env.bridge.dispose()
  assert.equal((await first).phase, 'unknown')
  old.stdout.write('{"phase":"ready","channel":"0","detail":"stale"}\n')
  assert.equal(env.bridge.snapshot().phase, 'unknown')
  const second = env.bridge.request('check')
  env.child().emit('close', 1)
  assert.equal((await second).error.code, 'CONNECTION_LOST')
  const third = env.bridge.request('check')
  env.child().stdout.write('bad response token=SECRET\n')
  assert.equal((await third).error.code, 'INVALID_RESPONSE')
})

test('idle timeout destroys incomplete sessions and check can restart cleanly', async (t) => {
  const env = fakeBridge({ idleTimeoutMs: 10 })
  t.after(() => env.bridge.dispose())
  const request = env.bridge.request('check')
  env.respond({ phase: 'signed_out', channel: '0', detail: '未登录' })
  await request
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(env.child().killed, true)
  assert.equal(env.bridge.snapshot().phase, 'unknown')
})

test('login IPC accepts only trusted main frame and routes a fixed set of operations', async () => {
  const handlers = new Map(), calls = []
  const cli = { login: { request: (...args) => { calls.push(args); return { phase: 'signed_out' } }, dispose: () => { calls.push(['cancel']); return { phase: 'unknown' } } } }
  registerWendingLoginIpc({ handle: (name, handler) => handlers.set(name, handler) }, { service: () => cli, isTrusted: (event) => event?.trusted === true })
  for (const handler of handlers.values()) assert.throws(() => handler({ trusted: false }, { code: '654321' }), /无权/)
  assert.equal(calls.length, 0)
  await handlers.get('stable:extensions:verifyWendingCode')({ trusted: true }, { code: '654321' })
  assert.deepEqual(calls[0], ['verify', { code: '654321' }])
  await handlers.get('stable:extensions:cancelWendingLogin')({ trusted: true })
  assert.deepEqual(calls[1], ['cancel'])
  const main = readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8')
  assert.match(main, /event\.sender === mainWindow\.webContents && event\.senderFrame === mainWindow\.webContents\.mainFrame/)
})

test('prepare requires both CLI probe and login check; Agent sees only sanitized state and built-in guide', async () => {
  const service = new WendingCliService({ appPath: root, workspace: root, packaged: false })
  let checked = 0
  service.verify = async () => ({ status: 'ready' })
  service.login.request = async () => { checked++; return { phase: 'signed_out', channel: '0', detail: '未登录' } }
  assert.equal((await service.prepare()).login.phase, 'signed_out')
  assert.equal(checked, 1)
  service.verify = async () => ({ status: 'unavailable' })
  await service.prepare()
  assert.equal(checked, 1)
  service.login.state = { phase: 'ready', channel: '0', mobile: '13800000000', code: '654321', token: 'NEVER_EXPOSE_THIS' }
  const prompt = service.agentInstruction()
  assert.match(prompt, /已核验登录与品牌/)
  assert.match(prompt, /不要把.*gen-temp-auth/)
  assert.match(prompt, /120 秒/)
  assert.doesNotMatch(prompt, /13800000000|654321|NEVER_EXPOSE_THIS|157\*\*\*\*0823|打杂陈|虾姐蟹妹/)
})

test('renderer keeps credentials local, exposes labels and has no chat or credential persistence path', () => {
  const panel = readFileSync(path.join(root, 'src/WendingLoginPanel.tsx'), 'utf8')
  assert.match(panel, /确认发送验证码/)
  assert.match(panel, /autoComplete="one-time-code"/)
  assert.match(panel, /role="alert"/)
  assert.match(panel, /htmlFor=/)
  assert.match(panel, /if \(locked\.current\) return/)
  assert.match(panel, /setCode\(''\)/)
  assert.doesNotMatch(panel, /localStorage|sessionStorage|console\.|\.agent\.|setAgentPrefill|setComposer/)
})

test('cancelling while CLI verification runs cannot start a late login probe', async () => {
  const service = new WendingCliService({ appPath: root, workspace: root, packaged: false })
  let finish, probes = 0
  service.verify = () => new Promise((resolve) => { finish = resolve })
  service.login.request = async () => { probes++; return { phase: 'ready' } }
  const pending = service.prepare()
  service.login.dispose()
  finish({ status: 'ready' })
  assert.equal((await pending).login.phase, 'unknown')
  assert.equal(probes, 0)
})
