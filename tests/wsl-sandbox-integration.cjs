'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { runWslCommand, linuxPath, commandEnvironment, DISTRO, NODE } = require('../desktop/services/wsl-sandbox.cjs')
const { ClaudeHarnessRunner } = require('../desktop/services/claude-harness.cjs')
// Explicit acceptance command, never silently skipped when WSL is unavailable.
test('real WSL2 sandbox enforces file, network, interop, timeout and cancellation boundaries', { timeout: 300000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-wsl-test-'))
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  const workspace = path.join(root, '中文 task'), outside = path.join(root, 'outside'); fs.mkdirSync(workspace); fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'private.txt'), 'private')
  const run = (command, overrides = {}) => runWslCommand({ command, cwd: workspace, writableRoots: [workspace], readableRoots: [workspace], sandboxMode: 'workspace-write', networkAccess: false, timeoutMs: 10000, ...overrides })
  await t.test('UTF-8 and installed tools', async () => {
    const { output } = await run('set -e; printf "中文🙂\\n"; node --version; python3 --version; git --version; rg --version; jq --version; socat -V; bwrap --version')
    assert.match(output, /中文🙂/); assert.match(output, /v22\.22\.2/); assert.match(output, /Python 3/)
  })
  await t.test('workspace writes and external file denial', async () => {
  await run('printf allowed > result.txt'); assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'allowed')
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'"
  await assert.rejects(run(`cat ${quote(linuxPath(path.join(outside, 'private.txt')))}`))
  await assert.rejects(run(`printf denied > ${quote(linuxPath(path.join(outside, 'blocked.txt')))}`)); assert(!fs.existsSync(path.join(outside, 'blocked.txt')))
  })
  await t.test('cross-call resources use workspace files and expected grep misses do not roll back writes', async () => {
    await run('mkdir -p _work; printf dependency > _work/library.js; printf ephemeral > /tmp/stable-skill-fixture')
    assert.match((await run('cat _work/library.js; test ! -e /tmp/stable-skill-fixture')).output, /dependency/)
    await run('printf report > _work/report.html; if grep -q missing_marker _work/report.html; then exit 2; else code=$?; [ "$code" -eq 1 ] || exit "$code"; fi')
    assert.equal(fs.readFileSync(path.join(workspace, '_work', 'report.html'), 'utf8'), 'report')
    await assert.rejects(run('printf not_committed > _work/blocked.html; grep -q marker nonexistent-file'))
    assert.equal(fs.existsSync(path.join(workspace, '_work', 'blocked.html')), false)
  })
  await t.test('read-only enforcement', async () => {
  await assert.rejects(run('printf denied > blocked.txt', { sandboxMode: 'read-only' })); assert(!fs.existsSync(path.join(workspace, 'blocked.txt')))
  assert.match((await run('cat result.txt', { sandboxMode: 'read-only' })).output, /allowed/)
  })
  await t.test('network and Windows interop denial', async () => {
  await assert.rejects(run('curl --fail --max-time 3 https://example.com'))
  await assert.rejects(run('/mnt/c/Windows/System32/cmd.exe /c echo escape'))
  })
  await t.test('protected rules and runner cannot be changed', async () => {
    fs.mkdirSync(path.join(workspace, '.git'))
    fs.mkdirSync(path.join(workspace, '.claude'))
    fs.writeFileSync(path.join(workspace, '.claude', 'settings.json'), '{}')
    await assert.rejects(run('printf changed > .claude/settings.json'))
    assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'settings.json'), 'utf8'), '{}')
    await assert.rejects(run('cat /opt/stable-agent/runner.cjs'))
    await assert.rejects(run('printf changed > /etc/wsl.conf'))
    await assert.rejects(run('printf changed > .git/config'))
    // A Windows binary copied into an allowed root must also fail.
    fs.copyFileSync(path.join(process.env.SystemRoot, 'System32', 'cmd.exe'), path.join(workspace, 'cmd.exe'))
    await assert.rejects(run('./cmd.exe /c echo escaped', { timeoutMs: 1000 }))
    assert.match((await run('printf sandbox-still-working')).output, /sandbox-still-working/)
  })
  await t.test('timeout and cancellation kill pending writes', async () => {
  await assert.rejects(run('sleep 30', { timeoutMs: 1000 }), /超过 1000 毫秒/)
  const controller = new AbortController(), pending = run('sleep 2; printf escaped > cancelled.txt', { signal: controller.signal })
  setTimeout(() => controller.abort(), 700); await assert.rejects(pending, /任务已停止/)
  await new Promise(resolve => setTimeout(resolve, 2500)); assert(!fs.existsSync(path.join(workspace, 'cancelled.txt')))
  })
  await t.test('background descendants do not survive command completion', async () => {
    await run('(sleep 2; printf escaped > detached.txt) >/dev/null 2>&1 &')
    await new Promise(resolve => setTimeout(resolve, 2500)); assert(!fs.existsSync(path.join(workspace, 'detached.txt')))
  })
  await t.test('Windows case aliases, unsafe names and symlink outputs cannot bypass sync protection', async () => {
    await assert.rejects(run('mkdir -p .CLAUDE; printf changed > .CLAUDE/settings.json'), /protected/)
    assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'settings.json'), 'utf8'), '{}')
    await assert.rejects(run('printf collision > RESULT.TXT'), /Case-colliding/)
    assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'allowed')
    await assert.rejects(run('printf collision > "result.txt."'), /safely sync/)
    await assert.rejects(run('ln -s result.txt output-link'), /symlink changes/)
    assert(!fs.existsSync(path.join(workspace, 'output-link')))
  })
  await t.test('normal nested changes sync but failure and concurrent edits do not overwrite Windows files', async () => {
    await run('mkdir -p nested/child; printf first > nested/child/file.txt')
    assert.equal(fs.readFileSync(path.join(workspace, 'nested/child/file.txt'), 'utf8'), 'first')
    await run('printf second > nested/child/file.txt')
    assert.equal(fs.readFileSync(path.join(workspace, 'nested/child/file.txt'), 'utf8'), 'second')
    await assert.rejects(run('printf failed > result.txt; exit 1'))
    assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'allowed')
    let edited = false
    await assert.rejects(run('printf SYNC_READY; sleep 1; printf command > result.txt; printf other > should-not-sync.txt', { onOutput: (stream, text) => {
      if (stream === 'stdout' && text.includes('SYNC_READY')) { fs.writeFileSync(path.join(workspace, 'result.txt'), 'concurrent'); edited = true }
    } }), /workspace changed/i)
    assert(edited); assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'concurrent')
    assert(!fs.existsSync(path.join(workspace, 'should-not-sync.txt')))
    await run('rm nested/child/file.txt; rmdir nested/child nested')
    assert(!fs.existsSync(path.join(workspace, 'nested')))
  })
  await t.test('network grant allows proxy access while denial and direct access stay blocked', async () => {
    const source = "const s=require('node:http').createServer((q,r)=>r.end('stable-network-ok'));s.listen(0,'127.0.0.1',()=>console.log(s.address().port));process.stdin.resume();process.stdin.on('end',()=>s.close())"
    const server = spawn(path.join(process.env.SystemRoot, 'System32', 'wsl.exe'), ['--distribution', DISTRO, '--user', 'stable', '--exec', NODE, '-e', source], { env: commandEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: server.stdout })
    try {
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Network fixture did not start')), 15000)
        lines.once('line', line => { clearTimeout(timer); /^\d+$/.test(line) ? resolve(Number(line)) : reject(Error('Invalid network fixture port')) })
        server.once('error', error => { clearTimeout(timer); reject(error) })
        server.once('close', () => { clearTimeout(timer); reject(Error('Network fixture exited')) })
      })
      const command = `curl --noproxy '' --fail --max-time 5 http://127.0.0.1:${port}`
      assert.match((await run(command, { networkAccess: true })).output, /stable-network-ok/)
      await assert.rejects(run(command), /403/)
      await assert.rejects(run(command, { sandboxMode: 'read-only', networkAccess: true }), /403/)
      await assert.rejects(run(`curl --noproxy '*' --fail --max-time 2 http://127.0.0.1:${port}`, { networkAccess: true }))
    } finally {
      lines.close(); server.stdin.end()
      const killTimer = setTimeout(() => server.kill(), 5000)
      await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('close', resolve) }); clearTimeout(killTimer)
    }
  })
})

test('real Claude SDK calls the real WSL sandbox after approval and returns output to the model bridge', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-sdk-wsl-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const output = path.join(workspace, 'sdk-wsl.txt')
  let calls = 0, approvals = 0
  const runner = new ClaudeHarnessRunner({
    userData: root, workspace,
    fetchImpl: async (url, request) => {
      assert.equal(url, 'https://provider.invalid/v1/chat/completions')
      const body = JSON.parse(request.body)
      calls++
      let delta
      if (calls === 1) {
        assert(body.tools.some(tool => tool.function.name === 'mcp__stable__stable_exec'))
        delta = { tool_calls: [{ index: 0, id: 'sdk-wsl-command', type: 'function', function: { name: 'mcp__stable__stable_exec', arguments: JSON.stringify({ command: 'printf SDK_WSL_OK > sdk-wsl.txt; cat sdk-wsl.txt', cwd: workspace, timeoutMs: 10000 }) } }] }
      } else {
        assert.equal(calls, 2)
        assert.match(body.messages.find(message => message.role === 'tool' && message.tool_call_id === 'sdk-wsl-command')?.content || '', /SDK_WSL_OK/)
        delta = { content: 'SDK_WSL_ROUNDTRIP_OK' }
      }
      const chunk = { id: 'sdk-wsl-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
      return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    },
  })
  t.after(() => { runner.cancel(); assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) })
  const result = await runner.run('write the sandbox fixture', { providerId: 'fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' }, 'fixture-key', 45000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') {
      assert.equal(fs.existsSync(output), false)
      assert.match(event.detail, /sdk-wsl\.txt/)
      assert.equal(runner.answerApproval(event.requestId, true), true); approvals++
    }
  }, 'workspace-write', [], { key: 'sdk-wsl-fixture', cwd: workspace })
  assert.equal(result, 'SDK_WSL_ROUNDTRIP_OK')
  assert.equal(approvals, 1); assert.equal(calls, 2)
  assert.equal(fs.readFileSync(output, 'utf8'), 'SDK_WSL_OK')
})
