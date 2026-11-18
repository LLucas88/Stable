const {app,BrowserWindow,session}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'qa-artifacts/update-notice')
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(out,'profile-')));app.disableHardwareAcceleration()
async function main(){
 await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((r,cb)=>cb({cancel:/^https?:/.test(r.url)}))
 const result=await require('esbuild').build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {UpdateNotice} from './src/UpdateNotice';const root=createRoot(document.getElementById('root'));window.render=(status,oneClick=true)=>flushSync(()=>root.render(<UpdateNotice update={{status,oneClick,progress:76,currentVersion:'1'}}/>));window.render('downloading')`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'notice.js',define:{'process.env.NODE_ENV':'"production"'}})
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text
 const html=path.join(out,'fixture.html');fs.writeFileSync(html,`<meta charset="utf-8"><style>body{background:#f6f7f5;font-family:'Segoe UI','Microsoft YaHei'}</style><style>${css}</style><div id="root"></div><script>${js}</script>`)
 const win=new BrowserWindow({show:false,width:800,height:480,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}})
 await win.loadFile(html)
 const run=source=>win.webContents.executeJavaScript(source,true)
 assert.equal(await run(`document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')`),'76')
 assert.equal(await run(`document.querySelectorAll('button,img,aside,details').length`),0)
 fs.writeFileSync(path.join(out,'notice.png'),(await win.webContents.capturePage()).toPNG())
 for(const status of ['checking','available','downloaded']){await run(`render('${status}')`);assert.equal(await run(`document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')`),false)}
 for(const status of ['installing','current','error']){await run(`render('${status}')`);assert.equal(await run(`document.getElementById('root').children.length`),0)}
 await run(`render('downloading',false)`);assert.equal(await run(`document.getElementById('root').children.length`),0)
 process.stdout.write('UPDATE_NOTICE_UI_PASS: progress, pending, handoff, failure, background download\n');win.destroy();app.quit()
}
main().catch(e=>{process.stderr.write(e.stack);app.exit(1)})
