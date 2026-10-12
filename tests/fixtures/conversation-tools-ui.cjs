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
    const state=id=>({...initial,activeConversationId:id,messages:id==='a'?(window.failureMessages||messages):[],catchAttachments:id==='b'?[draft]:[]});
    window.stable={clipboard:{writeText:async text=>{window.copiedText=text}},appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:fn=>{paste=fn;return()=>{}},onSelectAllMessages:fn=>{selectAll=fn;return()=>{}}},agent:{
      chapters:async id=>window.chapterRows?.[id]||[],
      setChapter:async(id,messageId,title)=>{window.chapterRows||={};let rows=window.chapterRows[id]||[];rows=rows.filter(row=>row.messageId!==messageId);if(title!==null)rows.push({messageId,seq:2,title});window.chapterRows[id]=rows;return rows},
      forkAnswer:async(id,messageId)=>{window.forked={id,messageId};return {...state('b'),messages:messages.map(item=>({...item,id:'fork-'+item.id})),catchAttachments:[]}},
      contextUsage:async id=>({model:'mock',maxTokens:1000000,usedTokens:id==='a'?286200:null,percentage:id==='a'?28.62:null,updatedAt:Date.now(),estimated:true,categories:id==='a'?[{name:'Messages',tokens:180400},{name:'System tools',tokens:48700},{name:'MCP tools',tokens:46700},{name:'System prompt',tokens:7600},{name:'Skills',tokens:2700},{name:'Memory files',tokens:100}]:[],mcpTools:[{name:'stable / stable_excel',tokens:46700}],memoryFiles:[{name:'MEMORY.md',tokens:100}],systemTools:[],skills:[]}),
      viewState:async(id,value)=>{if(value)window.views[id]=value;return window.views[id]||{}},rename:async(id,title)=>{window.renamed={id,title};return state(id)},onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>state(id),
      catchReply:async(id,message)=>{window.caught.push({id,message});return state('b')},
      discardCatch:async id=>({...state(id),catchAttachments:[]}),
      run:(id,prompt,attachments,_references,requestId)=>{window.sent.push({id,prompt,attachments});
        if(window.failNextRun){
          window.failNextRun=false;
          listener({conversationId:id,runId:requestId,id:'partial',kind:'answer',eventType:'agent/answer-delta',delta:'已经收到的部分回复',status:'running',time:Date.now()});
          const trace=[{id:'partial',runId:requestId,kind:'reasoning',eventType:'agent/answer',content:'已经收到的部分回复',title:'过程输出',status:'completed',time:Date.now()-1},{id:'cmd',runId:requestId,kind:'tool',toolName:'Bash',title:'运行命令',status:'cancelled',time:Date.now()-1},{id:'runtime',runId:requestId,kind:'status',title:'本轮执行失败',detail:'fixture disconnect',status:'failed',time:Date.now()}];
          window.failureMessages=[...messages,{id:'failed-user',seq:3,role:'user',content:prompt,createdAt:new Date().toISOString()},{id:'failed-answer',seq:4,role:'assistant',content:'本轮执行失败：fixture disconnect',trace,createdAt:new Date().toISOString()}];
          return Promise.reject(Error('fixture disconnect'));
        }
return new Promise(resolve=>{window.resolveRun=()=>resolve({...state(id),catchAttachments:[],messages:id==='a'?messages:[{id:'new',role:'assistant',content:'完成'}]})})},
    }};
    window.paste=text=>paste(text);window.selectAll=()=>selectAll();
    window.event=(status='running')=>listener({conversationId:'a',runId:'run-a',id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务状态',time:Date.now()});
    function Test(){const [value,setValue]=useState(initial); window.changeState=setValue;window.fixtureState=state;window.draft=draft;
      return <AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
    const reactRoot=createRoot(document.getElementById('root'));reactRoot.render(<Test/>);
    window.splash=()=>reactRoot.render(<LaunchSplash running={true} onFinish={()=>{}}/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css', 'context-usage.css', 'answer-tools.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await new Promise(resolve => setTimeout(resolve, 300))
  const bubble = await win.webContents.executeJavaScript(`(()=>{
    document.querySelector('.message-scroll').scrollTop=0;
    const rect=document.querySelector('.user-bubble').getBoundingClientRect();
    if(getComputedStyle(document.querySelector('.user-turn-actions')).opacity!=='0') throw Error('Copy button visible without hover');
    return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',...bubble})
  await new Promise(resolve => setTimeout(resolve, 100))
  const copyPoint = await win.webContents.executeJavaScript(`(()=>{
    const actions=document.querySelector('.user-turn-actions');
    if(getComputedStyle(actions).opacity!=='1') throw Error('Copy button hidden on message hover');
    const rect=actions.querySelector('button').getBoundingClientRect();
    return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',...copyPoint})
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{
    if(getComputedStyle(document.querySelector('.user-turn-actions')).opacity!=='1') throw Error('Copy button disappears when moving onto it');
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1})
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{
    if(getComputedStyle(document.querySelector('.user-turn-actions')).opacity!=='0') throw Error('Copy button remains visible after leaving');
    const scroller=document.querySelector('.message-scroll');scroller.scrollTop=scroller.scrollHeight;
  })()`)
  await new Promise(resolve => setTimeout(resolve, 100))
  const answerPoint = await win.webContents.executeJavaScript(`(()=>{
    const toolbar=document.querySelector('.answer-toolbar');
    if(getComputedStyle(toolbar).opacity!=='0') throw Error('Answer tools visible without hover');
    const rect=toolbar.getBoundingClientRect();return {x:Math.round(rect.left+20),y:Math.round(rect.top-8)};
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',...answerPoint})
  await new Promise(resolve => setTimeout(resolve, 100))
  const timePoint = await win.webContents.executeJavaScript(`(()=>{
    const toolbar=document.querySelector('.answer-toolbar');
    if(getComputedStyle(toolbar).opacity!=='1') throw Error('Answer tools hidden on answer hover');
    const time=toolbar.querySelector('time'),rect=time.getBoundingClientRect();
    if(!time.textContent.includes('刚刚')||!time.getAttribute('aria-label').includes('年')) throw Error('Answer timestamp incorrect');
    return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',...timePoint})
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{
    const tip=document.querySelector('.answer-toolbar time').nextElementSibling;
    if(getComputedStyle(tip).opacity!=='1') throw Error('Timestamp tooltip hidden');
  })()`)
  fs.writeFileSync(path.join(output,'answer-time-tooltip.png'),(await win.webContents.capturePage()).toPNG())
  win.webContents.sendInputEvent({type:'mouseMove',x:1,y:1})
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{if(getComputedStyle(document.querySelector('.answer-toolbar')).opacity!=='0') throw Error('Answer tools remain visible after leaving')})()`)
  const indicator = await win.webContents.executeJavaScript(`(()=>{
    const rect=document.querySelector('.context-usage-button').getBoundingClientRect();
    return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};
  })()`)
  win.webContents.sendInputEvent({type:'mouseMove',...indicator})
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{
    const tooltip=document.querySelector('.context-usage-tooltip');
    if(getComputedStyle(tooltip).opacity!=='1'||!tooltip.textContent.includes('286.2k / 1M (29%)')) throw Error('Context tooltip is incorrect');
  })()`)
  fs.writeFileSync(path.join(output,'context-hover.png'),(await win.webContents.capturePage()).toPNG())
  for (const level of [1,2]) {
    await win.webContents.executeJavaScript(`document.querySelector('.context-usage-button').click()`)
    await new Promise(resolve => setTimeout(resolve, 100))
    await win.webContents.executeJavaScript(`(()=>{
      const panel=document.querySelector('.context-usage-panel'),rect=panel.getBoundingClientRect();
      if(rect.left<0||rect.right>innerWidth||rect.top<0||rect.bottom>innerHeight) throw Error('Context panel is clipped');
      if(Boolean(panel.querySelector('.context-usage-details'))!==${level===2}) throw Error('Incorrect context disclosure level');
    })()`)
    fs.writeFileSync(path.join(output,level===1?'context-summary.png':'context-details.png'),(await win.webContents.capturePage()).toPNG())
  }
  await win.webContents.executeJavaScript(`(()=>{
    const panel=document.querySelector('.context-usage-panel');
    if(!panel.textContent.includes('MCP')||!panel.textContent.includes('713.8k')) throw Error('Context categories or free space missing');
    panel.querySelector('.context-usage-group summary').click();
    if(!panel.querySelector('.context-usage-group').open) throw Error('Context tool group did not expand');
    panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  })()`)
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.executeJavaScript(`(()=>{
    if(document.querySelector('.context-usage-panel')) throw Error('Escape failed to close context usage');
    if(document.activeElement!==document.querySelector('.context-usage-button')) throw Error('Context focus was not restored');
  })()`)
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
    document.querySelector('.user-turn-actions button').click();await tick();
    expect(window.copiedText==='本轮提问','Copy did not send this message text to clipboard');
    expect(input.value==='草插入','Copy changed the existing composer draft');
    document.querySelector('.answer-toolbar [aria-label="复制回答"]').click();await tick();
    expect(window.copiedText===window.fixtureState('a').messages[1].content,'Answer copy lost text');
    expect(input.value==='草插入','Answer copy changed draft');
    document.querySelector('.answer-toolbar [aria-label="固定为章节"]').click();await tick();
    expect(document.querySelector('.answer-toolbar [aria-pressed="true"]'),'Pin state missing');
    document.querySelector('[aria-label="章节目录"]').click();await tick();
    expect(document.querySelector('.chapter-jump'),'Pinned chapter missing from directory');
    document.querySelector('[aria-label^="重命名章节"]').click();await tick();
    const chapterInput=document.querySelector('[aria-label="章节名称"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(chapterInput,'关键结论');chapterInput.dispatchEvent(new Event('input',{bubbles:true}));await tick();
    document.querySelector('.chapter-panel form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();
    expect(document.querySelector('.chapter-jump').textContent==='关键结论','Chapter rename failed');
    document.querySelector('.chapter-jump').click();await tick();await tick();
    expect(!document.querySelector('.chapter-panel'),'Chapter directory did not close on jump');
    expect(document.activeElement.dataset.messageId==='m','Chapter did not focus target');
    document.querySelector('.answer-toolbar [aria-label="从此处分支"]').click();await tick();
    expect(window.forked.id==='a'&&window.forked.messageId==='m','Fork target wrong');
    expect(document.querySelector('[data-message-id="fork-m"]'),'Fork did not switch to cloned history');
    expect(window.sent.length===0,'Fork auto sent a request');
    window.changeState(window.fixtureState('a'));await tick();await tick();
    expect(document.querySelector('.answer-toolbar [aria-pressed="true"]'),'Pin lost on conversation switch');
    document.querySelector('.answer-toolbar [aria-label="取消固定章节"]').click();await tick();
    expect(!document.querySelector('.answer-toolbar [aria-pressed="true"]'),'Unpin failed');
    document.querySelector('.catch-button').click();await tick();
    expect(window.caught.length===1&&window.caught[0].message==='m','Catch did not capture selected answer');
    expect(window.sent.length===0,'Catch auto-sent task');
    expect(document.querySelector('.composer-selections .conversation-file-card').textContent.includes('Catch'),'Catch attachment is not visible');
    expect(!document.querySelector('.assistant-turn'),'Catch did not switch new task');
    expect(document.querySelector('.context-usage-button').getAttribute('aria-label').includes('暂无数据'),'Context data leaked into another conversation');
    document.querySelector('.composer-selections .attachment-card-remove').click();await tick();expect(!document.querySelector('.composer-selections .conversation-file-card'),'Remove Catch failed');
    window.changeState(window.fixtureState('b'));await tick();expect(document.querySelector('.composer-selections .conversation-file-card'),'Restored draft is missing');
    document.querySelector('#agent-prompt').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
    expect(window.sent.length===1&&window.sent[0].attachments[0].type==='catch','Sending omitted Catch attachment');
    expect(!document.querySelector('.composer-selections .conversation-file-card'),'Sent Catch remains in composer');
    window.resolveRun();await tick();
    expect(!document.querySelector('.composer-selections .conversation-file-card'),'Completed Catch remains in composer');
    expect(window.uiErrors.length===0,JSON.stringify(window.uiErrors));
    window.changeState(window.fixtureState('a'));await tick();window.failNextRun=true;
    window.paste('测试中断后的记录');await tick();document.querySelector('#agent-prompt').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();await tick();await tick();
    expect(document.querySelectorAll('[data-message-id="failed-answer"]').length===1,'Failed answer missing or duplicated');
    expect(!document.querySelector('.composer-error'),'Persisted failure is duplicated in the composer');
    expect(!document.querySelector('.conversation-bottom-dots'),'Failed turn still appears running');
    const failedTurn=document.querySelector('[data-message-id="failed-answer"]');
    expect(failedTurn.querySelector('.trace-summary').getAttribute('aria-expanded')==='false','Failed execution record should be folded like other historical turns');
    failedTurn.querySelector('.trace-summary').click();await tick();
    expect(failedTurn.textContent.includes('已经收到的部分回复'),'Partial response missing from the normal turn');
    expect(!failedTurn.textContent.includes('项运行中'),'Failed tools still look active');
    const recovered={...window.fixtureState('a'),deliveries:[{id:'old',state:'unknown'}],recoveryText:'old recovery panel text',messages:[{id:'old-user',seq:1,role:'user',content:'旧提问',createdAt:'2020-01-01T00:00:00Z'},{...window.failureMessages.at(-1),id:'old-failure',seq:2,createdAt:'2030-01-01T00:00:00Z'},{id:'later-user',seq:3,role:'user',content:'后续提问',createdAt:'2020-01-02T00:00:00Z'}]};
    window.changeState(recovered);await tick();
    expect(!document.querySelector('.recovery-notice'),'Recovery panel still shown above the conversation');
    expect([...document.querySelectorAll('[data-message-id]')].map(node=>node.dataset.messageId).join(',')==='old-user,old-failure,later-user','Recovered failure is outside its original turn');
    window.chapterRows.c=[{messageId:'early-answer',seq:2,title:'早期章节'}];
    window.stable.agent.messages=async(id,cursor)=>{window.pageRequest={id,cursor};return {messages:[{id:'early-user',seq:1,role:'user',content:'早期提问',createdAt:'2020-01-01T00:00:00Z'},{id:'early-answer',seq:2,role:'assistant',content:'早期回答',createdAt:'2020-01-01T00:01:00Z'}],beforeCursor:null}};
    window.changeState({...window.fixtureState('a'),activeConversationId:'c',conversations:[...window.fixtureState('a').conversations,{...window.fixtureState('a').conversations[0],id:'c',title:'长对话'}],beforeCursor:201,messages:[{...window.fixtureState('a').messages[1],id:'recent-answer',seq:201}]});await tick();await tick();
    expect(!document.querySelector('[data-message-id="early-answer"]'),'Early page must start unloaded');
    expect(document.querySelectorAll('.chapter-directory').length===1,'Duplicate chapter directory after switching');
    document.querySelector('.chapter-trigger').click();await tick();
    const panelRect=document.querySelector('.chapter-panel').getBoundingClientRect();
    expect(panelRect.left>=0&&panelRect.right<=innerWidth&&panelRect.bottom<=innerHeight,'Chapter panel clipped');
    document.querySelector('.chapter-jump').click();await tick();await tick();await tick();
    expect(window.pageRequest.id==='c'&&window.pageRequest.cursor===201,'Chapter did not load older history');
    const early=document.querySelector('[data-message-id="early-answer"]'),scroll=document.querySelector('.message-scroll');
    expect(early&&document.activeElement===early,'Early chapter not focused');
    expect(Math.abs(early.getBoundingClientRect().top-scroll.getBoundingClientRect().top-16)<4,'Early chapter not scrolled into view');
    document.querySelector('.chapter-trigger').click();await tick();
    document.querySelector('.chapter-trigger').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
    expect(!document.querySelector('.chapter-panel'),'Escape failed to close chapter directory');
    window.splash();await tick();
    expect(getComputedStyle(document.querySelector('.launch-splash')).backgroundColor==='rgb(255, 255, 255)','Splash is not white');
    const logo=document.querySelector('.launch-logo');await logo.decode();
    expect(logo.naturalWidth===1254&&logo.naturalHeight===1254,'Incorrect user logo');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const ctx=canvas.getContext('2d');ctx.drawImage(logo,0,0);
    const pixels=ctx.getImageData(0,0,1254,1254).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128&&pixels[i]<100)ink++;
    expect(ink>1000,'Logo has no visible black pixels');
    return {catchCreatesUnsentTask:true,attachmentSentAndRemoved:true,scrollStatesAndPosition:true,historyPasteAndSelect:true,whiteSplashOriginalLogo:true};
  })().catch(error=>{throw new Error(error.stack)})`)
  console.log('CONVERSATION_TOOLS_UI_PASSED', JSON.stringify(result))
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error('CONVERSATION_TOOLS_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
