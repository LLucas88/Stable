'use strict'
// Hidden component test: no live account, network, or user window interaction.
const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.resolve(__dirname, '../..')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-shared-ui-'))
app.setPath('userData', dataDir)
app.disableHardwareAcceleration()
let window
async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel:/^https?:/.test(details.url)}))
  window = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  const bundle = buildSync({stdin:{contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConversationWending} from './src/ConversationWending';
    const saved={a:'品牌 A'};window.calls={sms:0,refresh:0,selected:0,cancel:0};
    const choices=[{id:'a'.repeat(24),label:'品牌 A'},{id:'b'.repeat(24),label:'品牌 B'}];
    const state=(phase,extra={})=>({phase,channel:'0',detail:'测试状态',...extra});
    window.stable={extensions:{
      wendingBinding:async id=>state('unknown',{brandLabel:saved[id]}),
      prepareWending:async id=>({status:'ready',login:saved[id]?state('ready',{brandLabel:saved[id]}):state('choose_brand',{brands:choices})}),
      refreshWendingBrands:async()=>{window.calls.refresh++;return state('choose_brand',{brands:choices});},
      selectWendingBrand:async(value,id)=>{saved[id]=choices.find(item=>item.id===value).label;window.calls.selected++;return state('ready',{brandLabel:saved[id]});},
      sendWendingCode:async()=>{window.calls.sms++;throw Error('Unexpected SMS');},
      cancelWendingLogin:async()=>{window.calls.cancel++;return state('unknown');}
    }};
    function TestApp(){const [id,setId]=useState('a');const [epoch,setEpoch]=useState(0);window.showTask=setId;window.restartView=()=>setEpoch(x=>x+1);return <ConversationWending key={id+epoch} conversationId={id} running={false} active={true} autoOpen={true}/>;}
    createRoot(document.getElementById('root')).render(<TestApp/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text
  await window.loadURL('data:text/html,<div id="root"></div>')
  await window.webContents.executeJavaScript(bundle)
  const result = await window.webContents.executeJavaScript(`(async()=>{
    const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Shared UI condition timed out');};
    const expect=(value,message)=>{if(!value)throw Error(message);};
    const select=async value=>{const element=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30));document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!document.querySelector('dialog').open);};
    await wait(()=>document.querySelector('select'));
    expect(document.querySelector('h3').textContent==='选择品牌','Existing session must open brand selection');
    expect(!document.querySelector('input[type=tel]'),'Reopened session requested SMS');
    await select('b'.repeat(24));
    expect(document.querySelector('.conversation-wending-button').textContent.includes('品牌 B'),'Brand label not saved');
    window.showTask('new-task');await wait(()=>document.querySelector('dialog')?.open&&document.querySelector('select'));
    expect(!document.querySelector('input[type=tel]'),'New task requested a new SMS');
    await select('a'.repeat(24));
    window.showTask('a');await wait(()=>document.querySelector('dialog')?.open&&document.querySelector('select'));
    expect(document.querySelector('.conversation-wending-button').textContent.includes('品牌 B'),'Another task overwrote original brand');
    window.restartView();await new Promise(r=>setTimeout(r,80));await wait(()=>document.querySelector('select'));
    expect(document.querySelector('.conversation-wending-button').textContent.includes('品牌 B'),'Reopening lost the saved brand');
    expect(window.calls.sms===0,'Unexpected SMS on brand switch');
    return window.calls;
  })()`)
  console.log('WENDING_SHARED_UI_PASSED',JSON.stringify(result))
  window.destroy();app.exit(0)
}
run().catch(error=>{console.error('WENDING_SHARED_UI_FAILED',error.message);window?.destroy();app.exit(1)})
process.on('exit',()=>{try{fs.rmSync(dataDir,{recursive:true,force:true})}catch{}})
