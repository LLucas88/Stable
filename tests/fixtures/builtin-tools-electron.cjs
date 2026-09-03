'use strict'
const electron = require('electron')
const { app } = electron
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { BuiltinTools } = require('../../desktop/services/builtin-tools.cjs')
const { BrowserTool } = require('../../desktop/services/browser-tool.cjs')
const { HarnessRunner } = require('../../desktop/services/harness.cjs')
const ExcelJS = require('../../vendor/agent-tools/node_modules/exceljs')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-builtin-e2e-'))
app.setPath('userData', path.join(root, 'profile'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {}) // fixture keeps running after run-scoped browser cleanup
let server, runner, direct

async function run() {
  await app.whenReady()
  let step = 0, approvals = 0, origin
  const responses = [], events = []
  const finish = (response, delta, reason = 'stop') => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const [content, finish_reason] of [[delta, null], [{}, reason]]) response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: content, finish_reason }] })}\n\n`)
    response.end('data: [DONE]\n\n')
  }
  const call = (response, name, args) => finish(response, { tool_calls: [{ index: 0, id: `fixture-${step}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, 'tool_calls')
  const html = '<!doctype html><title>工具验证</title><label>备注<input name="note"></label><input name="password" type="password"><button id="apply" onclick="document.getElementById(\'status\').textContent=document.querySelector(\'input[name=note]\').value">应用</button><div id="status">等待填写</div><table><tr><th>门店</th><th>金额</th></tr><tr><td>A店</td><td>120</td></tr></table><a href="file:///C:/Windows/win.ini">禁止文件</a><script>window.nodeExposed=typeof require;window.open("https://example.invalid/");</script>'
  server = http.createServer(async (request, response) => {
    if (request.url === '/page') { response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); response.end(html); return }
    if (request.url === '/slow') return // cancellation fixture; closed during cleanup
    if (!request.url.endsWith('/chat/completions')) { response.writeHead(404); response.end(); return }
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks))
      if (!body.tools?.length) { finish(response, { content: '工具验证' }); return }
      const names = body.tools.map(tool => tool.function?.name)
      assert.ok(names.includes('stable_browser'), `browser not advertised: ${names.join(',')}`)
      assert.ok(names.includes('stable_excel'), 'Excel not advertised')
      const last = body.messages.filter(m => m.role === 'tool').at(-1)
      let result
      if (last) {
        const content = typeof last.content === 'string' ? last.content : last.content.map(c => c.text || '').join('')
        try { result = JSON.parse(content) } catch { throw new Error(`Tool failed: ${content.slice(0, 1200)}`) }
        responses.push(result)
      }
      step++
      if (step === 1) return call(response, 'stable_browser', { action: 'open', url: `${origin}/page` })
      if (step === 2) {
        assert.match(result.text, /A店/)
        return call(response, 'stable_browser', { action: 'fill', ref: result.controls.find(c => c.label === '备注').ref, value: '后台填写成功' })
      }
      if (step === 3) return call(response, 'stable_browser', { action: 'click', ref: result.controls.find(c => c.label === '应用').ref })
      if (step === 4) {
        assert.match(result.text, /后台填写成功/)
        return call(response, 'stable_excel', { action: 'create', output: '网页采集.xlsx', sheets: [{ name: '网页', rows: result.tables[0] }] })
      }
      if (step === 5) { assert.equal(result.verified, true); return call(response, 'stable_excel', { action: 'inspect', path: '网页采集.xlsx' }) }
      if (step === 6) { assert.equal(result.sheets[0].rows, 2); return call(response, 'stable_excel', { action: 'read', path: '网页采集.xlsx', sheet: '网页' }) }
      assert.deepEqual(result.rows[1].values, ['A店', '120'])
      finish(response, { content: 'BUILTIN_AGENT_OK' })
    } catch (error) { console.error('FIXTURE_FAILURE', error.message); finish(response, { content: `FIXTURE_FAILURE ${error.message}` }) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  const factory = () => new BuiltinTools({ workspace: root, electron })
  runner = new HarnessRunner({ userData: root, workspace: root, packaged: false, environment: {}, builtinTools: factory })
  const answer = await runner.run('Use the requested built-in tools on the local test fixture.', { providerId: 'builtin-test', model: 'builtin-test', baseURL: `${origin}/v1` }, 'fake-test-key', 50_000, event => {
    events.push(event)
    if (event.kind === 'approval') { approvals++; runner.answerApproval(event.requestId, true) } // fixture only
  }, 'workspace-write')
  assert.equal(answer, 'BUILTIN_AGENT_OK')
  assert.equal(step, 7); assert.equal(approvals, 2)
  assert.ok(events.some(e => e.title === '使用工具 stable_excel'))
  assert.ok(events.some(e => e.title === '使用工具 stable_browser'))
  assert.equal(electron.BrowserWindow.getAllWindows().length, 0, 'run completion must close its hidden browser')
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(path.join(root, '网页采集.xlsx'))
  assert.equal(workbook.getWorksheet('网页').getCell('A2').value, 'A店')

  // Independent real Chromium boundary checks, no browser automation plugin.
  direct = new BrowserTool({ electron })
  await assert.rejects(direct.execute({ action: 'open', url: 'file:///C:/Windows/win.ini' }), /HTTP/)
  await assert.rejects(direct.execute({ action: 'open', url: 'https://user:secret@example.test' }), /账号或密码/)
  const first = await direct.execute({ action: 'open', url: `${origin}/page` })
  assert.equal(direct.window.isVisible(), false)
  assert.equal(await direct.window.webContents.executeJavaScript('window.nodeExposed'), 'undefined')
  assert.equal(direct.window.webContents.getLastWebPreferences().sandbox, true)
  assert.equal(electron.BrowserWindow.getAllWindows().length, 1, 'popup was blocked')
  const oldRef = first.controls.find(c => c.label === '应用').ref
  const fresh = await direct.execute({ action: 'read' })
  await assert.rejects(direct.execute({ action: 'click', ref: oldRef }), /失效/)
  await assert.rejects(direct.execute({ action: 'fill', ref: fresh.controls.find(c => c.type === 'password').ref, value: 'fake-only' }), /敏感/)
  assert.equal(await direct.window.webContents.executeJavaScript('document.querySelector("input[type=password]").value'), '')
  direct.dispose()
  const controller = new AbortController()
  const loading = direct.execute({ action: 'open', url: `${origin}/slow` }, controller.signal)
  setTimeout(() => controller.abort(), 100)
  await assert.rejects(loading, /取消|ERR_ABORTED|destroyed/)
  assert.equal(electron.BrowserWindow.getAllWindows().length, 0)

  // Verify the actual app.asar + extraResources layout, not a source-only require.
  const asar = require('@electron/asar')
  const stage = path.join(root, 'stage'), resources = path.join(root, 'resources')
  fs.mkdirSync(path.join(stage, 'desktop/services'), { recursive: true })
  fs.mkdirSync(resources)
  for (const filename of ['builtin-tools.cjs', 'browser-tool.cjs', 'excel-tool.cjs', 'excel-tool-worker.cjs', 'tool-files.cjs', 'preview.cjs']) fs.copyFileSync(path.join(__dirname, '../../desktop/services', filename), path.join(stage, 'desktop/services', filename))
  fs.cpSync(path.join(__dirname, '../../vendor/agent-tools'), path.join(resources, 'agent-tools'), { recursive: true })
  const archive = path.join(resources, 'app.asar')
  await asar.createPackage(stage, archive)
  const PackagedTools = require(path.join(archive, 'desktop/services/builtin-tools.cjs')).BuiltinTools
  const packaged = new PackagedTools({ workspace: root, electron, packaged: true, resourcesPath: resources })
  try {
    assert.equal(packaged.dependencyRoot, path.join(resources, 'agent-tools'))
    const created = await packaged.execute({ requestId: 'package-xlsx', name: 'stable_excel', args: { action: 'create', output: '安装布局.xlsx', sheets: [{ name: '验证', rows: [['安装布局', 1]] }] } }, 'workspace-write')
    assert.equal(created.verified, true)
    const page = await packaged.execute({ requestId: 'package-browser', name: 'stable_browser', args: { action: 'open', url: `${origin}/page` } }, 'workspace-write')
    assert.match(page.text, /A店/)
  } finally { packaged.dispose() }
  console.log('BUILTIN_ELECTRON_PASSED', JSON.stringify({ modelRequests: step, approvals, tools: ['stable_browser', 'stable_excel'], realWorkbook: true, hiddenIsolatedBrowser: true, cancellation: true, asarAndResources: true }))
}

run().then(() => cleanup(0), error => { console.error('BUILTIN_ELECTRON_FAILED', error.stack); cleanup(1) })
function cleanup(code) {
  runner?.cancel(); direct?.dispose(); server?.closeAllConnections(); server?.close()
  app.exit(code)
}
process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }) } catch {} })
