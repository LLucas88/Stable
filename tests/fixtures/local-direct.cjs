'use strict'
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const repo = path.resolve(__dirname, '../..')
const root = fs.mkdtempSync(path.join(repo, '.local/direct-startup-'))
process.env.STABLE_QA_USER_DATA = root
delete process.env.STABLE_CLOUD_ENABLED
delete process.env.STABLE_QA_CAPTURE
delete process.env.STABLE_QA_CLOUD_AUTHENTICATED
app.getAppPath = () => repo
for (const name of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[name] = function () {}
const { CloudAccountService } = require('../../desktop/services/cloud-account.cjs')
CloudAccountService.prototype.restore = () => { throw Error('Direct mode must not restore Cloud') }
let file
dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
dialog.showMessageBox = async () => ({ response: 1 })
const timer = setTimeout(() => app.exit(1), 20000)
process.on('unhandledRejection', error => { console.error(error); app.exit(1) })
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const js = code => window.webContents.executeJavaScript(code)
      assert.equal((await js('window.stable.bootstrap()')).cloud.status, 'disabled')
      await js("window.stable.model.save({ id:'fixture', providerId:'fixture', displayName:'Fixture', baseURL:'https://example.com/v1', model:'fixture-model', apiKey:'fixture-source-key' })")
      const identity = await js('window.stable.provisioning.identity()')
      file = path.join(root, 'request.json')
      await js('window.stable.provisioning.request()')
      const request = file
      // Issuance reads the request, then saves to a different file.
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [request] })
      file = path.join(root, 'config.json')
      await js("window.stable.provisioning.issue('fixture','fixture-target-key')")
      assert.ok(!fs.readFileSync(file, 'utf8').includes('fixture-target-key'))
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
      await js(`window.stable.provisioning.import(${JSON.stringify(identity.issuerFingerprint)})`)
      const state = await js('window.stable.bootstrap()')
      assert.equal(state.models.defaultModelId, 'fixture')
      assert.ok(!JSON.stringify(state).includes('fixture-target-key'))
      assert.ok(!fs.readFileSync(path.join(root, 'secrets.json'), 'utf8').includes('fixture-target-key'))
      await assert.rejects(() => js(`window.stable.provisioning.import(${JSON.stringify(identity.issuerFingerprint)})`))
      await js("document.querySelector('.rail-account-trigger').click()")
      await new Promise(resolve => setTimeout(resolve, 100))
      await js("Array.from(document.querySelectorAll('.account-menu-popover button')).find(el=>el.innerText.includes('模型连接')).click()")
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(await js("document.body.innerText.includes('输入一次 API Key')"))
      assert.equal(await js("document.body.innerText.includes('导出本机申请')"), false)
      assert.equal(await js("document.querySelector('input[name=\"api-key\"]').value"), '')
      console.log('LOCAL_DIRECT_RESULT default login bypass, real IPC, safeStorage, signed package import, replay rejection, settings UI passed')
      clearTimeout(timer); app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
  })
})
require('../../desktop/main.cjs')
