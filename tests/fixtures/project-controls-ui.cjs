'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/project-controls')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  win.webContents.on('console-message', (_event, level, message) => { if(level >= 2) console.error(message) })

  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function AgentPage(', 'export function AgentPage(').replace('function LaunchSplash(', 'export function LaunchSplash(')
  const bundle = (await build({ stdin: { contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {AgentPage,LaunchSplash} from './src/App';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
    const conversations=['a','b'].map(id=>({id,title:id==='a'?'来源对话':'新 Catch 任务',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false}));
    const messages=[{id:'u',role:'user',content:'本轮提问',createdAt:new Date().toISOString()},{id:'m',seq:2,role:'assistant',content:'完整回复\\n\\n'+('分析结果。\\n\\n'.repeat(80)),trace:[{id:'complete',kind:'status',status:'completed',title:'完成',time:2000}],createdAt:new Date().toISOString()}];
    const draft={name:'Catch · 来源对话.md',type:'catch',size:30000,path:'D:/mock/workspace/.stable/catches/example.md'};
    const initial={projects:[],activeConversationId:'a',conversations,messages,data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{},paste=()=>{},selectAll=()=>{}; window.sent=[];window.uiErrors=[];window.caught=[];window.views={};
    const state=id=>({...initial,activeConversationId:id,messages:id==='a'?messages:[],catchAttachments:id==='b'?[draft]:[]});
    window.stable={projects:{
      pickFolders:async()=>{window.pickerCalls=(window.pickerCalls||0)+1;return window.pickResult||[]},
      create:async(name,folders)=>{const item={id:'p'+(initial.projects.length+1),name,rootPath:folders[0],folders:folders.map(path=>({path,identity:'mock'}))};initial.projects.push(item);window.created=item;return item},
      open:async(projectId,conversationId)=>{window.opened={projectId,conversationId};let id=conversationId||'project-new';if(id==='a')id='project-new';if(!conversations.some(c=>c.id===id))conversations.push({...conversations[0],id,title:'项目新对话',projectId});conversations.find(c=>c.id===id).projectId=projectId;return state(id)},
    },appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:fn=>{paste=fn;return()=>{}},onSelectAllMessages:fn=>{selectAll=fn;return()=>{}}},agent:{
      viewState:async(id,value)=>{if(value)window.views[id]=value;return window.views[id]||{}},rename:async(id,title)=>{window.renamed={id,title};return state(id)},onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>state(id),
      catchReply:async(id,message)=>{window.caught.push({id,message});return state('b')},
      discardCatch:async id=>({...state(id),catchAttachments:[]}),
      run:(id,prompt,attachments)=>{window.sent.push({id,prompt,attachments});return new Promise(resolve=>{window.resolveRun=()=>resolve({...state(id),catchAttachments:[],messages:id==='a'?messages:[{id:'new',role:'assistant',content:'完成'}]})})},
    }};
    window.paste=text=>paste(text);window.selectAll=()=>selectAll();
    window.event=(status='running')=>listener({conversationId:'a',runId:'run-a',id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务状态',time:Date.now()});
    function Test(){const [value,setValue]=useState(initial); window.changeState=setValue;window.fixtureState=state;window.draft=draft;
      return <AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
    const reactRoot=createRoot(document.getElementById('root'));reactRoot.render(<Test/>);
    window.splash=()=>reactRoot.render(<LaunchSplash running={true} onFinish={()=>{}}/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100)),expect=(yes,msg)=>{if(!yes)throw Error(msg)};
    const click=selector=>{const el=document.querySelector(selector);expect(el,'Missing '+selector);el.click()};
    const input=(selector,value)=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))};
    await tick();await tick();expect(document.querySelector('.project-trigger').textContent.includes('选择项目'),'Initial project label');
    click('.project-trigger');await tick();expect(document.querySelector('.project-picker'),'Picker failed');click('.project-create-action');await tick();
    expect(document.querySelector('.project-dialog').open,'Create dialog must be modal');expect(document.querySelector('.project-dialog [type=submit]').disabled,'Cannot create without folder');
    click('.project-folder-add');await tick();expect(document.querySelectorAll('.project-folder').length===0,'Cancelled folder picker changed folders');
    window.pickResult=['D:/mock/source','E:/mock/data'];click('.project-folder-add');await tick();expect(document.querySelectorAll('.project-folder').length===2,'Multiple folders not added');
    click('.project-folder-add');await tick();expect(document.querySelectorAll('.project-folder').length===2,'Duplicate folders were added');
    document.querySelectorAll('.project-folder button')[1].click();await tick();expect(document.querySelectorAll('.project-folder').length===1,'Remove folder failed');
    click('.project-folder-add');await tick();input('[aria-label="项目名称"]','经营分析');await tick();
    document.querySelector('.project-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();
    expect(window.created.name==='经营分析'&&window.created.folders.length===2,'Project creation payload mismatch');
    expect(!document.querySelector('.project-dialog'),'Create dialog did not close');expect(document.querySelector('.project-trigger').textContent.includes('经营分析'),'Selected name missing');
    expect(document.querySelector('.sidebar-project-title').textContent.includes('经营分析'),'Sidebar project missing');
    expect(document.querySelector('.sidebar-project .conversation-select').textContent==='项目新对话','Conversation not under its project');
    expect(window.opened.conversationId==='a','Selection must carry source conversation so backend can protect old history');
    expect(document.querySelector('[data-conversation-id="a"]'),'Original history row disappeared');
    click('.project-trigger');await tick();input('[aria-label="搜索项目"]','no-match');await tick();expect(document.querySelector('.project-empty'),'No-match state missing');
    input('[aria-label="搜索项目"]','经营');await tick();expect(document.querySelectorAll('.project-options > button').length===2,'Project search missing result');
    click('.project-create-action');await tick();click('.project-dialog-close');await tick();expect(!document.querySelector('.project-dialog'),'Cancel did not close');expect(window.created.id==='p1','Cancel created project');
    click('.project-trigger');await tick();click('.project-options > button');await tick();expect(document.querySelector('.project-trigger').textContent.includes('选择项目'),'Default workspace selection failed');
    expect(document.querySelector('.sidebar-project-empty'),'Empty project placeholder missing');
    click('.sidebar-project-title');await tick();expect(window.opened.projectId==='p1'&&!window.opened.conversationId,'Sidebar new conversation not project-bound');
    expect(window.uiErrors.length===0,JSON.stringify(window.uiErrors));
    click('.project-trigger');await tick();click('.project-create-action');await tick();window.pickResult=['D:/mock/source','E:/mock/data'];click('.project-folder-add');await tick();input('[aria-label="项目名称"]','经营分析');await tick();
    const dialog=document.querySelector('.project-dialog'),r=dialog.getBoundingClientRect();expect(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'Dialog leaves viewport');
    return {projectCreateAndCancel:true,multipleFolders:true,searchAndSelection:true,sidebarGrouping:true};
  })()`)
  fs.writeFileSync(path.join(output,'create-project.png'),(await win.webContents.capturePage()).toPNG())
  console.log('PROJECT_CONTROLS_UI_PASSED',JSON.stringify(result));win.destroy();app.exit(0)
}
main().catch(error=>{console.error('PROJECT_CONTROLS_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
