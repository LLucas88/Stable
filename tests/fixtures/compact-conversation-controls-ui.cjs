'use strict'
// Hidden renderer, mock IPC and isolated profile; no live accounts or API calls.
const {app,BrowserWindow,session}=require('electron')
const {build}=require('esbuild'),fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),output=path.join(root,'qa-artifacts/compact-conversation-controls')
fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'profile-')));app.disableHardwareAcceleration()
let win
async function main(){
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}))
  win=new BrowserWindow({show:false,width:960,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}})
  const bundle=(await build({stdin:{contents:`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{ConversationTools}from'./src/ConversationTools';import{EffortSlider}from'./src/EffortSlider';
    window.calls={browser:0,jump:0,prepare:0,cancel:0};
    window.stable={extensions:{wendingBinding:async()=>({phase:'unknown',channel:'0'}),cancelWendingLogin:async()=>{window.calls.cancel++},prepareWending:()=>{window.calls.prepare++;return new Promise(()=>{})}}};
    function Fixture(){const[running,setRunning]=useState(false),[chapters,setChapters]=useState([{messageId:'answer',title:'经营亮点',seq:1}]),[value,setValue]=useState('high');
      window.setRunning=setRunning;window.restoreChapters=()=>setChapters([{messageId:'answer',title:'经营亮点',seq:1}]);
      return <><header className="conversation-topbar"><div><strong>经营分析报告</strong></div><ConversationTools conversationId="fixture" active running={running} autoOpenWending={false} chapters={chapters} chapterError="" onBrowser={()=>window.calls.browser++} onJump={async()=>{window.calls.jump++}} onChange={async(id,title)=>setChapters(title?[{messageId:id,title,seq:1}]:[])}/></header><main><p>本次报告已完成。</p><button id="outside">对话正文</button></main><div className="model-effort-control" style={{position:'absolute',right:30,bottom:40}}><div className="effort-popover"><EffortSlider options={[{id:'auto',label:'默认'},{id:'low',label:'低'},{id:'medium',label:'中'},{id:'high',label:'高'},{id:'max',label:'最高'}]} value={value} model="DEEPSEEK-FLASH" onChange={setValue} onModels={()=>window.calls.models=true}/></div></div></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div id="root"></div></body></html>'))
  for(const file of ['tokens.css','app.css','workbench-surfaces.css','answer-tools.css','conversation-tools.css'])await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',file),'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh}main{padding:40px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await win.webContents.executeJavaScript(`window.tick=()=>new Promise(r=>setTimeout(r,70));window.expect=(ok,msg)=>{if(!ok)throw Error(msg)};window.menu=()=>document.querySelector('.conversation-tools-panel');window.openMenu=async()=>{document.querySelector('.conversation-tools-trigger').click();await tick()};window.key=k=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));undefined`)
  await win.webContents.executeJavaScript(`(async()=>{
    await tick();expect(!menu(),'menu initially open');expect(!document.querySelector('.conversation-wending-button'),'old trigger remains');
    await openMenu();expect(menu().querySelectorAll('[role=menuitem]').length===3,'wrong menu items');expect(document.activeElement.textContent==='浏览器','initial focus');
    key('ArrowDown');expect(document.activeElement.textContent.startsWith('章节'),'arrow navigation');key('End');expect(document.activeElement.textContent==='问鼎','end navigation');key('Escape');await tick();expect(!menu()&&document.activeElement.classList.contains('conversation-tools-trigger'),'escape/focus');
    await openMenu();document.querySelector('#outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));await tick();expect(!menu(),'outside dismissal');
    await openMenu();menu().querySelector('button').click();await tick();expect(window.calls.browser===1&&!menu(),'browser action');
    await openMenu();menu().querySelectorAll('button')[1].click();await tick();expect(menu()?.dataset.view==='chapters','chapter view lost focus');
    document.querySelector('[aria-label="重命名章节 经营亮点"]').click();await tick();expect(menu(),'rename closed menu');
    const input=document.querySelector('[aria-label="章节名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'新的章节');input.dispatchEvent(new Event('input',{bubbles:true}));await tick();document.querySelector('[aria-label="保存章节名称"]').click();await tick();expect(document.querySelector('.chapter-jump')?.textContent==='新的章节','rename failed');
    document.querySelector('.chapter-jump').click();await tick();expect(window.calls.jump===1&&!menu(),'jump did not dismiss');
    await openMenu();menu().querySelectorAll('button')[1].click();await tick();document.querySelector('[aria-label="取消固定章节 新的章节"]').click();await tick();expect(menu()?.textContent.includes('点击图钉'),'unpin/empty state');
    document.querySelector('[aria-label="返回对话功能"]').click();await tick();expect(menu()?.dataset.view==='menu','back');menu().querySelectorAll('button')[2].click();await tick();expect(!menu()&&document.querySelector('dialog').open&&window.calls.prepare===1,'Wending did not open');document.querySelector('dialog button').click();await tick();expect(!document.querySelector('dialog').open&&document.activeElement.classList.contains('conversation-tools-trigger'),'Wending close/focus');
    window.setRunning(true);await tick();await openMenu();expect(menu().querySelectorAll('button')[2].disabled,'running Wending guard');key('End');expect(document.activeElement.textContent==='章节','disabled item focus');key('Escape');await tick();
    const box=document.querySelector('.effort-popover'),css=getComputedStyle(box);expect(box.getBoundingClientRect().width===256,'popup width');expect(css.borderTopWidth==='1px'&&css.boxShadow!=='none','border/shadow overridden');expect(document.querySelector('.effort-slider-track').getBoundingClientRect().height===24,'slider track size');
    const slider=document.querySelector('input[type=range]');slider.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'1');slider.dispatchEvent(new Event('input',{bubbles:true}));await tick();key('ArrowLeft');slider.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowLeft',bubbles:true}));await tick();expect(slider.getAttribute('aria-valuetext')==='低','slider update');document.querySelector('[aria-label="恢复默认思考强度"]').click();await tick();expect(slider.getAttribute('aria-valuetext')==='默认','reset');document.querySelector('[aria-label="展开模型选择"]').click();expect(window.calls.models,'model switch');
    window.setRunning(false);await tick();await openMenu();
  })()`)
  for(const theme of ['light','dark']){
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='${theme}'`)
    fs.writeFileSync(path.join(output,theme+'.png'),(await win.webContents.capturePage()).toPNG())
  }
  console.log('CONVERSATION_TOOLS_UI_PASSED: menu actions, keyboard, dismissal, chapters, Wending guard, compact slider')
  win.destroy();app.exit(0)
}
main().catch(e=>{console.error(e);win?.destroy();app.exit(1)})
