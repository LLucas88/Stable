'use strict'
const electron = require('electron'), { app, BrowserWindow } = electron
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const { BuiltinTools } = require('../../desktop/services/builtin-tools.cjs')
const { BrowserSessionService } = require('../../desktop/services/browser-session.cjs')
const root = process.env.STABLE_OFFLINE_TEST_ROOT
if (!root) throw Error('Missing isolated fixture directory')
app.setPath('userData', path.join(root, 'profile')); app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
let service, window, server, tools
async function main() {
  await app.whenReady()
  let requests = 0
  server = http.createServer((_req, res) => { requests++; res.setHeader('Content-Type', 'text/html'); res.end('<h1>REMOTE_PAGE</h1>') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const remote = `http://127.0.0.1:${server.address().port}`
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'local.js'), "document.querySelector('h1').textContent='LOCAL_SCRIPT_OK'")
  fs.writeFileSync(path.join(workspace, 'local.css'), 'h1{color:rgb(12,34,56)}')
  fs.writeFileSync(path.join(workspace, 'next.html'), '<h1>LOCAL_NEXT_PAGE</h1>')
  const file = path.join(workspace, 'index.html')
  fs.writeFileSync(file, `<h1>Local</h1><link rel="stylesheet" href="local.css"><script src="local.js"></script>
    <a href="next.html">Local next</a><a href="${remote}/navigation">Remote link</a>
    <img src="${remote}/image"><script src="${remote}/script"></script><link rel="stylesheet" href="${remote}/style"><iframe src="${remote}/frame"></iframe>
    <script>setTimeout(()=>{fetch('${remote}/fetch').catch(()=>{});new Image().src='${remote}/delayed';window.open('${remote}/popup');},50)</script>`)
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true } })
  const data = new Map(), store = { getSetting: key => data.get(key), setSetting: (key, value) => data.set(key, structuredClone(value)) }
  service = new BrowserSessionService({ electron, store, getWindow: () => window })
  for (const shared of [true, false]) {
    tools = new BuiltinTools({ workspace, electron, conversationId: 'offline', ...(shared ? { browserSession: service } : {}), networkAccess: true })
    let serial = 0
    const invoke = args => tools.execute({ requestId: String(++serial), name: 'stable_browser', args, approved: true }, 'workspace-write')
    const online = await invoke({ action: 'open', url: remote })
    assert.match(online.text, /REMOTE_PAGE/)
    tools.networkAccess = false
    const count = requests
    await assert.rejects(invoke({ action: 'read', tabId: online.tabId }), /禁止联网/)
    await assert.rejects(invoke({ action: 'open', url: remote }), /禁止联网/)
    let local = await invoke({ action: 'open', url: file, tabId: online.tabId })
    assert.match(local.text, /LOCAL_SCRIPT_OK/)
    const contents = shared ? service.get('offline', local.tabId).view.webContents : tools.browser.window.webContents
    assert.equal(await contents.executeJavaScript("getComputedStyle(document.querySelector('h1')).color"), 'rgb(12, 34, 56)')
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(requests, count, 'local preview must not load remote resources, frames or popups')
    await invoke({ action: 'click', tabId: local.tabId, ref: local.controls.find(c => c.label === 'Remote link').ref })
    assert.equal(requests, count, 'a previously approved remote origin is still blocked')
    local = await invoke({ action: 'read', tabId: local.tabId })
    const next = await invoke({ action: 'click', tabId: local.tabId, ref: local.controls.find(c => c.label === 'Local next').ref })
    assert.match(next.text, /LOCAL_NEXT_PAGE/)
    assert.match((await invoke({ action: 'read', tabId: local.tabId })).text, /LOCAL_NEXT_PAGE/)
    await assert.rejects(contents.loadURL(remote + '/direct'), /BLOCKED|ERR_FAILED|ABORTED/)
    assert.equal(requests, count, 'request interception must persist while the tab is idle')
    tools.networkAccess = true
    assert.match((await invoke({ action: 'open', url: remote, tabId: local.tabId })).text, /REMOTE_PAGE/)
    assert(requests > count, 'online browser access still works')
    tools.dispose(); tools = undefined
  }
  console.log('BROWSER_OFFLINE_PASSED')
}
main().then(() => { tools?.dispose(); service?.dispose(); window?.destroy(); server?.closeAllConnections(); server?.close(); app.exit(0) }).catch(error => { console.error(error.stack); tools?.dispose(); service?.dispose(); window?.destroy(); server?.closeAllConnections(); server?.close(); app.exit(1) })
