'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/approval-ui')
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
    const conversations=['a','b'].map((id)=>({id,title:id==='a'?'当前任务':'问鼎数据查询',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false}));
    const initial={activeConversationId:'a',conversations,messages:[],data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{}; window.decisions=[];window.started=[];window.uiErrors=[];
    const state=(id)=>({...initial,activeConversationId:id});
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},agent:{
      onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>state(id),
      run:(id)=>{window.started.push(id);return new Promise(()=>{})},
      answerApproval:async(id,request,decision)=>{window.decisions.push({id,request,decision});await new Promise(r=>setTimeout(r,70));return true},
    }};
    window.approval=(id,key,status='running')=>listener({conversationId:id,runId:'run-'+id,id:key,requestId:key,kind:'approval',status,title:'需要权限审批',time:Date.now(),toolName:'crm-brand-cli third login switch-brand',reason:'需要确认当前品牌切换',approvalCategory:'相同命令、参数和访问范围'});
    window.finish=(id,status)=>listener({conversationId:id,runId:'run-'+id,id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务结束',time:Date.now()});
    function Test(){const [value,setValue]=useState(initial);return <AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await win.webContents.executeJavaScript(`
    window.tick=()=>new Promise(r=>setTimeout(r,50));
    window.wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick()}throw Error('UI wait timeout: '+fn.toString()+'; '+document.body.innerText.slice(0,400))};
    window.expect=(ok,message)=>{if(!ok)throw Error(message)};
    window.type=async value=>{const el=document.querySelector('#agent-prompt');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await tick()};
    window.select=async id=>{document.querySelector('[data-conversation-id="'+id+'"] .conversation-select').click();await tick()};
    undefined;
  `)
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelector('#agent-prompt'));await select('b');await type('查询测试');document.querySelector('.composer-send').click();await wait(()=>started.includes('b'));
    await select('a');approval('b','b1');approval('b','b2');await wait(()=>document.querySelector('[data-conversation-id="b"][data-activity="approval"]'));
    expect(!document.querySelector('.approval-card'),'Old request card must be removed');
    const dot=document.querySelector('.conversation-approval-dot');expect(dot.getBoundingClientRect().width===8&&getComputedStyle(dot).visibility==='visible','Yellow dot must be visible');
    await tick();await tick();
    expect(document.querySelector('#agent-prompt'),'Other conversation must retain composer');
  })()`)
  fs.writeFileSync(path.join(output, 'background-dot.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    await select('b');await wait(()=>document.querySelector('.composer-approval'));
    expect(!document.querySelector('.conversation-approval-dot'),'Opening conversation clears yellow dot');
    expect(!document.querySelector('#agent-prompt'),'Pending approval hides text input');
    expect(!document.querySelector('.composer-actions'),'Pending approval hides normal tools');
    expect(document.querySelectorAll('.composer-approval button').length===3,'Exactly three decisions');
    expect(document.activeElement.textContent==='不允许','Focus begins at deny');
  })()`)
  fs.writeFileSync(path.join(output, 'approval-composer.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    const buttons=()=>document.querySelectorAll('.composer-approval button');buttons()[1].click();buttons()[1].click();await wait(()=>decisions.length===1);await new Promise(r=>setTimeout(r,120));
    expect(decisions[0].decision==='once'&&decisions[0].request==='b1','Allow once binds first request and deduplicates clicks');
    expect(document.querySelector('.composer-approval'),'Second request remains queued');buttons()[2].click();await wait(()=>decisions.length===2);await wait(()=>document.querySelector('#agent-prompt'));
    expect(decisions[1].decision==='conversation'&&decisions[1].request==='b2','Always decision reaches IPC');
    await type('保留草稿');approval('b','b3');await wait(()=>document.querySelector('.composer-approval'));
    expect(!document.querySelector('.conversation-approval-dot'),'Active conversation must not show a yellow dot');
    buttons()[0].click();await wait(()=>document.querySelector('#agent-prompt'));expect(decisions[2].decision==='deny','Deny reaches IPC');expect(document.querySelector('#agent-prompt').value==='保留草稿','Draft survives approvals');
    await select('a');await select('b');expect(!document.querySelector('.conversation-approval-dot'),'Seen requests must not become unread again');
    await select('a');approval('b','b4');await wait(()=>document.querySelector('.conversation-approval-dot'));approval('b','b4','completed');await wait(()=>!document.querySelector('.conversation-approval-dot'));
    for(const status of ['cancelled','failed','completed']){approval('b','end-'+status);await wait(()=>document.querySelector('.conversation-approval-dot'));finish('b',status);await wait(()=>!document.querySelector('.conversation-approval-dot'));}
    expect(uiErrors.length===0,JSON.stringify(uiErrors));
  })()`)
  console.log('APPROVAL_COMPOSER_UI_PASSED')
  win.destroy(); app.exit(0)
}
main().catch(error=>{console.error(error.stack);win?.destroy();app.exit(1)})
