'use strict'
const { app, BrowserWindow, safeStorage } = require('electron')
const path = require('node:path'), assert = require('node:assert/strict'), fs = require('node:fs')
const repo = path.resolve(__dirname, '../..'), root = process.env.STABLE_KEY_TEST_ROOT
process.env.STABLE_QA_USER_DATA = root
delete process.env.STABLE_CLOUD_ENABLED; delete process.env.STABLE_QA_CAPTURE
app.getAppPath = () => repo
for (const method of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[method] = function () {}
const timer = setTimeout(() => app.exit(1), 20000)
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const js = code => window.webContents.executeJavaScript(code)
    try {
      for (let i = 0; i < 50; i++) { if (await js("Boolean(document.querySelector('.rail-account-trigger'))")) break; await new Promise(resolve => setTimeout(resolve, 100)) }
      await js("document.querySelector('.rail-account-trigger').click()")
      await new Promise(resolve => setTimeout(resolve, 100))
      await js("Array.from(document.querySelectorAll('.account-menu-popover button')).find(el=>el.innerText.includes('模型连接')).click()")
      await new Promise(resolve => setTimeout(resolve, 150))
      assert.equal(await js("document.querySelector('input[name=\"api-key\"]').value"), '')
      assert.equal(await js("document.body.innerText.includes('导出本机申请')"), false)
      if (process.argv.includes('--save')) {
        await js(`(() => { const input=document.querySelector('input[name="api-key"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'fixture-user-entered-key'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
        await new Promise(resolve => setTimeout(resolve, 100))
        await js("document.querySelector('.model-connection-settings').requestSubmit()")
        for (let i = 0; i < 50; i++) { if (await js("Boolean(document.querySelector('.model-connection-settings [role=status]'))")) break; await new Promise(resolve => setTimeout(resolve, 100)) }
        assert.ok(await js("document.body.innerText.includes('已在本机加密保存')"))
      } else assert.ok(await js("document.body.innerText.includes('已加密保存')"))
      assert.equal(await js("document.querySelector('input[name=\"api-key\"]').value"), '')
      const state = await js('window.stable.bootstrap()')
      assert.ok(state.models.items.find(m => m.id === state.models.defaultModelId).hasApiKey)
      assert.ok(!JSON.stringify(state).includes('fixture-user-entered-key'))
      assert.ok(!fs.readFileSync(path.join(root,'secrets.json'),'utf8').includes('fixture-user-entered-key'))
      const { SecretStore } = require('../../desktop/services/secrets.cjs')
      assert.equal(new SecretStore(root,safeStorage).get(`model:${state.models.defaultModelId}:apiKey`),'fixture-user-entered-key')
      console.log('MANUAL_MODEL_KEY_PASS '+(process.argv.includes('--save')?'UI save':'after process restart'))
      clearTimeout(timer); app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
  })
})
require('../../desktop/main.cjs')
