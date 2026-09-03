const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const { mkdtempSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const directory=mkdtempSync(path.join(os.tmpdir(),'stable-unread-ui-'))
app.setPath('userData',directory);app.disableHardwareAcceleration()
let window
async function run(){
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
  window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}})
  const bundle=buildSync({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {useConversationUnread} from './src/use-conversation-unread';
    function Test(){const [view,setView]=useState(['a',true]);const state=useConversationUnread(view[0],view[1]);window.setView=setView;window.unread=state;window.lateComplete ||=state.markCompleted;return <p>{JSON.stringify([...state.unread])}</p>};createRoot(document.getElementById('root')).render(<Test/>);`,loader:'tsx',resolveDir:path.join(__dirname,'../..')},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text
  await window.loadURL('data:text/html,<div id="root"></div>')
  await window.webContents.executeJavaScript(bundle)
  await window.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,40));const expect=(yes,message)=>{if(!yes)throw Error(message)};
    for(let i=0;i<100&&!window.unread;i++)await tick();
    let focused=true,visible=true;
    document.hasFocus=()=>focused;Object.defineProperty(document,'visibilityState',{get:()=>visible?'visible':'hidden'});
    window.unread.markCompleted('a');await tick();expect(!window.unread.unread.has('a'),'Visible active task must be read');
    window.unread.markCompleted('b');window.unread.markCompleted('c');await tick();expect(window.unread.unread.size===2,'Background tasks must be unread');
    window.setView(['b',true]);await tick();expect(!window.unread.unread.has('b')&&window.unread.unread.has('c'),'Opening one task must only clear that task');
    window.setView(['b',false]);await tick();window.lateComplete('b');await tick();expect(window.unread.unread.has('b'),'Other page must not count as viewing');
    window.setView(['b',true]);await tick();expect(!window.unread.unread.has('b'),'Returning to task did not clear');
    focused=false;window.lateComplete('b');await tick();expect(window.unread.unread.has('b'),'Unfocused window must retain unread');
    focused=true;window.dispatchEvent(new Event('focus'));await tick();expect(!window.unread.unread.has('b'),'Window refocus did not clear');
    visible=false;window.lateComplete('b');await tick();expect(window.unread.unread.has('b'),'Hidden window must retain unread');
    visible=true;document.dispatchEvent(new Event('visibilitychange'));await tick();expect(!window.unread.unread.has('b'),'Visible window did not clear');
    window.lateComplete('b');await tick();expect(!window.unread.unread.has('b'),'Late callback used stale conversation');
    window.lateComplete('a');await tick();expect(window.unread.unread.has('a'),'Late background completion missing');
    window.unread.markRead('a');await tick();expect(!window.unread.unread.has('a')&&window.unread.unread.has('c'),'Starting/rereading must only reset specified task');
  })()`)
  console.log('CONVERSATION_UNREAD_UI_PASSED');window.destroy();app.exit(0)
}
run().catch(error=>{console.error(error.message);window?.destroy();app.exit(1)})
process.on('exit',()=>{try{rmSync(directory,{recursive:true,force:true})}catch{}})
