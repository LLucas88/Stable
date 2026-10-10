'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const source = path.resolve(__dirname, '../..')
const repo = process.env.STABLE_TEST_APP_ROOT || source
const root = fs.mkdtempSync(path.join(source, '.local/cloud-startup-'))
process.env.STABLE_QA_USER_DATA = root
process.env.STABLE_CLOUD_ENABLED = '1'
delete process.env.STABLE_QA_CAPTURE
delete process.env.STABLE_QA_CLOUD_AUTHENTICATED
app.getAppPath = () => repo
const started = performance.now()
let shownAt, release, restored = false
for (const name of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[name] = function () {
  shownAt ??= Math.round(performance.now() - started)
}
const { CloudAccountService } = require(path.join(repo, 'desktop/services/cloud-account.cjs'))
CloudAccountService.prototype.restore = async function () {
  await new Promise(resolve => { release = resolve })
  restored = true
  if (process.argv.includes('--failure')) throw Error('fixture connection closed')
  this.snapshot = { ...this.snapshot, status: 'signed_out' }
}
const timer = setTimeout(() => { console.error('Window blocked by cloud startup'); app.exit(1) }, 15000)
process.on('unhandledRejection', error => { console.error(error); app.exit(1) })
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 700))
      assert.equal(restored, false)
      assert.ok(shownAt !== undefined, 'Window reveal requested while cloud is pending')
      assert.ok(await window.webContents.executeJavaScript("document.body.innerText.includes('正在连接云端')"))
      assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('#cloud-username'))"), false)
      release()
      const expected = process.argv.includes('--failure') ? '暂时无法连接云端' : '登录 Stable'
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(expected)})`)) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.ok(await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(expected)})`))
      console.log('CLOUD_STARTUP_RESULT', JSON.stringify({ shownAtMs: shownAt, cloudPendingAtReveal: true, finalState: expected }))
      clearTimeout(timer)
      app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
  })
})
require(path.join(repo, 'desktop/main.cjs'))
