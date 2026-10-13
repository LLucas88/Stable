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

test('MCP supplements native tools without duplicate files and retains read-only browser restrictions', async t => {
  const x = fixture(t)
  assert(!x.server.tools.some(tool => tool.name === 'stable_file'))
  assert(!x.server.tools.some(tool => tool.name === 'stable_exec'))
  let calls = 0
  const readOnly = fixture(t, { sandboxMode: 'read-only', builtinTools: { execute: async () => { calls++; return {} }, cancel() {} } })
  assert.equal((await readOnly.invoke('stable_browser', { action: 'open', url: 'https://example.com' })).isError, true)
  assert.equal((await readOnly.invoke('stable_skill_install', { path: readOnly.workspace })).isError, true)
  assert.equal(calls, 0)
  assert.equal(readOnly.requests.length, 0)
  assert.equal((await readOnly.invoke('stable_browser', { action: 'audit', tabId: 'existing-tab' })).isError, undefined)
  assert.equal(calls, 1)
  assert.equal(readOnly.requests.length, 0, 'read-only layout inspection needs no mutation approval')
})

test('builtin approval and image content are routed through the parent implementation', async t => {
  let execute
  const x = fixture(t, { builtinTools: { execute: async request => { execute = request; return { tabId: 'test', image: 'data:image/png;base64,YQ==' } }, cancel() {} } })
  const result = await x.invoke('stable_browser', { action: 'open', url: 'https://example.com' })
  assert.equal(x.requests.length, 1); assert.equal(execute.approved, true)
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, 'YQ==')
  assert.equal(JSON.parse(result.content[0].text).tabId, 'test')
})
