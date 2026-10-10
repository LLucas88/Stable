'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { loadClaudeExtensions, configurationPath } = require('../desktop/services/claude-extensions.cjs')
const { createExtensionRuntime } = require('../desktop/services/claude-extension-runtime.cjs')

test('external activation and tools bind approvals to config, arguments and network scope', async t => {
  const { root, write } = fixture(t)
  const declaration = { enabled: true, mcpServers: { reports: { type: 'http', url: 'https://mcp.invalid/api?token=private', headers: { Authorization: 'PRIVATE_HEADER' }, tools: ['query'] } } }
  write(declaration)
  const config = loadClaudeExtensions(root, { runtime: true }); const approvals = [], events = []
  let allowed = true; const controller = new AbortController()
  const options = { userData: root, config, networkAccess: true, signal: controller.signal, onToolEvent: e => events.push(e), requestApproval: async request => { approvals.push(request); return allowed } }
  const runtime = createExtensionRuntime(options)
  await runtime.activate()
  assert.equal(approvals.length, 1)
  assert.doesNotMatch(JSON.stringify(approvals), /PRIVATE_HEADER|token=private/)
  const hook = await runtime.preToolUse({ tool_name: 'mcp__reports__query', tool_input: { month: '202610' }, tool_use_id: 'q1' })
  assert.equal(hook.hookSpecificOutput.permissionDecision, 'allow')
  assert.deepEqual(approvals[1].args.input, { month: '202610' })
  assert.equal((await runtime.permission('mcp__reports__delete', {})).behavior, 'deny')
  assert.equal(approvals.length, 2)
  allowed = false
  assert.equal((await runtime.permission('mcp__reports__query', {})).behavior, 'deny')
  allowed = true
  await assert.rejects(createExtensionRuntime({ ...options, networkAccess: false }).activate(), /网络/)
  declaration.mcpServers.reports.headers.Authorization = 'ROTATED_HEADER'; write(declaration)
  const count = approvals.length
  assert.match((await runtime.permission('mcp__reports__query', {})).message, /改变/)
  assert.equal(approvals.length, count)
  controller.abort()
  assert.match((await runtime.permission('mcp__reports__query', {})).message, /停止/)
})

test('configuration changes while awaiting approval invalidate an external call', async t => {
  const { root, write } = fixture(t)
  write({ enabled: true, mcpServers: { reports: { type: 'http', url: 'https://mcp.invalid/api', tools: ['query'] } } })
  const config = loadClaudeExtensions(root, { runtime: true })
  const runtime = createExtensionRuntime({ userData: root, config, networkAccess: true, signal: new AbortController().signal, onToolEvent: () => {}, requestApproval: async () => { write({ enabled: false }); return true } })
  assert.equal((await runtime.permission('mcp__reports__query', {})).behavior, 'deny')
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-extensions-'))
  fs.mkdirSync(path.join(root, 'claude'))
  t.after(() => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, write: value => fs.writeFileSync(configurationPath(root), JSON.stringify({ version: 1, ...value })) }
}

test('external config defaults empty; validation accepts explicit remote servers without connecting', t => {
  const { root, write } = fixture(t)
  assert.deepEqual(loadClaudeExtensions(root).servers, {})
  const config = { mcpServers: { reports: { type: 'http', url: 'https://mcp.invalid/api', headers: { Authorization: 'Bearer fixture' }, tools: ['query'] } } }
  write(config)
  const value = loadClaudeExtensions(root)
  assert.equal(value.servers.reports.url, 'https://mcp.invalid/api')
  assert(value.permits('mcp__reports__query'))
  assert(!value.permits('mcp__reports__delete'))
  const fingerprint = value.fingerprint
  config.mcpServers.reports.tools = []
  write(config)
  assert.notEqual(loadClaudeExtensions(root).fingerprint, fingerprint)
  assert.deepEqual(loadClaudeExtensions(root, { runtime: true }).servers, {})
  write({ ...config, enabled: true })
  assert.equal(loadClaudeExtensions(root, { runtime: true }).servers.reports.url, 'https://mcp.invalid/api')
  assert.deepEqual(loadClaudeExtensions(root, { runtime: true, disabled: true }).servers, {})
})

test('validation rejects unsupported process/config capabilities rather than silently granting them', t => {
  const { root, write } = fixture(t)
  for (const config of [
    { mcpServers: { stable: { type: 'http', url: 'https://mcp.invalid' } } },
    { mcpServers: { external: { type: 'stdio', command: 'powershell.exe' } } },
    { mcpServers: { external: { type: 'http', url: 'http://external.invalid' } } },
    { mcpServers: { external: { type: 'http', url: 'https://user:password@mcp.invalid' } } },
    { mcpServers: { external: { type: 'http', url: 'https://mcp.invalid', tools: ['*'] } } },
    { mcpServers: { external: { type: 'http', url: 'https://mcp.invalid', headers: { X: 'a\r\nb' } } } },
    { allowedTools: ['*'] },
    { enabled: 'true' },
  ]) { write(config); assert.throws(() => loadClaudeExtensions(root)) }
})

test('plugin declarations validate skills and remote MCP while rejecting host hooks', t => {
  const { root, write } = fixture(t)
  const plugin = path.join(root, 'example-plugin')
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'example', version: '1.0.0' }))
  fs.mkdirSync(path.join(plugin, 'skills', 'report'), { recursive: true })
  fs.writeFileSync(path.join(plugin, 'skills', 'report', 'SKILL.md'), '---\nname: report\ndescription: fixture\n---\nFixture skill')
  fs.writeFileSync(path.join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { docs: { type: 'sse', url: 'https://docs.invalid/sse', tools: ['read'] } } }))
  write({ plugins: [{ path: plugin }] })
  const config = loadClaudeExtensions(root)
  assert.equal(config.skills.length, 1)
  assert(config.permits('mcp__plugin-example-docs__read'))
  fs.mkdirSync(path.join(plugin, 'hooks'))
  assert.throws(() => loadClaudeExtensions(root), /hooks/)
})

test('configuration entry creates an empty file, preserves existing values and never loads services', t => {
  const { root, write } = fixture(t)
  const script = path.join(__dirname, '../scripts/configure-claude-extensions.cjs')
  const invoke = command => spawnSync(process.execPath, [script, command, root], { encoding: 'utf8', windowsHide: true })
  let result = invoke('--init')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).runtimeLoading, false)
  assert.deepEqual(JSON.parse(fs.readFileSync(configurationPath(root), 'utf8')), { version: 1, enabled: false, mcpServers: {}, plugins: [] })
  write({ mcpServers: { example: { type: 'http', url: 'https://never-contact.invalid', headers: { Authorization: 'PRIVATE_FIXTURE' }, tools: ['query'] } } })
  const before = fs.readFileSync(configurationPath(root), 'utf8')
  result = invoke('--init')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(configurationPath(root), 'utf8'), before)
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_FIXTURE/)
  assert.equal(invoke('--validate').status, 0)
})
