'use strict'
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/conversation-tools')
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
    const initial={activeConversationId:'a',conversations,messages,data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{},paste=()=>{},selectAll=()=>{}; window.sent=[];window.uiErrors=[];window.caught=[];window.views={};
    const state=id=>({...initial,activeConversationId:id,messages:id==='a'?messages:[],catchAttachments:id==='b'?[draft]:[]});
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:fn=>{paste=fn;return()=>{}},onSelectAllMessages:fn=>{selectAll=fn;return()=>{}}},agent:{
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
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const expect=(yes,msg)=>{if(!yes)throw Error(msg)};
    await tick();await tick();
    expect(!document.querySelector('.assistant-mark,.answer-label'),'Reply avatar/name remains');
    document.querySelector('.conversation-item-actions > button').click();await tick();
    for(const button of document.querySelectorAll('.conversation-action-menu button')){
      const text=button.querySelector('span'),rect=button.getBoundingClientRect();expect(text,'Menu action lacks its text cell');
      expect(rect.height<60,'Menu action wraps vertically: '+text.textContent);expect(text.scrollWidth<=text.clientWidth+1,'Menu action text overflows: '+text.textContent);
    }
    document.querySelector('.conversation-item-actions > button').click();await tick();
    document.querySelector('.permission-menu > summary').click();await tick();
    const permission=document.querySelector('.permission-popover');expect(!/管理已记住|独立于审核者|撤销此对话/.test(permission.textContent),'Removed permission controls still visible');
    expect(getComputedStyle(permission).scrollbarColor.endsWith('rgba(0, 0, 0, 0)'),'Scrollbar track is opaque');
    expect(permission.querySelectorAll('.permission-option').length===3,'Permission modes were removed');
    document.querySelector('.permission-menu > summary').click();await tick();
    const conversation=document.querySelector('.conversation'),width=conversation.getBoundingClientRect().width;
    const expectedGutter=Math.max(Math.min(64,Math.max(24,innerWidth*.04)),(width-896)/2);
    expect(Math.abs(parseFloat(getComputedStyle(document.querySelector('.message-scroll')).paddingLeft)-expectedGutter)<2,'Conversation gutter differs from current layout');
    document.querySelector('.conversation-select').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await tick();
    const rename=document.querySelector('.rename-dialog'),name=rename.querySelector('input');expect(rename.open,'Rename dialog did not open on double click');expect(name.selectionEnd-name.selectionStart===name.value.length,'Rename title not selected');
    rename.querySelector('.rename-suggestion').click();await tick();rename.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();expect(window.renamed.title==='本轮提问','Suggested rename not saved');expect(!document.querySelector('.rename-dialog'),'Rename did not close');
    let scroller=document.querySelector('.message-scroll');
    expect(scroller.scrollHeight>scroller.clientHeight,'History must overflow');
    expect(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3,'Initial history is not at bottom');
    scroller.scrollTop=0;await tick();
    expect(document.querySelector('.conversation-bottom svg'),'Completed state needs down arrow');
    window.paste('继续');await tick();document.querySelector('#agent-prompt').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
    scroller.scrollTop=0;await tick();window.event();await tick();
    expect(document.querySelectorAll('.conversation-bottom-dots i').length===3,'Running state needs three dots '+JSON.stringify({sent:window.sent,errors:window.uiErrors,prompt:document.querySelector('#agent-prompt').value,error:document.querySelector('.composer-error')?.textContent,button:document.querySelector('.conversation-bottom')?.outerHTML}));
    expect(scroller.scrollTop<10,'New output stole history scroll');
    window.event('completed');window.resolveRun();await tick();window.sent=[];
    expect(document.querySelector('.conversation-bottom svg'),'Completion did not restore arrow');
    const catchButton=document.querySelector('.catch-button'),header=catchButton.closest('.trace-header');
    expect(Math.abs(catchButton.getBoundingClientRect().right-header.getBoundingClientRect().right)<2,'Catch is not at far right');
    document.querySelector('.conversation-bottom').click();await tick();
    expect(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3,'Return to bottom failed');
    scroller.scrollTop=150;scroller.dispatchEvent(new Event('scroll'));await tick();await tick();await tick();const savedAnchor=window.views.a;expect(savedAnchor.anchor==='m'&&!savedAnchor.following,'Message anchor not persisted');window.changeState(window.fixtureState('b'));await tick();window.changeState(window.fixtureState('a'));await tick();await tick();await tick();await tick();await tick();scroller=document.querySelector('.message-scroll');const anchor=document.querySelector('[data-message-id="m"]');expect(Math.abs(anchor.getBoundingClientRect().top-scroller.getBoundingClientRect().top-savedAnchor.offset)<3,'Message anchor did not restore '+JSON.stringify({savedAnchor,top:scroller.scrollTop,actualOffset:anchor.getBoundingClientRect().top-scroller.getBoundingClientRect().top,stored:window.views.a}));
    window.selectAll();expect(window.getSelection().toString().includes('完整回复'),'History select all failed');
    window.paste('草稿');await tick();const input=document.querySelector('#agent-prompt');
    input.setSelectionRange(1,2);window.paste('插入');await tick();expect(input.value==='草插入','History paste failed replacement into composer');
    document.querySelector('.catch-button').click();await tick();
    expect(window.caught.length===1&&window.caught[0].message==='m','Catch did not capture selected answer');
    expect(window.sent.length===0,'Catch auto-sent task');
    expect(document.querySelector('.selection-chip').textContent.includes('Catch'),'Catch attachment is not visible');
    expect(!document.querySelector('.assistant-turn'),'Catch did not switch new task');
    document.querySelector('.selection-chip button').click();await tick();expect(!document.querySelector('.selection-chip'),'Remove Catch failed');
    window.changeState(window.fixtureState('b'));await tick();expect(document.querySelector('.selection-chip'),'Restored draft is missing');
    document.querySelector('#agent-prompt').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
    expect(window.sent.length===1&&window.sent[0].attachments[0].type==='catch','Sending omitted Catch attachment');
    expect(!document.querySelector('.selection-chip'),'Sent Catch remains in composer');
    window.resolveRun();await tick();
    expect(!document.querySelector('.selection-chip'),'Completed Catch remains in composer');
    expect(window.uiErrors.length===0,JSON.stringify(window.uiErrors));
    window.splash();await tick();
    expect(getComputedStyle(document.querySelector('.launch-splash')).backgroundColor==='rgb(255, 255, 255)','Splash is not white');
    const logo=document.querySelector('.launch-logo');await logo.decode();
    expect(logo.naturalWidth===1254&&logo.naturalHeight===1254,'Incorrect user logo');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const ctx=canvas.getContext('2d');ctx.drawImage(logo,0,0);
    const pixels=ctx.getImageData(0,0,1254,1254).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128&&pixels[i]<100)ink++;
    expect(ink>1000,'Logo has no visible black pixels');
    return {catchCreatesUnsentTask:true,attachmentSentAndRemoved:true,scrollStatesAndPosition:true,historyPasteAndSelect:true,whiteSplashOriginalLogo:true};
  })()`)
  console.log('CONVERSATION_TOOLS_UI_PASSED', JSON.stringify(result))
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error('CONVERSATION_TOOLS_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
