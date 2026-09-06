'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/manual-skills')
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
    const initial={activeConversationId:'a',conversations,messages,data:[],skills:[{id:'s1',name:'手动分析技能',description:'测试技能',content:'SKILL_BODY',enabled:true}],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{},paste=()=>{},selectAll=()=>{}; window.savedSkills={};window.sent=[];window.uiErrors=[];window.caught=[];window.views={};
    const state=id=>({...initial,skillReferences:(window.savedSkills[id]||[]).map(id=>({id,kind:'skill',name:'手动分析技能'})),activeConversationId:id,messages:id==='a'?messages:[],catchAttachments:id==='b'?[draft]:[]});
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:fn=>{paste=fn;return()=>{}},onSelectAllMessages:fn=>{selectAll=fn;return()=>{}}},agent:{
      setSkillReferences:async(id,ids)=>{window.savedSkills[id]=ids;return ids.map(id=>({id,kind:'skill',name:'手动分析技能'}))},
      viewState:async(id,value)=>{if(value)window.views[id]=value;return window.views[id]||{}},rename:async(id,title)=>{window.renamed={id,title};return state(id)},onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>state(id),
      catchReply:async(id,message)=>{window.caught.push({id,message});return state('b')},
      discardCatch:async id=>({...state(id),catchAttachments:[]}),
      run:(id,prompt,attachments,references)=>{window.sent.push({id,prompt,attachments,references});return new Promise(resolve=>{window.resolveRun=()=>resolve({...state(id),catchAttachments:[],messages:id==='a'?messages:[{id:'new',role:'assistant',content:'完成'}]})})},
    }};
    window.paste=text=>paste(text);window.selectAll=()=>selectAll();
    window.event=(status='running')=>listener({conversationId:'a',runId:'run-a',id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务状态',time:Date.now()});
    function Test(){const [value,setValue]=useState(state('a')); window.changeState=setValue;window.fixtureState=state;window.draft=draft;
      return <AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
    const reactRoot=createRoot(document.getElementById('root'));reactRoot.render(<Test/>);
    window.remount=()=>reactRoot.render(<Test key={Math.random()}/>);
    window.splash=()=>reactRoot.render(<LaunchSplash running={true} onFinish={()=>{}}/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100)),expect=(value,msg)=>{if(!value)throw Error(msg)};
    const chip=()=>Array.from(document.querySelectorAll('.selection-chip')).find(el=>el.textContent.includes('手动分析技能'));
    const send=async text=>{window.paste(text);await tick();document.querySelector('#agent-prompt').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick()};
    const select=async()=>{document.querySelector('.skill-menu > summary').click();await tick();document.querySelector('.skill-menu .composer-option').click();await tick()};
    await tick();await tick();expect(!chip(),'Skill auto-selected on open');
    await send('分析');expect(window.sent.at(-1).references.length===0,'Unselected skill sent');window.resolveRun();await tick();
    await select();expect(chip(),'Manual selection not visible');expect(window.savedSkills.a[0]==='s1','Selection not saved');
    await send('首次');expect(window.sent.at(-1).references[0].id==='s1','Manual Skill not sent');expect(chip(),'Skill cleared after send');window.resolveRun();await tick();
    await send('继续');expect(window.sent.at(-1).references[0].id==='s1','Skill not retained on follow-up');window.resolveRun();await tick();
    window.changeState(window.fixtureState('b'));await tick();expect(!chip(),'Skill leaked to another conversation');
    window.changeState(window.fixtureState('a'));await tick();expect(chip(),'Skill lost switching back');
    window.remount();await tick();await tick();expect(chip(),'Persisted selection not restored after remount');
    chip().querySelector('button').click();await tick();expect(!chip(),'Removed Skill still visible');expect(window.savedSkills.a.length===0,'Removal not saved');
    await send('继续分析');expect(window.sent.at(-1).references.length===0,'Removed Skill still sent');window.resolveRun();await tick();
    window.remount();await tick();await tick();expect(!chip(),'Removed Skill resurrected after remount');
    expect(window.uiErrors.length===0,JSON.stringify(window.uiErrors));
    return {manualOnly:true,persistentFollowup:true,conversationIsolation:true,restartRestoreAndRemove:true};
  })()`)
  console.log('MANUAL_SKILLS_UI_PASSED', JSON.stringify(result))
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error('MANUAL_SKILLS_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
