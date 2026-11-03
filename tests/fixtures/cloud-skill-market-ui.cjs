'use strict'
const { app, BrowserWindow, session } = require('electron'), { build } = require('esbuild'), fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/cloud-skills')
fs.mkdirSync(output, { recursive: true }); app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-'))); app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady(); session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } })
  const bundle = (await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SkillMarket} from './src/SkillMarket';
  let item={id:'filtered-demo',name:'下载测试',description:'共享资源',content:'',kind:'skill',group:'Test',version:'1',cloudDownload:true,bundled:true,installed:false,enabled:false,downloadBytes:1024};
  window.stable={market:{list:async()=>[item],detail:async()=>item,use:async()=>{if(window.rejectDownload)throw Error('请先登录 Stable');await new Promise(resolve=>window.finishDownload=resolve);item={...item,installed:true,enabled:true};return {}}}};
  createRoot(document.getElementById('root')).render(<SkillMarket onUse={()=>window.used=true} renderContent={c=><pre>{c}</pre>}/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"./"' } })).outputFiles[0].text
  await win.loadURL('data:text/html,<div id="root"></div>'); await win.webContents.executeJavaScript(bundle)
  await win.webContents.executeJavaScript(`(async()=>{const tick=()=>new Promise(r=>setTimeout(r,80)),expect=(v,m)=>{if(!v)throw Error(m)};await tick();document.querySelector('.market-row-copy').click();await tick();expect(document.querySelector('dialog .primary').textContent==='下载并使用','download label');window.rejectDownload=true;document.querySelector('dialog .primary').click();await tick();expect(document.querySelector('dialog [role=alert]').textContent.includes('登录'),'login error');window.rejectDownload=false;document.querySelector('dialog .primary').click();await tick();expect(document.querySelector('dialog .primary').disabled,'busy state');expect(document.querySelector('dialog [role=status]').textContent.includes('下载'),'download status');window.finishDownload();await tick();expect(window.used,'conversation handoff');expect(document.querySelector('dialog .primary').textContent==='在对话中试用','installed state')})()`)
  console.log('CLOUD_SKILL_MARKET_UI_PASS'); win.destroy(); app.exit(0)
}
main().catch(error => { console.error(error.stack); win?.destroy(); app.exit(1) })
