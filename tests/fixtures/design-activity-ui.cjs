'use strict'
const { readSource } = require('./../helpers/read-source.cjs')
// Render the real AgentPage in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/design-activity')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  win.webContents.on('console-message', (_event, level, message) => { if(level >= 2) console.error(message) })

  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function AgentPage(', 'export function AgentPage(').replace('function LaunchSplash(', 'export function LaunchSplash(').replace('function AccountDock(', 'export function AccountDock(')
  const bundle = (await build({ stdin: { contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {createPortal} from 'react-dom'; import {App,AgentPage,LaunchSplash} from './src/App'; import {AccountDock} from './src/settings/SettingsWorkspace';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
    const conversations=['a','b'].map(id=>({id,title:id==='a'?'来源对话':'新 Catch 任务',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false,messageCount:2}));
    const messages=[{id:'u',role:'user',content:'本轮提问',createdAt:new Date().toISOString()},{id:'m',seq:2,role:'assistant',content:'完整回复\\n\\n'+('分析结果。\\n\\n'.repeat(80)),trace:[{id:'complete',kind:'status',status:'completed',title:'完成',time:2000}],createdAt:new Date().toISOString()}];
    const draft={name:'Catch · 来源对话.md',type:'catch',size:30000,path:'D:/mock/workspace/.stable/catches/example.md'};
    conversations.push({...conversations[0],id:'pc',title:'根据上传的数据源做一个经营情况的数据分析报告，交付 HTML 格式并核对数据',projectId:'p1'});const initial={cloud:{status:'authenticated',enabled:true},update:{status:'available',currentVersion:'1.1.0',availableVersion:'1.1.1'},appVersion:'1.1.0',projects:[{id:'p1',name:'项目一',rootPath:'D:/mock/project-one'},{id:'p2',name:'项目二',rootPath:'D:/mock/project-two'}],activeConversationId:'a',conversations,messages,data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{},paste=()=>{},selectAll=()=>{}; window.sent=[];window.uiErrors=[];window.caught=[];window.views={};
    const historyById={};const state=id=>({...initial,activeConversationId:id,messages:historyById[id]||(id==='a'?messages:[]),catchAttachments:id==='b'?[draft]:[]});
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

    const noop=()=>()=>{};
    initial.runtimeReady=true;initial.automations={jobs:[],runs:[]};initial.team.tasks=[];
    conversations.forEach((c,i)=>{c.updatedAt=new Date(Date.now()-i*86400000).toISOString();c.createdAt=c.updatedAt;c.lastMessagePreview='已完成分析与检查，可以继续调整。'});
    window.stable.bootstrap=async()=>initial;
    window.stable.appearance.onLaunchStart=fn=>{setTimeout(fn,10);return()=>{}};
    window.stable.appearance.completeLaunch=async()=>{};
    window.stable.team={onEvent:noop};window.stable.automations={onEvent:noop};window.stable.updater={onEvent:noop};window.stable.workflows={onEvent:noop};
    window.stable.agent.onState=noop;
    window.stable.agent.create=async design=>{const id='new-'+(conversations.length+1);conversations.push({...conversations[0],id,title:design?'Design 新对话':'普通新对话',projectId:null,messageCount:0,design});initial.activeConversationId=id;return state(id)};
    window.stable.agent.configureDesign=async(id,design)=>{conversations.find(c=>c.id===id).design=design;return state(id)};
    initial.models.items=[{id:'mock',displayName:'DeepSeek',model:'deepseek-flash',providerId:'deepseek',hasApiKey:true},{id:'glm',displayName:'GLM-5.3-Flash',model:'glm-5.3-flash',providerId:'zhipu',hasApiKey:true}];
    window.stable.agent.configureModel=async(id,modelId)=>{conversations.find(c=>c.id===id).modelId=modelId;window.modelSwitched={id,modelId};return state(id)};
    window.stable.agent.run=(id,prompt,attachments,refs,request,clarification,design)=>{window.sent.push({id,prompt,attachments,design});return new Promise(resolve=>{window.finish=()=>{const n=window.sent.length;historyById[id]=[...(historyById[id]||[]),{id:'user-'+n,seq:n*2,createdAt:new Date().toISOString(),role:'user',content:prompt,trace:design?[{id:'design-request',kind:'context',status:'completed',designRequest:{...design}}]:undefined},{id:'done-'+n,seq:n*2+1,createdAt:new Date().toISOString(),role:'assistant',content:'模拟完成',trace:[{kind:'status',status:'completed',title:'完成'}]}];conversations.find(c=>c.id===id).messageCount=historyById[id].length;resolve(state(id))}})};
    window.stable.agent.select=async id=>{initial.activeConversationId=id;return state(id)};
    window.stable.agent.search=async()=>[];
    window.stable.agent.imagePreview=async path=>{const canvas=document.createElement('canvas');canvas.width=path.includes('portrait')?640:1280;canvas.height=path.includes('portrait')?960:720;const ctx=canvas.getContext('2d');ctx.fillStyle='#719ca7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f1dbc1';ctx.fillRect(40,40,canvas.width-80,canvas.height-80);return canvas.toDataURL()};
    window.stable.files.path=file=>'D:/fixture/'+file.name;
    window.stable.agent.inspectAttachments=async paths=>paths.map(path=>({name:path.split('/').at(-1),path,type:'png',size:100}));
    function Test(){const [value,setValue]=useState(initial); window.changeState=setValue;window.fixtureState=state;window.draft=draft;
      return <>{createPortal(<AccountDock state={value} onSelect={module=>{window.selectedSettingsModule=module}}/>,document.getElementById('settings'))}<AgentPage active={true} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.uiErrors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/></>}
    const reactRoot=createRoot(document.getElementById('root'));reactRoot.render(<App/>);
    window.remount=async()=>{reactRoot.render(null);await new Promise(r=>setTimeout(r,100));reactRoot.render(<App/>)};
    window.splash=()=>reactRoot.render(<LaunchSplash running={true} onFinish={()=>{}}/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  const fixtureHtml=path.join(app.getPath('userData'),'composer.html');fs.writeFileSync(fixtureHtml,'<html lang="zh-CN" data-theme="light"><body><div id="root"></div></body></html>');await win.loadFile(fixtureHtml)
  for (const name of ['tokens.css', 'app.css', 'workbench-surfaces.css', 'conversation-tools.css', 'context-usage.css', 'answer-tools.css', 'tool-trace.css','sidebar-layout.css','design-activity.css']) await win.webContents.insertCSS(readSource(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await new Promise(resolve => setTimeout(resolve, 2800))

  const run = script => win.webContents.executeJavaScript(`(async()=>{const tick=()=>new Promise(r=>setTimeout(r,150));const expect=(ok,msg)=>{if(!ok)throw Error(msg)};const click=s=>{const e=document.querySelector(s);expect(e,'Missing '+s);e.click()};const input=(s,v)=>{const e=document.querySelector(s);e.focus();Object.getOwnPropertyDescriptor(e.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}))};${script}})()`)
  await run(`
    expect(document.querySelector('.rail-new-chat').getBoundingClientRect().height>=40,'New chat too small');
    expect(!document.querySelector('.rail-task-search'),'Redundant sidebar search remains');
    const pane=document.querySelector('.rail-task-pane'),frame=document.querySelector('.main-frame'),shell=document.querySelector('.app-shell');
    expect(Math.abs(pane.getBoundingClientRect().top-frame.getBoundingClientRect().top)<1,'Panel tops misaligned');
    expect(getComputedStyle(frame).borderTopRightRadius==='16px'&&getComputedStyle(pane).borderBottomLeftRadius==='16px','Outer corners missing');
    expect(getComputedStyle(shell).paddingRight==='1px'&&getComputedStyle(shell).paddingBottom==='1px','One-pixel shell gap missing');
    expect(['hidden','clip'].includes(getComputedStyle(pane).overflowY),'Task contents can cover rounded corners');
    for(const selector of ['.window-titlebar','.app-shell','.side-rail']) expect(getComputedStyle(document.querySelector(selector)).backgroundColor==='rgba(0, 0, 0, 0)','Window material covered by '+selector);
    expect(Math.abs(document.querySelector('.rail-task-header').getBoundingClientRect().height-document.querySelector('.conversation-topbar').getBoundingClientRect().height)<1,'Header heights misaligned');
    const work=document.querySelector('[aria-label="工作"]'),design=document.querySelector('[aria-label="Design"]'),chat=document.querySelector('.rail-nav');
    expect(work.getBoundingClientRect().top<design.getBoundingClientRect().top&&design.getBoundingClientRect().top<chat.getBoundingClientRect().top,'Workspace rail order');
    click('[aria-label="查看活动"]');await tick();expect(document.querySelector('.activity-row'),'Activity feed missing');
    expect(document.querySelector('.conversation-activity-feed').textContent.includes('昨天'),'Date groups missing');
    window.event('running');await tick();expect(document.querySelector('[aria-label="优先级"]'),'Running priority missing');
    window.event('completed');await tick();
    click('[aria-label="Design"]');await tick();expect(document.querySelector('[data-design="true"]'),'Design composer missing');
    expect(document.querySelector('.design-mode').textContent.includes('图片生成'),'Image mode missing');
    expect(!document.querySelector('.model-effort-control'),'Design model picker still present');
    const modelMenu=Array.from(document.querySelectorAll('.design-controls details')).find(d=>d.querySelector('strong')?.textContent==='图像模型');
    expect(modelMenu.querySelector('summary').textContent.includes('Sunburst'),'New Design must default to Sunburst');
    modelMenu.open=true;Array.from(modelMenu.querySelectorAll('button')).find(b=>b.textContent.includes('Flare')).click();await tick();
    modelMenu.open=true;
    expect(!modelMenu.querySelector('p'),'Model implementation description remains');
    expect(getComputedStyle(modelMenu.querySelector('.composer-popover')).boxShadow!=='none','Design popup shadow missing');
    expect(getComputedStyle(modelMenu.querySelector('[aria-pressed=true]')).boxShadow!=='none','Selected model shadow missing');
    modelMenu.open=false;
    expect(modelMenu.querySelector('summary').textContent.includes('Flare'),'Flare selection failed');
    const quality=Array.from(document.querySelectorAll('.design-controls details')).find(d=>d.querySelector('summary')?.textContent.startsWith('质量'));
    quality.open=true;expect(quality.querySelectorAll('button').length===6,'Official image quality choices missing');
    const bg=quality.querySelector('select');bg.value='transparent';bg.dispatchEvent(new Event('change',{bubbles:true}));await tick();expect(bg.value==='transparent','Transparent background not selected');quality.open=false;
    modelMenu.open=true;Array.from(modelMenu.querySelectorAll('button')).find(b=>b.textContent==='GLM-image').click();await tick();
    expect(!Array.from(document.querySelectorAll('.design-controls summary')).some(s=>s.textContent.startsWith('质量')),'GPT options leaked into GLM');
    modelMenu.open=true;Array.from(modelMenu.querySelectorAll('button')).find(b=>b.textContent.includes('Sunburst')).click();await tick();
    click('[aria-label="Design 输入模式"]');await tick();click('[role="menuitemradio"]:last-child');await tick();
    expect(document.querySelector('[data-design-chat="true"]')&&!document.querySelector('[aria-label="图片尺寸"]'),'Chat mode kept image controls');
    expect(getComputedStyle(document.querySelector('.composer-tools')).display!=='none','Normal chat tools hidden');
    click('[aria-label="Design 输入模式"]');await tick();click('[role="menuitemradio"]:first-child');await tick();
    const files=new DataTransfer();files.items.add(new File(['fixture'],'reference.png',{type:'image/png'}));files.items.add(new File(['fixture'],'portrait.png',{type:'image/png'}));
    document.querySelector('.composer-drop-target').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:files}));await tick();
    expect(document.querySelector('[aria-label="预览图片 reference.png"]'),'Reference upload missing');
    await tick();const cards=Array.from(document.querySelectorAll('.composer-image-selection'));expect(cards.length===2,'Two references missing');
    for(const card of cards){const box=card.getBoundingClientRect(),img=card.querySelector('img').getBoundingClientRect();expect(img.width>64&&img.height>64,'Fixture reference did not load');expect(getComputedStyle(card).transform==='none','Reference rotated');expect(img.right<=box.right+1&&img.bottom<=box.bottom+1,'Image overflows reference frame');expect(box.bottom<document.querySelector('.composer-actions').getBoundingClientRect().top,'Reference overlaps toolbar')}
    expect(Math.abs(cards[0].getBoundingClientRect().top-cards[1].getBoundingClientRect().top)<1,'References not in ordinary horizontal row');
    expect(!document.querySelector('.design-cost')&&!document.querySelector('.design-controls').textContent.includes('原图合成'),'Removed controls still visible');
    input('#agent-prompt','按 @');await tick();expect(document.querySelector('.design-inline-references'),'Typing @ did not open references');click('.design-inline-references button');await tick();expect(document.querySelector('#agent-prompt').value.includes('@图1'),'Reference mention missing');
  `)
  fs.writeFileSync(path.join(output,'design-light.png'),(await win.webContents.capturePage()).toPNG())
  await run(`const menu=Array.from(document.querySelectorAll('.design-controls details')).find(d=>d.querySelector('strong')?.textContent==='图像模型');menu.open=true;await tick();`)
  fs.writeFileSync(path.join(output,'design-model-menu-light.png'),(await win.webContents.capturePage()).toPNG())
  await run(`document.documentElement.dataset.theme='dark';await tick();const selected=document.querySelector('.design-controls [aria-pressed=true]');expect(getComputedStyle(selected).boxShadow!=='none','Dark selected shadow missing');`)
  fs.writeFileSync(path.join(output,'design-model-menu-dark.png'),(await win.webContents.capturePage()).toPNG())
  await run(`document.documentElement.dataset.theme='light';document.querySelectorAll('.design-controls details').forEach(d=>d.open=false);await tick();`)
  await run(`
    const size=document.querySelector('.design-size-popover');size.closest('details').open=true;
    Array.from(size.querySelectorAll('button')).find(b=>b.textContent.startsWith('弹窗')).click();await tick();
    Array.from(size.querySelectorAll('button')).find(b=>b.textContent==='2K').click();await tick();
    expect(size.querySelector('.design-output-limit').textContent.includes('小于 2 MB')&&size.querySelector('.design-output-limit').textContent.includes('600 × 750'),'Delivery specification missing');
    expect(!document.querySelector('[aria-label="图片宽度"]'),'Business preset should not expose provider dimensions as output size');
    Array.from(size.querySelectorAll('button')).find(b=>b.textContent==='自定义').click();await tick();
    expect(document.querySelector('[aria-label="图片宽度"]').value==='1632'&&document.querySelector('[aria-label="图片高度"]').value==='2048','Custom generation dimensions missing');
    click('[aria-label="锁定宽高比例"]');await tick();
    // Offscreen windows never have native focus and Chromium suppresses blur
    // events there. Dispatch the same bubbling focusout React uses explicitly.
    const commit=s=>document.querySelector(s).dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
    input('[aria-label="图片宽度"]','1001');await tick();commit('[aria-label="图片宽度"]');await tick();
    input('[aria-label="图片高度"]','777');await tick();commit('[aria-label="图片高度"]');await tick();
    expect(document.querySelector('[aria-label="图片宽度"]').value==='992'&&document.querySelector('[aria-label="图片高度"]').value==='768','Custom size not aligned');
    expect(document.querySelector('.design-size-notice').textContent.includes('已自动调整'),'Adjustment not shown');
    click('[aria-label="锁定宽高比例"]');await tick();input('[aria-label="图片宽度"]','1311');await tick();commit('[aria-label="图片宽度"]');await tick();
    expect(document.querySelector('[aria-label="图片宽度"]').value==='1312'&&document.querySelector('[aria-label="图片高度"]').value==='1024','Aspect lock failed');
  `)
  fs.writeFileSync(path.join(output,'design-custom-size.png'),(await win.webContents.capturePage()).toPNG())
  await run(`
    const row=document.querySelector('.design-dimensions'),labels=[...row.querySelectorAll('label')].map(e=>e.getBoundingClientRect()),lock=row.querySelector('button').getBoundingClientRect(),unit=row.querySelector('.design-pixel-unit').getBoundingClientRect();
    expect(Math.abs(labels[0].width-labels[1].width)<1,'Dimension fields have unequal widths');
    const centre=r=>r.top+r.height/2;
    expect([labels[1],lock,unit].every(r=>Math.abs(centre(r)-centre(labels[0]))<1),'Dimension controls are not vertically aligned: '+JSON.stringify([labels[0],labels[1],lock,unit].map(r=>({y:r.y,h:r.height}))));
    expect(Math.abs((lock.left-labels[0].right)-(labels[1].left-lock.right))<1,'Aspect lock spacing is asymmetric');
    expect(unit.right<=row.getBoundingClientRect().right+1,'Pixel unit overflows');
    document.documentElement.dataset.windowMaterial='mica';document.documentElement.style.backgroundColor='#edf9e3';await tick();
    for(const selector of ['.window-shell','.window-titlebar','.app-shell','.side-rail']) expect(getComputedStyle(document.querySelector(selector)).backgroundColor==='rgba(0, 0, 0, 0)','Mica surface covered by '+selector);
  `)
  fs.writeFileSync(path.join(output,'design-chrome-material.png'),(await win.webContents.capturePage()).toPNG())
  await run(`delete document.documentElement.dataset.windowMaterial;document.documentElement.style.removeProperty('background-color');await tick();`)
  await run(`const size=document.querySelector('.design-size-popover');Array.from(size.querySelectorAll('button')).find(b=>b.textContent.startsWith('店铺头像')).click();await tick();expect(size.querySelector('.design-output-limit').textContent.includes('小于 5 MB'),'Avatar limit not linked');`)
  fs.writeFileSync(path.join(output,'design-business-size.png'),(await win.webContents.capturePage()).toPNG())
  await run(`const size=document.querySelector('.design-size-popover');Array.from(size.querySelectorAll('button')).find(b=>b.textContent==='自定义').click();await tick();click('[aria-label="锁定宽高比例"]');await tick();input('[aria-label="图片宽度"]','1312');await tick();document.querySelector('[aria-label="图片宽度"]').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await tick();input('[aria-label="图片高度"]','1024');await tick();document.querySelector('[aria-label="图片高度"]').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await tick();`)
  await run(`
    document.querySelector('.design-size-popover').closest('details').open=false;
    const controls=document.querySelector('.design-controls');const count=Array.from(controls.querySelectorAll('summary')).find(s=>s.textContent.includes('1 张'));count.click();await tick();
    Array.from(count.parentElement.querySelectorAll('button')).find(b=>b.textContent==='2 张').click();await tick();
    const text=document.querySelector('[aria-label="图中文字内容"]');text.closest('details').open=true;input('[aria-label="图中文字内容"]','仅限今日 23.8');await tick();text.closest('details').open=false;
    input('#agent-prompt','生成一份早餐海报');await tick();click('.composer-send');await tick();
    expect(window.sent.length===1,'One submit should dispatch once');
    expect(window.sent[0].design.model==='gpt-image-2.5-sunburst'&&window.sent[0].design.quality==='medium'&&window.sent[0].design.background==='opaque','GPT model settings lost on send');
    expect(window.sent[0].attachments[0].name==='reference.png','Reference missing from send');
    expect(window.sent[0].design.count===2&&window.sent[0].design.ratio==='custom'&&window.sent[0].design.width===1312&&window.sent[0].design.height===1024&&window.sent[0].design.text==='仅限今日 23.8','Design parameters lost');
    expect(!window.sent[0].prompt.includes('stable_design_request'),'System parameters leaked into user message');
    expect(document.querySelector('[data-design-chat="true"]'),'Image send did not return to chat');
    expect(document.querySelector('.design-message-parameters').textContent.includes('1312 × 1024')&&document.querySelector('.design-message-parameters').textContent.includes('2 张'),'Sent image parameters missing');
    input('#agent-prompt','解释一下版式');await tick();click('.composer-send');await tick();expect(window.sent.length===1,'Queue bypassed running turn');
    click('[aria-label="Design 输入模式"]');await tick();click('[role="menuitemradio"]:first-child');await tick();
    const countMenu=Array.from(document.querySelectorAll('.design-controls summary')).find(e=>e.textContent.includes('2 张'));countMenu.click();await tick();Array.from(countMenu.parentElement.querySelectorAll('button')).find(b=>b.textContent==='4 张').click();await tick();
    expect(document.querySelector('.user-turn .design-message-parameters').textContent.includes('2 张'),'Editing next parameters mutated sent snapshot');
    input('#agent-prompt','再生成另一组');await tick();click('.composer-send');await tick();
    expect(document.querySelector('.queue-copy .design-message-parameters')?.textContent.includes('4 张'),'Queued image snapshot missing');
    click('[aria-label="工作"]');await tick();expect(!document.querySelector('[data-design="true"]'),'Work kept design composer');
    click('[aria-label="Design"]');await tick();expect(document.querySelector('[data-design-chat="true"]'),'Design chat mode not restored');
    expect(document.querySelector('.message-queue'),'Switch lost queue');
    window.finish();await tick();await tick();expect(window.sent.length===2&&!window.sent[1].design,'Chat inherited image parameters');
    window.finish();await tick();await tick();expect(window.sent.length===3&&window.sent[2].design.count===4,'Queued image snapshot lost');
    window.finish();await tick();
    document.documentElement.dataset.theme='dark';await tick();
    expect(getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim()==='#282a36','Dark theme failed');
    for(const selector of ['.window-titlebar','.app-shell','.side-rail']) expect(getComputedStyle(document.querySelector(selector)).backgroundColor==='rgba(0, 0, 0, 0)','Dark window material covered by '+selector);
    expect(document.querySelector('.composer-send').getBoundingClientRect().bottom<innerHeight,'Send button clipped');
  `)
  fs.writeFileSync(path.join(output,'design-dark.png'),(await win.webContents.capturePage()).toPNG())
  await run(`click('.rail-new-chat');await tick();expect(document.querySelector('[data-design="true"]'),'Design new chat lost mode');click('[aria-label="工作"]');await tick();click('.rail-new-chat');await tick();expect(!document.querySelector('[data-design="true"]'),'Ordinary new chat inherited Design')`)
  await run(`
    const pending=[];window.stable.agent.inspectAttachments=paths=>new Promise(resolve=>pending.push(()=>resolve(paths.map(path=>({name:path.split('/').at(-1),path,type:'png',size:100})))));
    for(const name of ['first.png','second.png']){const data=new DataTransfer();data.items.add(new File(['fixture'],name,{type:'image/png'}));document.querySelector('.composer-drop-target').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}))}
    await tick();expect(pending.length===2,'Both uploads must be pending');const sent=window.sent.length;
    input('#agent-prompt','附件没有完成前不能发送');await tick();click('.composer-send');await tick();expect(window.sent.length===sent,'Sent while attachments still loading');
    pending[0]();await tick();pending[1]();await tick();
    expect(document.querySelector('[aria-label="预览图片 first.png"]')&&document.querySelector('[aria-label="预览图片 second.png"]'),'Concurrent upload lost one batch');
    input('#agent-prompt','需要恢复的未发送草稿');await tick();
  `)
  await win.webContents.executeJavaScript('window.remount()');await new Promise(r=>setTimeout(r,3000))
  await run(`expect(document.querySelector('#agent-prompt').value==='需要恢复的未发送草稿','Draft lost after remount');expect(document.querySelector('[aria-label="预览图片 first.png"]')&&document.querySelector('[aria-label="预览图片 second.png"]'),'Draft attachments lost');`)
  fs.writeFileSync(path.join(output,'draft-recovered.png'),(await win.webContents.capturePage()).toPNG())
  console.log('DESIGN_ACTIVITY_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(error=>{console.error('DESIGN_ACTIVITY_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
