const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),output=path.join(root,'qa-artifacts/clarification-card')
fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'profile-')));app.disableHardwareAcceleration()
let win
async function main(){
 await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
 win=new BrowserWindow({show:false,width:1180,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}})
 const bundle=(await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ClarificationCard} from './src/ClarificationCard';
 let time=1000; Date.now=()=>time;window.advance=n=>time+=n;window.sent=[];window.timers={};window.fail=false;
 window.stable={agent:{clarificationTimer:async(conv,id,action)=>{const s=window.timers[id]||={id,deadline:time+20000,interacted:false};if(action==='interact')s.interacted=true;return {...s}}}};
 const question={id:'first',status:'waiting',question:'删除对话时如何处理历史记录？',hint:'这会影响后续能否查阅聊天。你也可以补充需要保留的内容和范围。',options:[{label:'删除对话及其聊天记录',description:'清理聊天历史，项目文件仍保留。'},{label:'仅从列表移除，保留历史',description:'隐藏当前入口，之后仍可恢复查看。'}]};
 function Test(){const [id,setId]=useState('first'),[visible,setVisible]=useState(true);window.show=(next,visible=true)=>{setId(next);setVisible(visible)};return <main style={{maxWidth:880,margin:'80px auto',padding:20}}><p style={{marginBottom:30}}>我理解你要整理项目与对话菜单。这里有一个会影响历史记录的选择。</p>{visible&&<ClarificationCard key={id} question={{...question,id}} conversationId="a" onSend={async response=>{if(window.fail)throw Error('发送失败，请重试');window.sent.push(response)}}/>}<div style={{padding:20,borderRadius:24,background:'var(--color-paper-3)',marginTop:12}}>给 Stable 一个任务…</div></main>}
 createRoot(document.getElementById('root')).render(<Test/>);
 `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><head></head><body style="margin:0;background:var(--color-paper);color:var(--color-ink);font-family:Segoe UI,sans-serif"><div id="root"></div></body></html>'))
 await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/tokens.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/app.css'),'utf8'))
 await win.webContents.executeJavaScript(bundle)
 const run=code=>win.webContents.executeJavaScript(code),settle=()=>new Promise(r=>setTimeout(r,260))
 await settle()
 assert.equal(await run('document.querySelectorAll("input[type=radio]").length'),3)
 assert.equal(await run('document.querySelector(".clarification-send").textContent'),'发送 (20s)')
 fs.writeFileSync(path.join(output,'card-light.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'card-light.jpg'),(await win.webContents.capturePage()).toJPEG(75))
 await run('window.advance(19999)');await settle();assert.equal(await run('window.sent.length'),0)
 await run('document.querySelector(".clarification-card h3").click();window.advance(1)');await settle()
 assert.equal(await run('window.sent.length'),0);assert.equal(await run('document.querySelector(".clarification-send").textContent'),'发送')
 await run('window.show("first",false)');await settle();await run('window.show("first");window.advance(30000)');await settle();assert.equal(await run('window.sent.length'),0)
 await run('document.querySelectorAll("input[type=radio]")[1].click();document.querySelector(".clarification-send").click();document.querySelector(".clarification-send").click()');await settle()
 assert.deepEqual(await run('window.sent'),[{id:'first',source:'choice',option:1}])
 await run('window.show("timeout")');await settle();await run('window.advance(20000)');await settle();await settle()
 assert.deepEqual(await run('window.sent.at(-1)'),{id:'timeout',source:'timeout'});assert.equal(await run('window.sent.length'),2)
 await run('window.show("keyboard")');await settle();await run('document.querySelector("input[type=radio]").dispatchEvent(new FocusEvent("focusin",{bubbles:true}));window.advance(20000)');await settle()
 assert.equal(await run('window.sent.length'),2);assert.equal(await run('document.querySelector(".clarification-send").textContent'),'发送')
 await run('document.querySelector("textarea").focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(document.querySelector("textarea"),"请保留最近三个月");document.querySelector("textarea").dispatchEvent(new Event("input",{bubbles:true}))');await settle()
 await run('document.querySelector(".clarification-send").click()');await settle();assert.deepEqual(await run('window.sent.at(-1)'),{id:'keyboard',source:'custom',text:'请保留最近三个月'})
 for(const [id,selector] of [['skip','.clarification-buttons button'],['close','.clarification-card-heading button']]){await run(`window.show('${id}')`);await settle();await run(`document.querySelector('${selector}').click()`);await settle();assert.equal(await run('window.sent.at(-1).source'),id)}
 await run('window.show("failure");window.fail=true');await settle();await run('window.advance(20000)');await settle();assert.match(await run('document.querySelector("[role=alert]").textContent'),/发送失败/)
 const sent=await run('window.sent.length');await run('window.advance(30000)');await settle();assert.equal(await run('window.sent.length'),sent)
 await run('window.fail=false;document.querySelector(".clarification-send").click()');await settle();assert.equal(await run('window.sent.length'),sent+1)
 await run('window.show("narrow");document.documentElement.dataset.theme="dark"');win.setSize(430,850);await settle()
 assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'),true)
 fs.writeFileSync(path.join(output,'card-narrow-dark.png'),(await win.webContents.capturePage()).toPNG())
 console.log('CLARIFICATION_CARD_UI_PASSED');win.destroy();app.quit()
}
main().catch(error=>{console.error(error);if(win&&!win.isDestroyed())win.destroy();app.exit(1)})
