'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { LocalHtmlPreview } = require('../desktop/services/local-html-preview.cjs')
const { previewNetworkScope, allowsPreviewRequest } = require('../desktop/services/browser-network-policy.cjs')
const { BuiltinTools } = require('../desktop/services/builtin-tools.cjs')

test('offline preview admits only the validated workspace preview and its resources', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-preview-policy-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const file = path.join(workspace, 'index.html'); fs.writeFileSync(file, '<h1>Local</h1>')
  const preview = new LocalHtmlPreview(workspace)
  t.after(() => { preview.dispose(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  const url = await preview.open(file), scope = previewNetworkScope(url, workspace)
  const allowed = (url, extra = {}) => allowsPreviewRequest(scope, { url, resourceType: 'mainFrame', ...extra })
  assert(allowed(url)); assert(allowed(scope.prefix + 'style.css')); assert(allowed(url, { method: 'HEAD' }))
  assert.deepEqual(previewNetworkScope(scope.prefix + 'next.html', workspace, scope), scope)
  for (const target of ['https://example.org/', 'http://localhost:1234/', scope.prefix + '../other/index.html', new URL('/another-token/style.css', url).href, 'file:///C:/Windows/win.ini', 'blob:https://example.org/id', 'data:text/html,test']) assert.equal(allowed(target), false, target)
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(allowed(url, { method }), false)
  assert(allowed('data:image/png;base64,YQ==', { resourceType: 'image' }))
  assert.throws(() => previewNetworkScope('http://127.0.0.1:1234/', workspace), /禁止联网/)
  assert.throws(() => previewNetworkScope(url, path.join(root, 'another-workspace')), /工作区/)
})

test('offline browser cannot grant remote access through operation approval', async t => {
  let calls = 0
  const tools = new BuiltinTools({ workspace: process.cwd(), networkAccess: false, browserSession: { execute: async () => { calls++; return {} } } })
  t.after(() => tools.dispose())
  for (const url of ['https://example.org/', 'http://127.0.0.1:1234/']) await assert.rejects(tools.execute({ requestId: url, name: 'stable_browser', args: { action: 'open', url }, approved: true }, 'workspace-write'), /禁止联网/)
  assert.equal(calls, 0)
})
