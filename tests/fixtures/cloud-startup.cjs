'use strict'
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const source = path.resolve(__dirname, '../..')
const repo = process.env.STABLE_TEST_APP_ROOT || source
fs.mkdirSync(path.resolve(__dirname, '../../.local'), { recursive: true })
const root = fs.mkdtempSync(path.join(source, '.local/cloud-startup-'))
process.env.STABLE_QA_USER_DATA = root
const reportPath = path.join(root, 'diagnostics.json')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: reportPath })
fs.mkdirSync(path.join(root,'logs'),{recursive:true})
fs.writeFileSync(path.join(root,'logs/cloud-network.jsonl'),JSON.stringify({time:new Date().toISOString(),route:'/api/account',status:200,password:'PRIVATE_PASSWORD',token:'PRIVATE_TOKEN',body:'PRIVATE_CHAT'})+'\n')
let updateChecks = 0
let updateInstalls = 0
const oneClickFixture = process.argv.some(arg => arg.startsWith('--one-click'))
if (process.argv.includes('--packaged-default') || oneClickFixture) {
  Object.defineProperty(app, 'isPackaged', { value: true })
  delete process.env.STABLE_CLOUD_ENABLED
  const updater = require('electron-updater').autoUpdater
  updater.checkForUpdates = async () => { updateChecks++; updater.emit(oneClickFixture ? 'update-available' : 'update-not-available', { version: '99.0.0' }); return null }
  updater.downloadUpdate = async () => { updater.emit('update-downloaded', { version: '99.0.0' }); return [] }
  // Exercise the real quitAndInstall flag routing, but never spawn an installer or quit this fixture.
  updater.install = (silent, forceRun) => { updateInstalls++; assert.equal(silent,false);assert.equal(forceRun,true);return false }
} else process.env.STABLE_CLOUD_ENABLED = '1'
delete process.env.STABLE_QA_CAPTURE
delete process.env.STABLE_QA_CLOUD_AUTHENTICATED
app.getAppPath = () => repo
const started = performance.now()
let shownAt, release, restored = false, restoreCalls = 0
for (const name of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[name] = function () {
  shownAt ??= Math.round(performance.now() - started)
}
const { CloudAccountService } = require(path.join(repo, 'desktop/services/cloud-account.cjs'))
CloudAccountService.prototype.restore = async function () {
  if (++restoreCalls === 1) await new Promise(resolve => { release = resolve })
  restored = true
  if (process.argv.includes('--failure') && restoreCalls === 1) throw Error('fixture connection closed')
  this.snapshot = { ...this.snapshot, status: 'signed_out', error: '' }
}
// Keep renderer-triggered model discovery local to this startup fixture.
CloudAccountService.prototype.refresh = async function () { return this.publicState() }
CloudAccountService.prototype.login = async function(username, password) {
  assert.equal(username, 'fixture-user')
  if (password !== 'fixture-password') throw Error('fixture invalid credentials')
  this.snapshot = { ...this.snapshot, status: 'authenticated', account: { id: 'fixture', username, displayName: '验证用户', role: 'member' }, error: '' }
}
CloudAccountService.prototype.logout = async function() { this.snapshot = { ...this.snapshot, status: 'signed_out', account: null, error: '' } }
const timer = setTimeout(() => { console.error('Window blocked by cloud startup'); app.exit(1) }, 15000)
process.on('unhandledRejection', error => { console.error(error); app.exit(1) })
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 700))
      assert.equal(restored, false)
      assert.ok(shownAt !== undefined, 'Window reveal requested while cloud is pending')
      assert.ok(await window.webContents.executeJavaScript("Boolean(document.querySelector('#stable-main-navigation')) && document.body.innerText.includes('正在恢复云端登录状态')"))
      assert.equal(await window.webContents.executeJavaScript("Boolean(document.querySelector('#cloud-username'))"), false)
      // A missing Cloud startup reply must not block support IPC.
      assert.ok(await window.webContents.executeJavaScript('window.stable.support.exportDiagnostics()'))
      release()
      const expected = process.argv.includes('--failure') ? '云端连接暂不可用' : '登录 Stable Cloud 后即可发送模型任务'
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(expected)})`)) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.ok(await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(expected)})`))
      await window.webContents.executeJavaScript(`(async()=>{
        const tick=()=>new Promise(r=>setTimeout(r,80));
        const expect=(ok,message)=>{if(!ok)throw Error(message)};
        const until=async(test,label)=>{for(let i=0;i<50;i++){if(test())return;await tick();}throw Error('Timed out: '+label);};
        const input=(selector,value)=>{const el=document.querySelector(selector);const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
        const draft=document.querySelector('textarea[placeholder^="给 Stable"]');
        expect(draft,'Composer must remain accessible');input('textarea[placeholder^="给 Stable"]','保留这条未发送草稿');await tick();
        document.querySelector('.composer-send').click();await tick();
        expect(document.querySelector('.settings-page'),'Send must open account settings');
        expect(draft.value==='保留这条未发送草稿','Unauthenticated send must retain the draft');
        const clickText=(selector,text)=>{const button=Array.from(document.querySelectorAll(selector)).find(b=>b.textContent===text);expect(button,'Missing '+text);button.click();};
        clickText('.cloud-support-actions button','导出脱敏诊断');await tick();
        await until(()=>document.querySelector('.support-diagnostics [role="status"]')?.textContent.includes('已保存'),'Export should work before authentication');
        clickText('.cloud-support-actions button','前往软件更新');await tick();
        expect(document.querySelector('.update-settings-row'),'Update page must work without cloud login');
        await until(()=>document.querySelector('.update-recovery')?.textContent.includes('本机暂无回退脚本'),'Development fixture must not expose a real rollback path');
        const originalSave = Storage.prototype.setItem;
        if (${process.argv.includes('--one-click-unsaved')}) Storage.prototype.setItem = ()=>{throw Error('fixture disk quota')};
        clickText('.update-settings-row button','一键更新');await tick();
        if (${process.argv.includes('--one-click-unsaved')}) {
          await until(()=>document.querySelector('.update-settings-row')?.textContent.includes('草稿尚未安全保存'),'Unsaved drafts must block installation');
          Storage.prototype.setItem=originalSave;
        }
        clickText('.settings-navigation button','账号');await tick();
        if(document.body.innerText.includes('暂时无法连接云端')){Array.from(document.querySelectorAll('.cloud-auth-actions button')).find(b=>b.textContent==='重新连接').click();await tick();}
        expect(document.querySelector('#cloud-username'),'Login must appear inside settings');
        expect(document.querySelector('.settings-page #cloud-username'),'Login must not replace workspace');
        input('#cloud-username','fixture-user');input('#cloud-password','bad-password');await tick();document.querySelector('.cloud-auth-form').requestSubmit();await tick();
        await until(()=>document.querySelector('.cloud-auth-error')?.textContent.includes('fixture invalid credentials'),'Login failure must remain visible');
        input('#cloud-password','fixture-password');await tick();document.querySelector('.cloud-auth-form').requestSubmit();await tick();
        await until(()=>document.querySelector('.cloud-account-identity')?.textContent.includes('验证用户'),'Successful login must show account details');
        expect(!document.querySelector('.cloud-login-notice'),'Login hint must disappear after authentication');
        expect(draft.value==='保留这条未发送草稿','Successful login must retain draft');
        document.querySelector('.account-logout').click();await tick();
        expect(document.querySelector('#cloud-username'),'Logout must return to settings login');
        expect(document.querySelector('#stable-main-navigation'),'Logout must keep the workspace');
        return true;
      })()`)
      const report = JSON.parse(fs.readFileSync(reportPath,'utf8'))
      assert.equal(report.format,1)
      assert.doesNotMatch(JSON.stringify(report),/PRIVATE_/)
      if (app.isPackaged && !process.argv.includes('--one-click-unsaved')) assert.ok(updateChecks > 0, 'Update check must work without an authenticated Cloud session')
      if (process.argv.includes('--one-click')) assert.equal(updateInstalls,1,'Single UI click must reach real updater install with relaunch flags')
      else assert.equal(updateInstalls,0,'Background checks must not install')
      console.log('CLOUD_STARTUP_RESULT', JSON.stringify({ shownAtMs: shownAt, cloudPendingAtReveal: true, finalState: expected, supportExport:true, unauthenticatedUpdates:true, updateInstalls }))
      clearTimeout(timer)
      app.exit(0)
    } catch (error) {
      console.error(error)
      console.error('UI_FAILURE_STATE', await window.webContents.executeJavaScript("JSON.stringify({title:document.querySelector('.settings-page h1')?.textContent,cloud:document.querySelector('#cloud-access-title')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(el=>el.textContent),buttons:[...document.querySelectorAll('.cloud-auth-form button')].map(el=>({label:el.textContent,disabled:el.disabled}))})"))
      app.exit(1)
    }
  })
})
require(path.join(repo, 'desktop/main.cjs'))
