'use strict'
const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const out = path.join(root, 'qa-artifacts/wending-task-ui')
fs.mkdirSync(out, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(out, 'profile-')))
app.disableHardwareAcceleration()
let win
async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1050, height: 750, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } })
  const bundle = buildSync({ stdin: { contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConversationWending} from './src/ConversationWending';
    window.calls=[];const record=(op,id)=>calls.push({op,id});
    const signed=()=>({phase:'signed_out',channel:'0',detail:'请登录此任务的账号'});
    window.stable={extensions:{
      wendingBinding:async id=>({phase:'unknown',channel:'0',detail:'尚未核验',brandLabel:id==='a'?'品牌 A':'品牌 B'}),
      prepareWending:async id=>{record('prepare',id);if(window.delayed)return new Promise(r=>window.finishPrepare=()=>r({status:'ready',login:{phase:'ready',channel:'0',detail:'旧任务结果',brandLabel:'旧结果'}}));return {status:'ready',login:signed()}},
      cancelWendingLogin:async id=>{record('cancel',id);return signed()},
      sendWendingCode:async(mobile,channel,id)=>{if(mobile!=='13800000000'||channel!=='1')throw Error('Wrong form values');record('send',id);return {phase:'code_sent',channel,detail:'验证码已发送'}},
      verifyWendingCode:async(code,id)=>{if(code!=='654321')throw Error('Wrong code');record('verify',id);return {phase:'choose_brand',channel:'1',detail:'请选择品牌',brands:[{id:'c'.repeat(24),label:'独立品牌 A'}]}},
      selectWendingBrand:async(choice,id)=>{record('brand',id);return {phase:'ready',channel:'1',detail:'登录完成',brandLabel:'独立品牌 A'}},
    }};
    function Test(){const [id,setId]=useState('a'),[running,setRunning]=useState(false),[active,setActive]=useState(true);window.selectTask=setId;window.setRunning=setRunning;window.setActive=setActive;return <header className='conversation-topbar'><div><span>当前任务</span><strong>任务 {id.toUpperCase()}</strong></div><ConversationWending key={id} conversationId={id} running={running} active={active}/></header>};
    createRoot(document.getElementById('root')).render(<Test/>);
  `, loader: 'tsx', resolveDir: root }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div id="root"></div></body></html>'))
  for (const name of ['tokens.css','app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',name),'utf8'))
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await win.webContents.executeJavaScript(`(async()=>{
    window.tick=()=>new Promise(r=>setTimeout(r,40));window.expect=(ok,msg)=>{if(!ok)throw Error(msg)};
    window.wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick()}throw Error('UI timeout: '+fn.toString())};
    window.change=async(selector,value)=>{const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick()};
    await wait(()=>document.querySelector('.conversation-wending-button')?.textContent.includes('品牌 A'));
    document.querySelector('.conversation-wending-button').click();await wait(()=>document.querySelector('input[type=tel]'));
    expect(calls.filter(x=>x.op==='send').length===0,'Must never send SMS automatically');
    await change('select','1');await change('input[type=tel]','13800000000');document.querySelector('form').requestSubmit();await wait(()=>document.querySelector('input[autocomplete=one-time-code]'));
    await change('input[autocomplete=one-time-code]','654321');document.querySelector('form').requestSubmit();await wait(()=>document.querySelector('select option[value="'+ 'c'.repeat(24)+'"]'));
  })()`)
  fs.writeFileSync(path.join(out,'task-login.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    await change('select','c'.repeat(24));document.querySelector('form').requestSubmit();await wait(()=>!document.querySelector('dialog').open);
    expect(document.querySelector('.conversation-wending-button').textContent.includes('独立品牌 A'),'Saved brand appears in task header');
    expect(calls.filter(x=>['send','verify','brand'].includes(x.op)).every(x=>x.id==='a'),'All credential operations must bind original task');
    selectTask('b');await wait(()=>document.querySelector('.conversation-wending-button').textContent.includes('品牌 B'));
    expect(!document.body.innerText.includes('独立品牌 A'),'Brand must not leak to another task');
    setRunning(true);await tick();expect(document.querySelector('.conversation-wending-button').disabled,'Cannot rebind running task');setRunning(false);await tick();
    window.delayed=true;document.querySelector('.conversation-wending-button').click();await wait(()=>window.finishPrepare);
    selectTask('a');await wait(()=>document.querySelector('.conversation-wending-button').textContent.includes('品牌 A'));finishPrepare();await tick();
    expect(!document.body.innerText.includes('旧结果'),'Late result must not affect another task');expect(calls.some(x=>x.op==='cancel'&&x.id==='b'),'Switching task disposes only old login worker');
    window.delayed=false;document.querySelector('.conversation-wending-button').click();await wait(()=>document.querySelector('input[type=tel]'));await change('input[type=tel]','13800000000');
    setActive(false);await wait(()=>!document.querySelector('dialog').open);setActive(true);await tick();document.querySelector('.conversation-wending-button').click();await wait(()=>document.querySelector('input[type=tel]'));
    expect(document.querySelector('input[type=tel]').value==='','Leaving page clears private form values');
  })()`)
  console.log('WENDING_TASK_UI_PASSED');win.destroy();app.exit(0)
}
run().catch(error=>{console.error(error.stack);win?.destroy();app.exit(1)})
