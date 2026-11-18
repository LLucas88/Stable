'use strict'
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
app.setPath('userData', process.argv[2])
app.disableHardwareAcceleration()
let win

async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 860, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  const bundle = (await build({
    stdin: { contents: `
      import {createRoot} from 'react-dom/client';
      import {DevUpdateNotice} from './src/DevUpdateNotice';
      const listeners=new Set();let root;
      window.snapshots=[];window.calls=[];window.applies=[];window.unsubscribed=0;
      const api={
        state:()=>new Promise((resolve,reject)=>window.snapshots.push({resolve,reject})),
        apply:revision=>{window.calls.push(revision);return new Promise((resolve,reject)=>window.applies.push({resolve,reject}))},
        onState:handler=>{listeners.add(handler);return()=>{listeners.delete(handler);window.unsubscribed++}},
      };
      window.emit=value=>listeners.forEach(handler=>handler(value));
      window.listenerCount=()=>listeners.size;
      window.mount=withAPI=>{window.stable=withAPI?{development:api}:{};root=createRoot(document.getElementById('root'));root.render(<DevUpdateNotice/>)};
      window.unmount=()=>root.unmount();
      window.state=(revision,action='restart',message='',applying=false,enabled=true,blocked=false)=>({enabled,revision,action,applying,message,blocked});
      window.mount(false);
    `, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
  })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><body><input id="draft" aria-label="任务草稿" value="正在编辑的内容"><div id="root"></div></body></html>'))
  await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/dev-update-notice.css'), 'utf8'))
  await win.webContents.executeJavaScript(bundle)
  const run = code => win.webContents.executeJavaScript(code)
  const settle = () => new Promise(resolve => setTimeout(resolve, 90))
  const noticeCount = () => run('document.querySelectorAll(".dev-update-notice").length')
  await settle()
  assert.equal(await noticeCount(), 0, 'older preloads without the optional API remain supported')
  await run('window.unmount();window.mount(true)'); await settle()
  assert.equal(await run('window.listenerCount()'), 1)
  assert.equal(await run('window.snapshots.length'), 1)
  await run('document.getElementById("draft").focus();window.emit(window.state(1))'); await settle()
  assert.equal(await noticeCount(), 1)
  assert.equal(await run('document.activeElement.id'), 'draft', 'notification must not steal editor focus')
  assert.equal(await run('document.querySelector(".dev-update-notice p").textContent'), '源码有更新')
  await run('window.snapshots[0].resolve(window.state(0,null));window.notice=document.querySelector(".dev-update-notice")'); await settle()
  assert.equal(await noticeCount(), 1, 'a stale initial snapshot cannot remove a newer event')
  await run('window.emit(window.state(2));window.emit(window.state(3));window.emit(window.state(2))'); await settle()
  assert.equal(await run('window.notice===document.querySelector(".dev-update-notice")'), true)
  assert.deepEqual(await run('window.calls'), [], 'notifications must never request a restart themselves')
  await run('document.querySelector(".dev-update-notice button").click();document.querySelector(".dev-update-notice button").click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3])
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), true)
  await run('window.emit(window.state(4));window.applies[0].resolve(window.state(3,null))'); await settle()
  assert.equal(await noticeCount(), 1, 'an old apply reply cannot hide a newer source revision')
  await run('document.querySelector(".dev-update-notice button").click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4])
  await run('window.applies[1].reject(new Error("重启未完成，请重试"))'); await settle()
  assert.match(await run('document.querySelector(".dev-update-notice small").textContent'), /重启未完成/)
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), false)
  await run('window.emit(window.state(4))'); await settle()
  assert.match(await run('document.querySelector(".dev-update-notice small").textContent'), /重启未完成/)
  await run('document.querySelector(".dev-update-notice button").click()'); await settle()
  await run('window.applies[2].resolve(window.state(4,null))'); await settle()
  assert.equal(await noticeCount(), 0)
  await run('window.emit(window.state(5,"reload"))'); await settle()
  assert.equal(await noticeCount(), 0, 'automatic renderer reloads need no notification')
  await run('window.emit(window.state(5,"reload","当前任务尚未结束"))'); await settle()
  assert.equal(await run('document.querySelector(".dev-update-notice button").textContent'), '刷新界面')
  assert.deepEqual(await run('window.calls'), [3, 4, 4])
  await run('document.querySelector(".dev-update-notice button").click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4, 4, 5])
  await run('window.emit(window.state(5,null));window.applies[3].resolve(window.state(5,"reload","",true))'); await settle()
  assert.equal(await noticeCount(), 0, 'same-revision event completion wins over an older apply reply')
  await run('window.emit(window.state(6,"restart","",true))'); await settle()
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), true)
  await run('document.querySelector(".dev-update-notice button").click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4, 4, 5])
  await run('window.emit(window.state(6,"restart","",false,false))'); await settle()
  assert.equal(await noticeCount(), 0, 'disabled development mode is invisible')
  await run('window.emit(window.state(7));window.previousButton=document.querySelector(".dev-update-notice button")'); await settle()
  await run('window.previousButton=document.querySelector(".dev-update-notice button");window.emit(window.state(8,"restart","源码检查中",false,true,true));window.previousButton.click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4, 4, 5], 'a just-blocked revision cannot run even before React updates the old button')
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), true)
  assert.match(await run('document.querySelector(".dev-update-notice small").textContent'), /源码检查中/)
  await run('window.emit(window.state(8,"restart","语法检查失败，请修复源码",false,true,true))'); await settle()
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), true)
  assert.match(await run('document.querySelector(".dev-update-notice small").textContent'), /语法检查失败/)
  await run('window.emit(window.state(8))'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4, 4, 5], 'unblocking never submits the earlier click')
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), false)
  await run('document.querySelector(".dev-update-notice button").click()'); await settle()
  assert.deepEqual(await run('window.calls'), [3, 4, 4, 5, 8])
  await run('window.applies[4].resolve(window.state(8,null))'); await settle()
  assert.equal(await noticeCount(), 0)
  await run('window.unmount()'); await settle()
  assert.equal(await run('window.listenerCount()'), 0)
  assert.equal(await run('window.unsubscribed'), 1)
  await run('window.mount(true)'); await settle()
  await run('window.snapshots[1].resolve(window.state(9,"restart","等待完成当前任务后重启"))'); await settle()
  assert.equal(await noticeCount(), 1, 're-mount recovers the host current state')
  await run('window.legacyState=window.state(9);delete window.legacyState.blocked;window.emit(window.legacyState)'); await settle()
  assert.equal(await run('document.querySelector(".dev-update-notice button").disabled'), false, 'older development bridges without blocked remain clickable')
  win.setSize(320, 480); await settle()
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'), true)
  assert.equal(await run('document.querySelectorAll("[role=dialog],[aria-modal=true]").length'), 0)
  await run('window.unmount();window.mount(true)'); await settle()
  await run('window.unmount();window.snapshots[2].resolve(window.state(10))'); await settle()
  assert.equal(await noticeCount(), 0, 'late snapshots after unmount are ignored')
  assert.equal(await run('window.listenerCount()'), 0)
  console.log('DEV_UPDATE_NOTICE_UI_PASSED')
  win.destroy(); app.quit()
}
main().catch(error => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1) })
