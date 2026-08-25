'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { ScriptRunner, commandFor, scriptEnvironment } = require('../desktop/services/script-runner.cjs')
const { looksLikeScriptPrompt } = require('../desktop/services/script-interaction.cjs')

test('script commands are allowlisted and do not use a shell wrapper', () => {
  assert.equal(commandFor('C:\\tasks\\collect.py').command, process.env.STABLE_PYTHON || 'python.exe')
  assert.deepEqual(commandFor('C:\\tasks\\clean.ps1').args.slice(0, 2), ['-NoLogo', '-NoProfile'])
  assert.equal(commandFor('C:\\tasks\\run.cmd').command, 'cmd.exe')
  assert.throws(() => commandFor('C:\\tasks\\unsafe.exe'), /只允许执行/)
})

test('script environment removes common credential variables', () => {
  const before = process.env.STABLE_TEST_API_KEY
  process.env.STABLE_TEST_API_KEY = 'do-not-share'
  try { assert.equal(scriptEnvironment().STABLE_TEST_API_KEY, undefined) }
  finally {
    if (before === undefined) delete process.env.STABLE_TEST_API_KEY
    else process.env.STABLE_TEST_API_KEY = before
  }
})

test('runner defaults to a five minute safety timeout', () => {
  const runner = new ScriptRunner({ workspace: 'C:\\Stable' })
  assert.equal(runner.timeoutMs, 5 * 60_000)
})

test('runner streams and returns output from an allowed cmd script', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-'))
  const target = path.join(root, 'pass.cmd')
  writeFileSync(target, '@echo off\r\necho SCRIPT_OK\r\n', 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  try {
    const result = await runner.run({ id: 'script-1', path: target }, (event) => events.push(event))
    assert.match(result.output, /SCRIPT_OK/)
    assert.ok(events.some((event) => event.stream === 'stdout' && event.chunk.includes('SCRIPT_OK')))
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

test('runner releases an exited child lock before starting the next script', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-stale-'))
  const target = path.join(root, 'pass.cmd')
  writeFileSync(target, '@echo off\r\necho RECOVERED\r\n', 'utf8')
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  runner.child = { pid: process.pid, exitCode: 0, signalCode: null }
  runner.itemId = 'stale-script'
  try {
    const result = await runner.run({ id: 'next-script', path: target })
    assert.match(result.output, /RECOVERED/)
    assert.equal(runner.child, null)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('runner finishes after a wrapper exits even when a detached child briefly keeps inherited pipes open', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-detached-'))
  const target = path.join(root, 'detached.cmd')
  writeFileSync(target, '@echo off\r\ncd /d "%WINDIR%"\r\nstart "" /b powershell.exe -NoLogo -NoProfile -Command "Start-Sleep -Milliseconds 1200"\r\nexit /b 0\r\n', 'utf8')
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  const startedAt = Date.now()
  try {
    await runner.run({ id: 'detached-script', path: target })
    assert.ok(Date.now() - startedAt < 900, '主脚本退出后不应继续占用运行锁')
    assert.equal(runner.child, null)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('runner terminates a stuck script when its safety timeout expires', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-timeout-'))
  const target = path.join(root, 'wait.cmd')
  writeFileSync(target, '@echo off\r\nset /p WAIT=WAIT:\r\n', 'utf8')
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 120 })
  try {
    await assert.rejects(runner.run({ id: 'wait-1', path: target }), /已自动停止/)
    assert.equal(runner.child, null)
  } finally {
    runner.cancel()
    await new Promise((resolve) => setTimeout(resolve, 500))
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

test('workflow mode keeps an interactive script alive and emits an idle notice', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-idle-'))
  const target = path.join(root, 'wait.cmd')
  writeFileSync(target, '@echo off\r\nset /p ANSWER=CONTINUE?\r\necho ANSWER=%ANSWER%\r\n', 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 40 })
  try {
    const resultPromise = runner.run({ id: 'idle-1', path: target }, (event) => events.push(event), { timeoutMs: 0, idleNoticeMs: 60 })
    const deadline = Date.now() + 2_000
    while (!events.some((event) => event.status === 'waiting')) {
      if (Date.now() >= deadline) throw new Error('未收到脚本静默提醒。')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await runner.writeInput('idle-1', 'yes')
    const result = await resultPromise
    assert.match(result.output, /ANSWER=yes/)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('console prompt detection can release a packaged script pause automatically', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-pause-'))
  const target = path.join(root, 'pause.cmd')
  writeFileSync(target, '@echo off\r\necho PROCESS_COMPLETE\r\npause\r\n', 'utf8')
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 2_000 })
  let transcript = ''
  let answered = false
  try {
    const result = await runner.run({ id: 'pause-1', path: target }, (event) => {
      if (!['stdout', 'stderr'].includes(event.stream)) return
      transcript += event.chunk
      if (!answered && looksLikeScriptPrompt(transcript)) {
        answered = true
        void runner.writeInput('pause-1', '')
      }
    }, { timeoutMs: 0 })
    assert.equal(answered, true)
    assert.match(result.output, /PROCESS_COMPLETE/)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('runner keeps stdin open for a multi-turn interactive cmd script', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-input-'))
  const target = path.join(root, 'interactive.cmd')
  writeFileSync(target, '@echo off\r\nset /p FIRST=FIRST_PROMPT:\r\necho FIRST=%FIRST%\r\nset /p SECOND=SECOND_PROMPT:\r\necho SECOND=%SECOND%\r\n', 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  const waitFor = async (pattern) => {
    const deadline = Date.now() + 4_000
    while (!events.some((event) => pattern.test(event.chunk))) {
      if (Date.now() >= deadline) throw new Error(`未等到脚本输出：${pattern}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  try {
    const resultPromise = runner.run({ id: 'interactive-1', path: target }, (event) => events.push(event))
    await waitFor(/FIRST_PROMPT/)
    await runner.writeInput('interactive-1', 'alpha')
    await waitFor(/SECOND_PROMPT/)
    await runner.writeInput('interactive-1', 'beta')
    const result = await resultPromise
    assert.match(result.output, /FIRST=alpha/)
    assert.match(result.output, /SECOND=beta/)
    assert.deepEqual(events.filter((event) => event.stream === 'stdin').map((event) => event.chunk.trim()), ['› alpha', '› beta'])
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('PowerShell scripts can read interactive input', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-powershell-'))
  const target = path.join(root, 'interactive.ps1')
  writeFileSync(target, '$answer = Read-Host "PS_PROMPT"\nWrite-Output "PS_ANSWER=$answer"\n', 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  try {
    const resultPromise = runner.run({ id: 'powershell-1', path: target }, (event) => events.push(event))
    const deadline = Date.now() + 4_000
    while (!events.some((event) => event.chunk.includes('PS_PROMPT'))) {
      if (Date.now() >= deadline) throw new Error('未等到 PowerShell 输入提示。')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await runner.writeInput('powershell-1', 'stable')
    const result = await resultPromise
    assert.match(result.output, /PS_ANSWER=stable/)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true })
  }
})

test('interactive input survives a cmd to PowerShell to Node wrapper chain', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-script-wrapper-input-'))
  const start = path.join(root, 'START.cmd')
  const run = path.join(root, 'run.ps1')
  const processor = path.join(root, 'processor.mjs')
  const node = process.execPath.replace(/'/g, "''")
  writeFileSync(start, '@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"\r\nexit /b %ERRORLEVEL%\r\n', 'utf8')
  writeFileSync(run, `& '${node}' (Join-Path $PSScriptRoot 'processor.mjs')\nexit $LASTEXITCODE\n`, 'utf8')
  writeFileSync(processor, "import readline from 'node:readline/promises';\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\nconst answer = await rl.question('请选择序号：');\nrl.close();\nconsole.log(`SELECTED=${answer}`);\n", 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: root, timeoutMs: 10_000 })
  try {
    const resultPromise = runner.run({ id: 'wrapped-interactive-1', path: start }, (event) => events.push(event))
    const deadline = Date.now() + 4_000
    while (!events.some((event) => event.chunk.includes('请选择序号'))) {
      if (Date.now() >= deadline) throw new Error('未等到多级包装脚本的输入提示。')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await runner.writeInput('wrapped-interactive-1', '1')
    const result = await resultPromise
    assert.match(result.output, /SELECTED=1/)
  } finally {
    runner.cancel()
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
