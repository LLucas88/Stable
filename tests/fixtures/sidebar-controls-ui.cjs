'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/sidebar-controls')
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
    const conversations=['a','b'].map(id=>({id,title:id==='a'?'来源对话':'新 Catch 任务',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false,messageCount:2}));
    const messages=[{id:'u',role:'user',content:'本轮提问',createdAt:new Date().toISOString()},{id:'m',seq:2,role:'assistant',content:'完整回复\\n\\n'+('分析结果。\\n\\n'.repeat(80)),trace:[{id:'complete',kind:'status',status:'completed',title:'完成',time:2000}],createdAt:new Date().toISOString()}];
    const draft={name:'Catch · 来源对话.md',type:'catch',size:30000,path:'D:/mock/workspace/.stable/catches/example.md'};
    conversations.push({...conversations[0],id:'pc',title:'项目已有聊天',projectId:'p1'});const initial={projects:[{id:'p1',name:'项目一',rootPath:'D:/mock/project-one'},{id:'p2',name:'项目二',rootPath:'D:/mock/project-two'}],activeConversationId:'a',conversations,messages,data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{},paste=()=>{},selectAll=()=>{}; window.sent=[];window.uiErrors=[];window.caught=[];window.views={};
    const state=id=>({...initial,activeConversationId:id,messages:id==='a'?messages:[],catchAttachments:id==='b'?[draft]:[]});
    window.stable={projects:{
      manage:async(id,action)=>{window.projectCalls||=[];window.projectCalls.push({id,action});const p=initial.projects.find(p=>p.id===id);if(action==='pin'||action==='unpin'){p.pinned=action==='pin';initial.projects.sort((a,b)=>Number(b.pinned||false)-Number(a.pinned||false))}if(action==='remove'){initial.projects.splice(initial.projects.indexOf(p),1);conversations.forEach(c=>{if(c.projectId===id)c.projectId=null})}return state(initial.activeConversationId)},
      pickFolders:async()=>{window.pickerCalls=(window.pickerCalls||0)+1;return window.pickResult||[]},
      create:async(name,folders)=>{const item={id:'p'+(initial.projects.length+1),name,rootPath:folders[0],folders:folders.map(path=>({path,identity:'mock'}))};initial.projects.push(item);window.created=item;return item},
      open:async(projectId,conversationId)=>{window.openCount=(window.openCount||0)+1;window.opened={projectId,conversationId};let id=conversationId||'project-new';if(id==='a')id='project-new';if(!conversations.some(c=>c.id===id))conversations.push({...conversations[0],id,title:'项目新对话',projectId,messageCount:0});conversations.find(c=>c.id===id).projectId=projectId;return state(id)},
    },appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:fn=>{paste=fn;return()=>{}},onSelectAllMessages:fn=>{selectAll=fn;return()=>{}}},agent:{
      create:async()=>{window.newCount=(window.newCount||0)+1;const id='new-'+window.newCount;conversations.push({...conversations[0],id,title:'新建的对话',projectId:null,messageCount:0});return state(id)},
      remove:async id=>{window.removeCalls||=[];window.removeCalls.push(id);if(window.failRemove)throw Error('测试删除失败');conversations.splice(conversations.findIndex(c=>c.id===id),1);return state(conversations[0].id)},
      openWorkspace:async id=>{window.workspaceOpened=id;return true},
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
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks" class="rail-conversation-tasks-slot"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css', 'codex-surfaces.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.main-frame > #root{background:var(--color-paper)}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  // Force a CSS hover in this isolated renderer, without moving the user's mouse.
  await new Promise(resolve => setTimeout(resolve, 200))
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  // Hosted Windows runners can enable reduced motion, which uses a 150 ms transition.
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await win.webContents.debugger.sendCommand('DOM.enable')
  await win.webContents.debugger.sendCommand('CSS.enable')
  const { root: dom } = await win.webContents.debugger.sendCommand('DOM.getDocument')
  const { nodeId: heading } = await win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: dom.nodeId, selector: '.sidebar-project-heading' })
  const actions = () => win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#tasks .sidebar-project-heading')).map(row => Array.from(row.querySelectorAll('.sidebar-project-more,.sidebar-project-new')).map(el => getComputedStyle(el).opacity))`)
  if ((await actions()).flat().some(value => value !== '0')) throw Error('Idle project actions visible')
  await win.webContents.debugger.sendCommand('CSS.forcePseudoState', { nodeId: heading, forcedPseudoClasses: ['hover'] })
  await new Promise(resolve => setTimeout(resolve, 220))
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const hovered = await actions()
  if (hovered[0].some(value => value !== '1') || hovered[1].some(value => value !== '0')) throw Error('Hover is not scoped to one project row: ' + JSON.stringify(hovered))
  await win.webContents.debugger.sendCommand('CSS.forcePseudoState', { nodeId: heading, forcedPseudoClasses: [] })
  await new Promise(resolve => setTimeout(resolve, 220))
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  if ((await actions()).flat().some(value => value !== '0')) throw Error('Actions remain after hover')
  win.webContents.debugger.detach()
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const typography=await win.webContents.executeJavaScript('(()=>{ const style=selector=>getComputedStyle(document.querySelector(selector)); const answer=style(".assistant-answer .markdown-body"),input=style("#agent-prompt"); return {bodyWeight:style("body").fontWeight,answerColor:answer.color,answerSize:answer.fontSize,answerFamily:answer.fontFamily,inputMinHeight:input.minHeight,inputOverflow:input.overflowY,headerBorder:style(".conversation-topbar").borderBottomWidth}; })()')
  require('node:assert/strict').equal(typography.answerColor,'rgb(26, 28, 31)')
  require('node:assert/strict').equal(typography.bodyWeight,'400')
  require('node:assert/strict').equal(typography.answerSize,'14px')
  require('node:assert/strict').equal(typography.inputOverflow,'auto')
  require('node:assert/strict').equal(typography.headerBorder,'1px')
  fs.writeFileSync(path.join(output,'design-typography.json'),JSON.stringify(typography,null,2))
  fs.writeFileSync(path.join(output,'design-conversation.png'),(await win.webContents.capturePage()).toPNG())
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,220)),expect=(yes,msg)=>{if(!yes)throw Error(msg)},click=selector=>{const el=document.querySelector(selector);expect(el,'Missing '+selector);el.click()};
    const menuText=()=>Array.from(document.querySelectorAll('.sidebar-action-menu [role=menuitem]')).map(el=>el.textContent);
    await tick();await tick();
    const host=document.getElementById('tasks'),recent=document.querySelector('.recent-new'),projectNew=document.querySelector('.sidebar-project-new');
    expect(Math.abs(recent.getBoundingClientRect().right-projectNew.getBoundingClientRect().right)<1,'Recent new button not aligned');
    expect(getComputedStyle(host).scrollbarColor==='rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)','Idle scrollbar visible');
    const previous=host.style.cssText;host.style.cssText+=';max-height:180px;flex:none';await tick();
    const width=host.clientWidth;host.scrollTop=50;await tick();expect(host.dataset.scrolling==='true','Scroll did not reveal thumb');
    expect(getComputedStyle(host).scrollbarColor!=='rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)','Scrolling thumb invisible');
    await new Promise(r=>setTimeout(r,600));host.scrollTop=70;await tick();await new Promise(r=>setTimeout(r,450));
    expect(host.dataset.scrolling==='true','Scrollbar hid while still scrolling');
    await new Promise(r=>setTimeout(r,600));expect(!host.dataset.scrolling,'Scrollbar did not hide after idle');
    expect(host.clientWidth===width,'Scrollbar changed content width');host.style.cssText=previous;host.scrollTop=0;await tick();
    expect(document.querySelector('.browser-launch')?.textContent.trim()==='','Browser button must be icon only');expect(!document.querySelector('.conversation-section-head').textContent.includes('归档'),'Archive button remains');
    expect(!document.querySelector('.recent-heading .sidebar-project-more'),'Recent ellipsis should not exist');
    click('.recent-toggle');await tick();expect(!document.querySelector('.recent-conversations'),'Recent collapse failed');expect(document.querySelector('[data-conversation-id="pc"]'),'Collapse hid project tasks');
    click('.recent-new');await tick();expect(window.newCount===1&&document.querySelector('.recent-conversations'),'New conversation did not expand recents');
    click('[aria-label="更多操作 来源对话"]');await tick();
    const anchor=document.querySelector('[aria-label="更多操作 来源对话"]'),menu=document.querySelector('.sidebar-action-menu');
    expect(menu.getBoundingClientRect().left>=anchor.getBoundingClientRect().right,'Task menu did not open to the right');expect(menu.getBoundingClientRect().bottom<=innerHeight,'Menu outside screen');expect(!document.querySelector('.rail').contains(menu),'Menu remains inside clipped sidebar');
    expect(!menuText().some(text=>/归档|核实|重建/.test(text)),'Removed actions remain');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));expect(document.activeElement.textContent==='删除任务','Menu keyboard End failed');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();expect(!document.querySelector('.sidebar-action-menu')&&document.activeElement===anchor,'Escape did not close and restore focus');
    click('[aria-label="更多操作 来源对话"]');await tick();document.querySelectorAll('.sidebar-action-menu [role=menuitem]')[1].click();await tick();expect(window.workspaceOpened==='a','Task Explorer opens wrong conversation');
    click('[aria-label="更多操作 来源对话"]');await tick();click('.sidebar-action-menu .danger');await tick();expect(document.querySelector('.remove-dialog').open,'Delete confirmation missing');expect(document.querySelector('.remove-dialog h2').textContent.includes('来源对话'),'Delete title missing');expect(!window.removeCalls,'Delete ran before confirmation');
    click('.remove-dialog footer button');await tick();expect(!document.querySelector('.remove-dialog')&&!window.removeCalls,'Cancel deleted data');
    click('[aria-label="更多操作 来源对话"]');await tick();click('.sidebar-action-menu .danger');await tick();window.failRemove=true;click('.remove-dialog-confirm');await tick();expect(document.querySelector('.remove-dialog [role=alert]'),'Delete error not shown');expect(!document.querySelector('.remove-dialog-confirm').disabled,'Cannot retry failed delete');window.failRemove=false;click('.remove-dialog-confirm');await tick();expect(!document.querySelector('[data-conversation-id="a"]')&&!document.querySelector('.remove-dialog'),'Confirmed delete failed');
    click('[aria-label="项目操作 项目二"]');await tick();expect(JSON.stringify(menuText())===JSON.stringify(['置顶','在资源管理器中打开','移除项目']),'Project menu has wrong actions '+JSON.stringify(menuText()));expect(!window.openCount,'Project ellipsis created a conversation');document.querySelector('.sidebar-action-menu [role=menuitem]').click();await tick();expect(document.querySelector('.sidebar-project-title').textContent.includes('项目二'),'Project not pinned above others');
    click('[aria-label="项目操作 项目二"]');await tick();expect(menuText()[0]==='取消置顶','Pinned project toggle missing '+JSON.stringify(menuText()));document.querySelectorAll('.sidebar-action-menu [role=menuitem]')[1].click();await tick();expect(window.projectCalls.at(-1).action==='open','Project Explorer not dispatched');
    click('[aria-label="在 项目一 中新建对话"]');await tick();expect(window.opened.projectId==='p1'&&window.openCount===1,'Project new conversation failed');
    click('[aria-label="项目操作 项目一"]');await tick();click('.sidebar-action-menu .danger');await tick();expect(document.querySelector('.remove-dialog p').textContent.includes('现有聊天不会被删除'),'Project removal copy inaccurate');click('.remove-dialog-close');await tick();expect(document.querySelector('[aria-label="项目 项目一"]'),'Cancel removed project');
    click('[aria-label="项目操作 项目一"]');await tick();click('.sidebar-action-menu .danger');await tick();click('.remove-dialog-confirm');await tick();expect(!document.querySelector('[aria-label="项目 项目一"]'),'Project remains after removal');expect(document.querySelector('.recent-conversations [data-conversation-id="pc"]'),'Removing project lost conversation');
    expect(window.uiErrors.length===0,JSON.stringify(window.uiErrors));
    click('[aria-label="项目操作 项目二"]');await tick();return {rightMenu:true,deleteConfirmation:true,projectActions:true,collapseAndCreate:true};
  })()`)
  fs.writeFileSync(path.join(output,'project-menu.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`document.querySelector('.sidebar-action-menu .danger').click()`)
  await new Promise(resolve=>setTimeout(resolve,120))
  fs.writeFileSync(path.join(output,'remove-project.png'),(await win.webContents.capturePage()).toPNG())
  console.log('SIDEBAR_CONTROLS_UI_PASSED',JSON.stringify(result));win.destroy();app.exit(0)
}
main().catch(error=>{console.error('SIDEBAR_CONTROLS_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
