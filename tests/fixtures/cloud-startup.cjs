'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const source = path.resolve(__dirname, '../..')
const repo = process.env.STABLE_TEST_APP_ROOT || source
fs.mkdirSync(path.resolve(__dirname, '../../.local'), { recursive: true })
const root = fs.mkdtempSync(path.join(source, '.local/cloud-startup-'))
process.env.STABLE_QA_USER_DATA = root
process.env.STABLE_CLOUD_ENABLED = '1'
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
        const input=(selector,value)=>{const el=document.querySelector(selector);const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
        const draft=document.querySelector('textarea[placeholder^="给 Stable"]');
        expect(draft,'Composer must remain accessible');input('textarea[placeholder^="给 Stable"]','保留这条未发送草稿');await tick();
        document.querySelector('.composer-send').click();await tick();
        expect(document.querySelector('.settings-page'),'Send must open account settings');
        expect(draft.value==='保留这条未发送草稿','Unauthenticated send must retain the draft');
        if(document.body.innerText.includes('暂时无法连接云端')){Array.from(document.querySelectorAll('.cloud-auth-actions button')).find(b=>b.textContent==='重新连接').click();await tick();}
        expect(document.querySelector('#cloud-username'),'Login must appear inside settings');
        expect(document.querySelector('.settings-page #cloud-username'),'Login must not replace workspace');
        input('#cloud-username','fixture-user');input('#cloud-password','bad-password');await tick();document.querySelector('.cloud-auth-form').requestSubmit();await tick();
        expect(document.querySelector('.cloud-auth-error').textContent.includes('fixture invalid credentials'),'Login failure must remain visible');
        input('#cloud-password','fixture-password');await tick();document.querySelector('.cloud-auth-form').requestSubmit();await tick();
        expect(document.querySelector('.cloud-account-identity').textContent.includes('验证用户'),'Successful login must show account details');
        expect(!document.querySelector('.cloud-login-notice'),'Login hint must disappear after authentication');
        expect(draft.value==='保留这条未发送草稿','Successful login must retain draft');
        document.querySelector('.account-logout').click();await tick();
        expect(document.querySelector('#cloud-username'),'Logout must return to settings login');
        expect(document.querySelector('#stable-main-navigation'),'Logout must keep the workspace');
        return true;
      })()`)
      console.log('CLOUD_STARTUP_RESULT', JSON.stringify({ shownAtMs: shownAt, cloudPendingAtReveal: true, finalState: expected }))
      clearTimeout(timer)
      app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
  })
})
require(path.join(repo, 'desktop/main.cjs'))
