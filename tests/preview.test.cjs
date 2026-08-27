'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { normalizeWebUrl, renderMarkdownDocument, resolveMarkdownFile } = require('../desktop/services/preview.cjs')

const root = path.resolve(__dirname, '..')

test('web preview accepts only credential-free HTTP and HTTPS URLs', () => {
  assert.equal(normalizeWebUrl('https://example.com/docs'), 'https://example.com/docs')
  assert.equal(normalizeWebUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/')
  assert.throws(() => normalizeWebUrl('file:///C:/secret.txt'), /只支持 HTTP 或 HTTPS/)
  assert.throws(() => normalizeWebUrl('https://user:secret@example.com'), /不能包含账号或密码/)
  assert.throws(() => normalizeWebUrl('javascript:alert(1)'), /只支持 HTTP 或 HTTPS/)
})

test('Markdown preview stays inside trusted roots unless a conversation attachment is explicitly authorized', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'stable-preview-'))
  try {
    const workspace = path.join(temporary, 'workspace')
    const outside = path.join(temporary, 'outside')
    mkdirSync(workspace); mkdirSync(outside)
    const trustedFile = path.join(workspace, 'trusted.md')
    const outsideFile = path.join(outside, 'outside.md')
    writeFileSync(trustedFile, '# Trusted', 'utf8')
    writeFileSync(outsideFile, '# Outside', 'utf8')
    assert.equal(resolveMarkdownFile(trustedFile, [workspace]).content, '# Trusted')
    assert.throws(() => resolveMarkdownFile(outsideFile, [workspace]), /工作区内/)
    assert.equal(resolveMarkdownFile(outsideFile, [workspace], true).content, '# Outside')
    assert.throws(() => resolveMarkdownFile(path.join(workspace, 'missing.md'), [workspace]), /不存在/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('Markdown rendering escapes embedded HTML and applies a restrictive CSP', () => {
  const html = renderMarkdownDocument('# 标题\n\n<script>alert("x")</script>\n\n- **安全**\n- `code`\n\n| 列 | 值 |\n| --- | --- |\n| A | 1 |', 'demo.md')
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /<table>/)
})

test('Electron side preview is sandboxed, permissionless, resizable, and has no standalone CLI entry', () => {
  const main = readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8')
  const preload = readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.match(main, /new WebContentsView/)
  assert.match(main, /partition: 'stable-preview'/)
  assert.match(main, /contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true/)
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/)
  assert.match(main, /setPermissionRequestHandler[\s\S]*callback\(false\)/)
  assert.match(main, /setWindowOpenHandler[\s\S]*return \{ action: 'deny' \}/)
  assert.match(main, /contentView\.addChildView\(view\)/)
  assert.match(main, /view\.setBounds\(normalizedPreviewBounds\(bounds\)\)/)
  assert.match(main, /isConversationPreviewPath/)
  assert.match(preload, /stable:preview:openWeb/)
  assert.match(preload, /stable:preview:setBounds/)
  assert.match(preload, /stable:preview:close/)
  assert.doesNotMatch(main, /previewRequestFromArgv|previewCliInstruction/)
  assert.ok(!pkg.build.extraResources.some((item) => item.from === 'scripts/stable-preview.cjs'))
})
