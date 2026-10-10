'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
const sdk = { tool: (name, _description, _shape, handler) => ({ name, handler }), createSdkMcpServer: value => value }
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-tools-'))
  const workspace = path.join(root, 'workspace'), outside = path.join(root, 'outside')
  fs.mkdirSync(workspace); fs.mkdirSync(outside)
  const events = [], requests = []
  const server = createClaudeTools({ sdk, workspace, requestApproval: async request => { requests.push(request); return true }, onToolEvent: event => events.push(event), ...options })
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, workspace, outside, events, requests, server, invoke: (name, args, extra) => server.tools.find(tool => tool.name === name).handler(args, extra) }
}
const textOf = result => result.content.find(item => item.type === 'text')?.text || ''

test('browser screenshot command gives the supported route before spawning or requesting command approval', async t => {
  let commands = 0
  const x = fixture(t, { executeCommand: async () => {commands++; return {code:0}}, builtinTools:{execute:async()=>({}),cancel(){}} })
  const result = await x.invoke('stable_exec', {command:"& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --headless=new --no-sandbox --screenshot=shot.png file:///D:/report.html"})
  assert.equal(result.isError, true)
  assert.match(textOf(result), /截图命令未执行.*stable_browser/)
  assert.equal(commands,0); assert.equal(x.requests.length,0)
  const normal = await x.invoke('stable_exec',{command:'python check.py'})
  assert(!normal.isError); assert.equal(commands,1); assert.equal(x.requests.length,1)
})

test('MCP supplements native tools without duplicate files and retains read-only browser restrictions', async t => {
  const x = fixture(t)
  assert(!x.server.tools.some(tool => tool.name === 'stable_file'))
  assert(x.server.tools.some(tool => tool.name === 'stable_exec'))
  let calls = 0
  const readOnly = fixture(t, { sandboxMode: 'read-only', builtinTools: { execute: async () => { calls++; return {} }, cancel() {} } })
  assert.equal((await readOnly.invoke('stable_browser', { action: 'open', url: 'https://example.com' })).isError, true)
  assert.equal((await readOnly.invoke('stable_skill_install', { path: readOnly.workspace })).isError, true)
  assert.equal(calls, 0)
  assert.equal(readOnly.requests.length, 0)
})

test('builtin approval and image content are routed through the parent implementation', async t => {
  let execute
  const x = fixture(t, { builtinTools: { execute: async request => { execute = request; return { tabId: 'test', image: 'data:image/png;base64,YQ==' } }, cancel() {} } })
  const result = await x.invoke('stable_browser', { action: 'open', url: 'https://example.com' })
  assert.equal(x.requests.length, 1); assert.equal(execute.approved, true)
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, 'YQ==')
  assert.equal(JSON.parse(result.content[0].text).tabId, 'test')
})

test('commands remain pending until approval and receive exact WSL policy', async t => {
  let decide, calls = []
  const x = fixture(t, { requestApproval: () => new Promise(resolve => { decide = resolve }), executeCommand: async request => { calls.push(request); return { code: 0, output: 'ok' } } })
  const pending = x.invoke('stable_exec', { command: 'printf 中文', timeoutMs: 1234 })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.length, 0); decide(false)
  assert.equal((await pending).isError, true); assert.equal(calls.length, 0)
  const allowed = x.invoke('stable_exec', { command: 'printf 中文', timeoutMs: 1234 })
  await new Promise(resolve => setImmediate(resolve)); decide(true)
  assert.equal((await allowed).isError, undefined)
  assert.equal(calls[0].command, 'printf 中文'); assert.equal(calls[0].timeoutMs, 1234)
  assert.deepEqual(calls[0].writableRoots, [x.workspace]); assert.equal(calls[0].networkAccess, false)
})

test('read-only denies network even with full permission mode, outside cwd never reaches execution', async t => {
  let calls = []
  const x = fixture(t, { sandboxMode: 'read-only', session: { permissionMode: 'full', networkAccess: true }, executeCommand: async value => { calls.push(value); return { code: 0 } } })
  assert.equal((await x.invoke('stable_exec', { command: 'pwd', cwd: x.outside })).isError, true)
  assert.equal(calls.length, 0)
  assert.equal((await x.invoke('stable_exec', { command: 'pwd' })).isError, undefined)
  assert.equal(calls[0].sandboxMode, 'read-only'); assert.equal(calls[0].networkAccess, false)
})

test('cancel while awaiting command approval never executes a command', async t => {
  let called = false
  const controller = new AbortController()
  const x = fixture(t, { requestApproval: () => new Promise(() => {}), executeCommand: async () => { called = true } })
  const pending = x.invoke('stable_exec', { command: 'pwd' }, { signal: controller.signal })
  controller.abort()
  assert.equal((await pending).isError, true); assert.equal(called, false)
})
