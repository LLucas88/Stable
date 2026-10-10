'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/composer-interaction')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  win.webContents.on('console-message', (_event, level, message) => { if(level >= 2) console.error(message) })
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function AgentPage(', 'export function AgentPage(')
  const bundle = (await build({ stdin: { contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {AgentPage} from './src/App';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
    const conversations=['a','b'].map((id)=>({id,title:id==='a'?'当前任务':'问鼎数据查询',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false,messageCount:id==='a'?0:1}));
    const initial={activeConversationId:'a',conversations,messages:[],data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{}, releasePreparation, rejectRun; window.decisions=[];window.started=[];window.uiErrors=[];window.preparing=false;window.mode='preparing';window.releasePreparation=()=>releasePreparation();
    const state=(id)=>({...initial,activeConversationId:id});
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},agent:{
      onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>{if(window.mode==='preparing'){window.preparing=true;await new Promise(resolve=>releasePreparation=resolve)}return state(id)},cancel:async()=>{rejectRun?.(new Error('已取消'));return true},
      run:(id)=>{window.started.push(id);return new Promise((resolve,reject)=>{rejectRun=reject})},
      answerApproval:async(id,request,decision)=>{window.decisions.push({id,request,decision});await new Promise(r=>setTimeout(r,70));return true},
    }};
    window.approval=(id,key,status='running')=>listener({conversationId:id,runId:'run-'+id,id:key,requestId:key,kind:'approval',status,title:'需要权限审批',time:Date.now(),toolName:'crm-brand-cli third login switch-brand',reason:'需要确认当前品牌切换',approvalCategory:'相同命令、参数和访问范围'});
    window.finish=(id,status)=>listener({conversationId:id,runId:'run-'+id,id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务结束',time:Date.now()});
    function Test(){const [value,setValue]=useState(initial);return <AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)

  await win.webContents.executeJavaScript(`
    window.tick=()=>new Promise(r=>setTimeout(r,50));
    window.wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick()}throw Error('UI wait timeout: '+fn.toString())};
    window.expect=(ok,message)=>{if(!ok)throw Error(message)};
    window.type=async value=>{const el=document.querySelector('#agent-prompt');el.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await tick()};
    undefined;
  `)
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelector('#agent-prompt'));
    expect(!!document.querySelector('.conversation-empty'),'New conversation should show welcome');
    await type('首个任务');document.querySelector('.composer-send').click();await wait(()=>window.preparing);
    document.querySelector('.composer-stop').click();window.releasePreparation();
    await wait(()=>document.body.innerText.includes('已取消')&&document.querySelector('#agent-prompt').value==='首个任务');
    expect(!document.querySelector('.conversation-empty'),'Cancellation restored welcome');
    expect(!document.querySelector('.conversation[data-empty]'),'Cancellation centered composer');
    expect(document.querySelector('.user-turn-stack')?.textContent.includes('首个任务'),'Cancelled prompt disappeared');
    expect(window.started.length===0,'Cancelled preparation dispatched to model');
    await type('前后');document.querySelector('#agent-prompt').setSelectionRange(1,1);
  })()`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['alt']})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['alt']})
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelector('#agent-prompt').value==='前\\n后');
    await wait(()=>document.querySelector('#agent-prompt').selectionStart===2);
    expect(window.started.length===0,'Alt+Enter sent message');
  })()`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['shift']})
  win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers:['shift']})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['shift']})
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelector('#agent-prompt').value==='前\\n\\n后');
    window.mode='running';await type('第二个任务');
  })()`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'})
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>window.started.length===1);
    expect(document.querySelector('.user-turn-stack')?.textContent.includes('首个任务'),'Next send erased previous cancelled turn');
    document.querySelector('.composer-stop').click();
    await wait(()=>document.querySelector('#agent-prompt').value==='第二个任务');
    expect(!document.querySelector('.conversation-empty'),'Dispatched cancellation restored welcome');
    expect(document.querySelectorAll('.user-turn-stack').length===2,'Cancelled turns duplicated or lost');
    document.querySelector('[data-conversation-id="b"] .conversation-select').click();await tick();
    expect(!!document.querySelector('.conversation-empty'),'Unrelated conversation inherited cancelled state');
    document.querySelector('[data-conversation-id="a"] .conversation-select').click();await tick();
    expect(!document.querySelector('.conversation-empty'),'Switching conversations lost cancellation');
    expect(document.querySelectorAll('.user-turn-stack').length===2,'Switching lost messages');
    expect(window.uiErrors.length===0,'Unexpected UI errors');
  })()`)
  console.log('COMPOSER_INTERACTION_UI_PASSED')
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
