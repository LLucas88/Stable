'use strict'
const prepareVisualFixture = require('../helpers/visual-fixture.cjs')
const { readSource } = require('./../helpers/read-source.cjs')
// Isolated renderer, fixture keys and blocked network; no user's app or data.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/appearance-presets')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } })
  const bundle = await build({ stdin: { contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ModelConnectionSettings}from'./src/ModelConnectionSettings';
    let state={cloud:{status:'disabled'},models:{items:[],defaultModelId:''}};
    window.requests=[];window.stable={model:{save:async p=>{window.requests.push({...p});const {apiKey,...item}=p;state.models.items=[...state.models.items.filter(m=>m.id!==p.id),{...item,hasApiKey:true}];return state.models},setDefault:async id=>{state.models.defaultModelId=id}},bootstrap:async()=>state};
    function Test(){const[value,setValue]=useState(state),[key,setKey]=useState(0);window.reopen=()=>{setValue({...state});setKey(k=>k+1)};return <ModelConnectionSettings key={key} state={value} replaceState={v=>setValue({...v})}/>}
    createRoot(document.getElementById('settings')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  const css = ['tokens.css','app.css','workbench-surfaces.css','sidebar-layout.css','model-connection.css'].map(name=>readSource(path.join(root,'src/styles',name),'utf8')).join('\n')
  const video = pathToFileURL(path.join(root,'src/assets/bloub-2.mp4')).href
  const html = `<html data-theme="light"><head><meta charset="utf-8"><style>${css}
    body{background:var(--color-paper)}#root{display:flex;padding:20px;gap:20px}.rail-task-pane{width:190px;flex:none;padding:20px}.main-frame{flex:1;padding:20px}.conversation{display:block}.message-scroll{padding:10px!important}.conversation-empty{min-height:0}.composer-box{height:80px;padding:16px}.model-connection-settings{max-width:550px;margin-top:15px}.conversation-start-animation{width:56px;height:56px}
  </style></head><body><div id="root"><aside class="rail-task-pane">项目任务栏</aside><main class="main-frame"><div class="conversation" data-empty="true"><div class="message-scroll"><div class="conversation-empty"><video class="conversation-start-animation" src="${video}" muted preload="auto"></video><h2>准备好了，随时开始</h2></div></div><div class="composer-box">输入框</div></div><div id="settings"></div></main></div></body></html>`
  const file=path.join(output,'fixture.html');fs.writeFileSync(file,html);await win.loadFile(file)
  await prepareVisualFixture(win)
  await win.webContents.executeJavaScript(bundle.outputFiles[0].text)
  const js=code=>win.webContents.executeJavaScript(code)
  await js(`new Promise(resolve=>setTimeout(resolve,100))`)
  for(const theme of ['light','dark']) {
    const expected=theme==='dark'?{main:'rgb(40, 42, 54)',rail:'rgb(36, 39, 45)',composer:'rgb(67, 68, 78)',corner:[54,42,40]}:{main:'rgb(255, 255, 255)',rail:'rgb(252, 252, 252)',composer:'rgb(255, 255, 255)',corner:[255,255,255]}
    await js(`document.documentElement.dataset.theme='${theme}'`)
    for(const [name,selector] of [['main','.main-frame'],['rail','.rail-task-pane'],['composer','.composer-box']]) assert.equal(await js(`getComputedStyle(document.querySelector('${selector}')).backgroundColor`),expected[name])
    assert.equal(await js(`getComputedStyle(document.querySelector('.message-scroll')).maskImage`),'none')
    await js(`document.querySelector('.conversation').dataset.empty='false'`)
    assert.notEqual(await js(`getComputedStyle(document.querySelector('.message-scroll')).maskImage`),'none')
    await js(`document.querySelector('.conversation').dataset.empty='true'`)
    for(const time of [1,5,10]) {
      await js(`new Promise((resolve,reject)=>{const v=document.querySelector('video');v.onerror=()=>reject(Error('Video decode failed'));v.onseeked=()=>setTimeout(resolve,80);v.currentTime=${time}})`)
      const rect=await js(`(()=>{const r=document.querySelector('video').getBoundingClientRect();return{x:Math.round(r.x+2),y:Math.round(r.y+2),width:1,height:1}})()`)
      const pixel=[...(await win.webContents.capturePage(rect)).toBitmap().subarray(0,3)]
      assert.deepEqual(pixel,expected.corner,`${theme} video corner at ${time}s`)
    }
    fs.writeFileSync(path.join(output,theme+'.png'),(await win.webContents.capturePage()).toPNG())
  }
  await js(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,80)),expect=(v,m)=>{if(!v)throw Error(m)};
    const select=()=>document.querySelector('.model-connection-settings select');
    const ids=['direct-deepseek-flash','direct-zhipu-glm-5-3-flash'];
    expect(ids.every(id=>[...select().options].some(o=>o.value===id)),'Missing fresh-install preset');
    expect([...select().options].some(o=>o.value===ids[0]&&o.textContent.includes('DeepSeek-V4.1-Flash-1017')),'Missing Flash 1017 display name');
    for(const id of ids){
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select(),id);select().dispatchEvent(new Event('change',{bubbles:true}));await tick();
      expect(document.querySelector('[type=submit]').disabled,'Empty key should not save');
      const input=document.querySelector('[name=api-key]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'fixture-'+id);input.dispatchEvent(new Event('input',{bubbles:true}));await tick();
      document.querySelector('form').requestSubmit();await tick();expect(document.querySelector('[role=status]'),'Save status missing');
      expect(document.querySelector('[name=api-key]').value==='','Saved key visible');
    }
    expect(window.requests[1].baseURL==='https://open.bigmodel.cn/api/paas/v4'&&window.requests[1].model==='glm-5.3-flash','GLM request route wrong');
    window.reopen();await tick();expect(select().value===ids[1],'Saved GLM default not restored');
    expect(ids.every(id=>[...select().options].some(o=>o.value===id&&o.textContent.includes('已配置'))),'Saved provider missing on reopen');
    expect(!document.body.innerText.includes('fixture-direct'),'Key leaked into displayed text');
  })()`)
  console.log('APPEARANCE_PRESETS_UI_PASSED: both themes, video pixels, both preset saves and reopen')
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
