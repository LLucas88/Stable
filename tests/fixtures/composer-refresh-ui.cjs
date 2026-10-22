'use strict'
const { readSource } = require('./../helpers/read-source.cjs')
// Render the real App in a hidden window with mock IPC. Never touch the
// user's running app, account, workspace or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/composer-refresh')
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
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {App} from './src/App';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
    const conversations=['a','b'].map((id)=>({id,title:id==='a'?'当前任务':'问鼎数据查询',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false,messageCount:id==='a'?0:1}));
    const initial={activeConversationId:'a',conversations,messages:[],data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock/workspace'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    let listener=()=>{}, releasePreparation, rejectRun; window.decisions=[];window.started=[];window.uiErrors=[];window.preparing=false;window.mode='preparing';window.releasePreparation=()=>releasePreparation();
    const state=(id)=>({...initial,activeConversationId:id,messages:id==='b'?[{id:'answer-b',role:'assistant',content:'已完成报告。'+String.fromCharCode(96)+'ALL CHECKS PASSED'+String.fromCharCode(96),createdAt:new Date().toISOString(),trace:[{id:'tool-b',kind:'tool',toolName:'Write',title:'写入文件',status:'completed',time:3000,startedAt:1000,detail:'写入成功'}]}]:[]});
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},agent:{
      onEvent:fn=>{listener=fn;return()=>{}},state:async id=>state(id),select:async id=>state(id),configure:async id=>{if(window.mode==='preparing'){window.preparing=true;await new Promise(resolve=>releasePreparation=resolve)}return state(id)},cancel:async()=>{rejectRun?.(new Error('已取消'));return true},
      run:(id)=>{window.started.push(id);return new Promise((resolve,reject)=>{rejectRun=reject})},
      answerApproval:async(id,request,decision)=>{window.decisions.push({id,request,decision});await new Promise(r=>setTimeout(r,70));return true},
    }};
    window.approval=(id,key,status='running')=>listener({conversationId:id,runId:'run-'+id,id:key,requestId:key,kind:'approval',status,title:'需要权限审批',time:Date.now(),toolName:'crm-brand-cli third login switch-brand',reason:'需要确认当前品牌切换',approvalCategory:'相同命令、参数和访问范围'});
    window.finish=(id,status)=>listener({conversationId:id,runId:'run-'+id,id:status==='completed'?'complete':'runtime',kind:'status',status,title:'任务结束',time:Date.now()});
    const noEvent=()=>()=>{};
    initial.cloud={status:'disabled'};initial.update={status:'idle'};initial.runtimeReady=true;
    initial.models.items=['glm-5.3-flashx','deepseek-flash','glm-5.3-flash','glm-5.3','deepseek-v4-pro','glm-5.2','glm-5.1','glm-5-turbo','glm-5','glm-4.7','glm-4.6','glm-4.5-air','glm-4.5'].map((model,i)=>({id:model==='deepseek-flash'?'mock':model,model,displayName:model.toUpperCase(),providerId:'test',reasoningOptions:[]}));
    initial.models.items=initial.models.items.map(item=>({...item,baseURL:'https://example.invalid/v1',hasApiKey:true}));
    window.stable.bootstrap=async()=>initial;
    window.stable.appearance.onLaunchStart=noEvent;window.stable.appearance.completeLaunch=async()=>{};
    window.stable.team={onEvent:noEvent};window.stable.automations={onEvent:noEvent};window.stable.updater={onEvent:noEvent};window.stable.workflows={onEvent:noEvent};
    window.stable.agent.onState=fn=>{window.publishAgent=fn;return()=>{}};window.created=0;window.stable.agent.create=async()=>{window.created++;return state('a')};
    window.stable.files.path=file=>'D:/mock/'+file.name;
    window.stable.agent.inspectAttachments=paths=>new Promise(resolve=>{window.inspectPending=true;window.finishInspect=()=>resolve(paths.map(path=>({path,name:'业务.xlsx',size:32,type:'xlsx'})))});
    window.stable.agent.contextUsage=async()=>({model:'deepseek-flash',usedTokens:407600,maxTokens:1000000,percentage:40.76,updatedAt:Date.now(),estimated:true,categories:[{name:'messages',tokens:407600}],mcpTools:[],memoryFiles:[],systemTools:[],skills:[]});
    window.stable.agent.configure=async id=>state(id);
    window.sidebarFixture=()=>{initial.projects=[{id:'p5',name:'五条对话的项目',rootPath:'D:/mock/five'},{id:'p6',name:'六条对话的项目',rootPath:'D:/mock/six'}];initial.conversations=[...initial.conversations,...Array.from({length:11},(_,i)=>({...conversations[0],id:'side-'+i,projectId:i<5?'p5':'p6',title:'根据上传的数据源分析经营情况，生成可查看的 HTML 报告 '+i,messageCount:2}))];window.publishAgent(state('b'))};
    window.installCalls=0;window.stable.updater.onEvent=fn=>{window.publishUpdate=fn;return()=>{}};window.stable.updater.install=async()=>{window.installCalls++;window.publishUpdate({status:'installing',progress:0,currentVersion:'1.1.0',availableVersion:'1.2.0'})};
    window.permissionChanges=[];window.stable.agent.configurePermission=async(id,permissionMode)=>{window.permissionChanges.push({id,permissionMode});initial.conversations=initial.conversations.map(c=>c.id===id?{...c,permissionMode}:c);return state(id)};

    window.stable.agent.configureModel=async(id,modelId)=>{await new Promise(r=>setTimeout(r,60));if(window.failModelSwitch)throw Error('模拟切换失败');initial.conversations=initial.conversations.map(c=>c.id===id?{...c,modelId}:c);return state(id)};
    createRoot(document.getElementById('root')).render(<App/>);

  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"/"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({filter:/\.svg$/}, args => ({contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+fs.readFileSync(args.path).toString('base64')),loader:'js'})); build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div id="root"></div></body></html>'))
  for (const name of ['context-usage.css','answer-tools.css','tool-trace.css','tokens.css', 'app.css', 'sidebar-layout.css','workbench-surfaces.css','conversation-tools.css','model-connection.css']) await win.webContents.insertCSS(readSource(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}')
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
    document.querySelector('.launch-splash')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));await tick();
    await type('未发送的新对话草稿');
    const picker=document.querySelector('.composer-tools input[type=file]');
    Object.defineProperty(picker,'files',{configurable:true,value:[new File(['mock'],'业务.xlsx')]});
    picker.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>window.inspectPending);
    document.querySelector('[data-conversation-id="b"] .conversation-select').click();await tick();
    window.finishInspect();await tick();
    expect(document.querySelector('#agent-prompt').value==='','Draft leaked to another task');
    expect(!document.querySelector('.composer-box').textContent.includes('业务.xlsx'),'Attachment leaked to another task');
    await type('另一任务草稿');
    document.querySelector('.rail-nav [aria-label="对话"]').click();
    await wait(()=>document.querySelector('#agent-prompt').value==='未发送的新对话草稿');
    expect(window.created===0,'Returning to draft created a fresh conversation');
    expect(document.querySelector('.composer-box').textContent.includes('业务.xlsx'),'Attachment did not return');
    expect(document.querySelector('[data-conversation-id="a"]'),'Unsent draft missing from task list');
    const context=document.querySelector('.context-usage');
    expect(context.parentElement.classList.contains('composer-actions'),'Context is not beside the model selector');
    await wait(()=>context.textContent.includes('407.6k / 1M (41%)'));
    expect(!context.querySelector('.context-usage-inline .context-usage-bar'),'Inline usage bar remains');
    const text=context.querySelector('.context-usage-inline').getBoundingClientRect(),circle=context.querySelector('svg').getBoundingClientRect();expect(Math.abs((text.top+text.bottom-circle.top-circle.bottom)/2)<1,'Usage text not vertically centered');
    const plus=document.querySelector('.composer-add-menu').getBoundingClientRect(),ring=context.getBoundingClientRect(),permission=document.querySelector('.permission-menu').getBoundingClientRect(),modelPosition=document.querySelector('.model-effort-control').getBoundingClientRect();
    expect(permission.left>=plus.right && permission.right<=ring.left && ring.right<=modelPosition.left,'Permission/context positions were not exchanged');
    context.querySelector('button').click();await tick();
    const panel=context.querySelector('[role=dialog]').getBoundingClientRect();
    expect(panel.left>=0&&panel.right<=innerWidth,'Context panel escaped viewport');
    expect(context.querySelector('.context-usage-panel .context-usage-bar > span'),'Expanded context bar missing');
    context.querySelector('.context-usage-heading').click();await tick();
    expect(context.textContent.includes('对话消息'),'Context breakdown missing');
    context.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
    expect(!context.querySelector('[role=dialog]'),'Context Escape failed');
    expect(!document.querySelector('.conversation-topbar > div > span'),'Current task caption remains');
    expect(document.querySelector('.conversation-tools-trigger'),'Three-dot menu not integrated');
    const model=document.querySelector('.model-menu');
    expect(model.querySelector('summary .model-provider-icon:not(.model-provider-icon-fallback)'),'Selected model brand icon missing');
    expect(getComputedStyle(model.querySelector('summary .model-provider-icon')).maskImage!=='none','Model logo mask is invalid');
    model.open=true;await tick();model.querySelector('.effort-model-expand').click();await tick();
    expect(document.querySelectorAll('.model-free-badge').length===13,'Free badge missing from models');
    expect(document.querySelectorAll('.model-option-mark svg').length===1,'Selected checkmark missing');
    expect(document.querySelectorAll('.model-recommended-badge').length===3,'Recommended model scope');
    expect([...document.querySelectorAll('.model-free-badge')].every(e=>e.parentElement.classList.contains('model-option-copy')),'Badge not next to name');
    document.querySelector('.model-option input[value="glm-5.3-flashx"]').click();await tick();await tick();
    expect(model.open&&document.querySelector('.model-options-scroll'),'Model switch closed list');
    const selected=document.querySelector('.model-option[data-active="true"]');expect(selected.querySelector('input').value==='glm-5.3-flashx','Model switch failed');expect(getComputedStyle(selected).backgroundColor!=='rgba(0, 0, 0, 0)','Selected background transparent');
    const list=document.querySelector('.model-options-scroll');
    expect(list.scrollHeight>list.clientHeight && getComputedStyle(list).overflowY==='scroll','Model list not scrollable');
    list.scrollTop=list.scrollHeight;await tick();expect(list.scrollTop>0,'Model scroll failed');
    window.validateLayout=()=>{
      const rect=document.querySelector('.model-popover').getBoundingClientRect();
      expect(rect.left>=0&&rect.right<=innerWidth,'Model menu escaped viewport');
      const send=document.querySelector('.composer-send, .composer-stop').getBoundingClientRect();
      expect(send.right<=innerWidth&&send.bottom<=innerHeight,'Send control escaped viewport');
      for(const badge of document.querySelectorAll('.model-free-badge')) expect(badge.scrollWidth<=badge.clientWidth+1,'Free badge clipped');
      const stream=document.querySelector('.conversation-stream').getBoundingClientRect(),composer=document.querySelector('.composer-drop-target').getBoundingClientRect();
      expect(Math.abs(stream.left-composer.left)<1 && Math.abs(stream.right-composer.right)<12,'Composer/history not aligned');
      expect(composer.width<=1024.5,'Maximum conversation width exceeded');
      const row=document.querySelector('.model-option');
      expect(row.getBoundingClientRect().height<65,'Model row wrapped unexpectedly');
    };window.validateLayout();
    model.open=false;await tick();
    document.querySelector('[data-conversation-id="b"] .conversation-select').click();await tick();
    expect(document.querySelector('#agent-prompt').value==='另一任务草稿','Other task draft lost');
    expect(!document.querySelector('.catch-button'),'Catch entry remains');
    expect(document.querySelector('.trace-timeline').hidden,'Historical progress is not folded');
    const code=document.querySelector('.assistant-answer code'),body=document.querySelector('.assistant-answer .markdown-body');
    expect(code && getComputedStyle(code).color===getComputedStyle(body).color,'Inline code does not use prose color');
    expect(getComputedStyle(document.querySelector('.run-trace')).borderBottomWidth==='1px','Historical answer divider missing');

    const trace=document.querySelector('.answer-toolbar .tool-trace-button');
    expect(trace && trace.textContent==='' && trace.getAttribute('aria-label'),'Trace not icon-only with accessible label');
    trace.click();await tick();
    expect(document.querySelector('.tool-trace-dialog').textContent.includes('2.0 秒'),'Trace duration missing');
    document.querySelector('.tool-trace-row summary').click();await tick();
    expect(document.querySelector('.tool-trace-row pre').textContent==='写入成功','Trace result missing');
    document.querySelector('[aria-label="关闭 Trace"]').click();await tick();
    document.querySelector('.rail-nav [aria-label="对话"]').click();await tick();
    document.querySelector('.composer-send').click();await wait(()=>window.started.length===1);
    expect(document.querySelector('#agent-prompt').value==='','Sending did not clear draft');
    expect(!document.querySelector('.composer-box').textContent.includes('业务.xlsx'),'Sending did not clear attachments');
    document.querySelector('[data-conversation-id="b"] .conversation-select').click();await tick();
    expect(document.querySelector('#agent-prompt').value==='另一任务草稿','Sending cleared another draft');
    document.querySelector('[data-conversation-id="a"] .conversation-select').click();await tick();
    expect(document.querySelector('#agent-prompt').value==='','Sent draft restored unexpectedly');
    expect(!document.querySelector('.toast[role=alert]'),'Unexpected UI error');
  })()`)
  // Force hover only inside this isolated test renderer, never the user's app.
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('DOM.enable');await win.webContents.debugger.sendCommand('CSS.enable')
  const dom=await win.webContents.debugger.sendCommand('DOM.getDocument')
  const rowNode=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'[data-conversation-id="a"]'})
  const titleWidth=await win.webContents.executeJavaScript(`document.querySelector('[data-conversation-id="a"] .conversation-title').getBoundingClientRect().width`)
  for(const theme of ['light','dark']) {
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='${theme}';document.activeElement?.blur()`)
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:rowNode.nodeId,forcedPseudoClasses:[]})
    await win.webContents.executeJavaScript(`(()=>{const row=document.querySelector('[data-conversation-id="a"]'),activity=row.querySelector('.conversation-activity'),spinner=activity.querySelector('.conversation-spinner');expect(getComputedStyle(activity).visibility==='visible','Running status hidden');expect(getComputedStyle(spinner).width==='14px'&&getComputedStyle(spinner).maskImage.includes('radial-gradient'),'Spinner not a compact ring');expect(getComputedStyle(activity,'::before').backgroundImage.includes('linear-gradient'),'Running title fade missing');expect(getComputedStyle(activity).backgroundColor===getComputedStyle(row).backgroundColor,'Running surface does not match row')})()`)
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:rowNode.nodeId,forcedPseudoClasses:['hover']})
    await win.webContents.executeJavaScript(`(()=>{const row=document.querySelector('[data-conversation-id="a"]'),actions=row.querySelector('.conversation-item-actions'),button=actions.querySelector('button');expect(getComputedStyle(actions).opacity==='1','Hover menu missing');expect(getComputedStyle(row.querySelector('.conversation-activity')).visibility==='hidden','Spinner overlaps menu');expect(getComputedStyle(actions,'::before').backgroundImage.includes('linear-gradient'),'Hover fade missing');expect(getComputedStyle(actions).backgroundColor===getComputedStyle(row).backgroundColor,'Hover surface does not match row: '+getComputedStyle(actions).backgroundColor+' / '+getComputedStyle(row).backgroundColor);expect(getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(button).boxShadow==='none'&&getComputedStyle(button).borderWidth==='0px','White button block remains');expect(Math.abs(row.querySelector('.conversation-title').getBoundingClientRect().width-${titleWidth})<1,'Hover reserves title space')})()`)
    fs.writeFileSync(path.join(output,'sidebar-hover-'+theme+'.png'),(await win.webContents.capturePage()).toPNG())
  }
  await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-conversation-id="a"] .conversation-item-actions > button').click();await tick();const menu=document.querySelector('.sidebar-action-menu');expect(menu?.textContent.includes('重命名')&&menu.textContent.includes('删除任务'),'Original three-dot actions lost');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();document.activeElement?.blur();document.documentElement.dataset.theme='light'})()`)
  await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:rowNode.nodeId,forcedPseudoClasses:[]})
  win.webContents.debugger.detach()
  for(const width of [960,1280,1600]) {
    win.setSize(width,800)
    await win.webContents.executeJavaScript(`(async()=>{await tick();const m=document.querySelector('.model-menu');m.open=true;await tick();m.querySelector('.effort-model-expand').click();await tick();window.validateLayout()})()`)
    fs.writeFileSync(path.join(output, 'model-menu-'+width+'.png'),(await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript(`document.querySelector('.model-menu').open=false`)
  }
  await win.webContents.executeJavaScript(`(async()=>{
    const p=document.querySelector('.permission-menu');p.open=true;await tick();
    expect(p.querySelector('summary').textContent.includes('完全访问')&&!p.querySelector('summary').textContent.includes('权限'),'Permission label');
    const card=p.querySelector('.permission-popover'),rect=card.getBoundingClientRect();expect(rect.width===256,'Permission popup not compact');
    const jump=document.querySelector('.conversation-bottom');expect(jump,'Jump button fixture missing');
    const j=jump.getBoundingClientRect();card.style.position='fixed';card.style.left=j.left+'px';card.style.top=j.top+'px';card.style.bottom='auto';
    expect(card.contains(document.elementFromPoint(j.left+j.width/2,j.top+j.height/2)),'Jump button paints above popup');
    card.removeAttribute('style');
    expect(card.querySelector('.composer-popover-head').textContent==='审批操作','Permission title/extra caption wrong');
    const rows=[...card.querySelectorAll('.permission-option')];
    expect(rows.map(row=>row.querySelector('.permission-select').textContent).join('|')==='请求批准|帮我批准|完全访问','Permission choices changed');
    expect(rows.every(row=>!row.querySelector('small')),'Explanations are still shown inline');
    expect(new Set(rows.map(row=>row.querySelector('.permission-select svg').getAttribute('class'))).size===3,'Risk icons are identical');
    const info=rows[0].querySelector('.permission-info');
    info.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await tick();
    expect(card.querySelector('[role="tooltip"]').textContent.includes('由你确认'),'Hover explanation missing');
    const tip=card.querySelector('[role="tooltip"]').getBoundingClientRect();
    expect(tip.left>=0&&tip.right<=innerWidth&&tip.top>=0,'Help escaped the viewport');
    info.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:card}));await tick();
    expect(!card.querySelector('[role="tooltip"]'),'Hover explanation did not dismiss');
    info.click();await tick();expect(card.querySelector('[role="tooltip"]'),'Click explanation missing');
    expect(window.permissionChanges.length===0,'Viewing explanation changed permission');
    info.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
    expect(!card.querySelector('[role="tooltip"]')&&p.open,'Escape should dismiss help before menu');
    // Offscreen windows have no OS focus; dispatch the native focus events as well.
    info.focus();info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));await tick();expect(card.querySelector('[role="tooltip"]'),'Keyboard explanation missing');
    const select=rows[0].querySelector('.permission-select');select.focus();info.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:select}));await tick();expect(!card.querySelector('[role="tooltip"]'),'Blur did not close explanation');
    for (const [i,id] of ['request','auto','full'].entries()) {
      rows[i].querySelector('.permission-select').click();await tick();
      expect(window.permissionChanges.at(-1).permissionMode===id,'Wrong permission sent to IPC');
      expect(rows[i].querySelector('.permission-select').getAttribute('aria-pressed')==='true','Selected permission missing');
    }
    expect(window.permissionChanges.length===3,'Duplicate permission mutations');

  })()`)
  fs.writeFileSync(path.join(output,'permission-menu.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{document.querySelectorAll('.permission-info')[2].click();await tick()})()`)
  fs.writeFileSync(path.join(output,'permission-explanation.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{const info=document.querySelectorAll('.permission-info')[2];info.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();info.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();expect(!document.querySelector('.permission-menu').open,'Escape did not close the menu')})()`)

  await win.webContents.executeJavaScript(`(async()=>{
    document.querySelector('.permission-menu').open=false;
    const pane=document.querySelector('.conversation');pane.style.width='500px';await tick();
    const stream=document.querySelector('.conversation-stream').getBoundingClientRect(),composer=document.querySelector('.composer-drop-target').getBoundingClientRect(),area=pane.getBoundingClientRect();
    expect(Math.abs(stream.left-composer.left)<1,'Narrow pane alignment');expect(composer.left-area.left>=15&&composer.left-area.left<=17,'Narrow pane gutter');expect(composer.right<=area.right,'Narrow composer overflow');
    pane.style.width='';document.documentElement.dataset.theme='dark';
    const m=document.querySelector('.model-menu');m.open=true;await tick();m.querySelector('.effort-model-expand').click();await tick();
    window.failModelSwitch=true;document.querySelector('.model-option input[value="glm-5.3-flash"]').click();await tick();await tick();
    expect(m.open,'Failed model switch closed menu');expect(document.querySelector('.model-option[data-active="true"] input').value==='glm-5.3-flashx','Failed switch replaced selected model');
    expect(!document.querySelector('.model-option input').disabled,'Failed model switch left selector disabled');
  })()`)
  fs.writeFileSync(path.join(output,'model-menu-dark.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{document.querySelector('.model-menu').open=false;document.documentElement.dataset.theme='light';document.querySelector('[data-conversation-id="b"] .conversation-select').click();await tick();expect(document.querySelector('.trace-summary').getAttribute('aria-expanded')==='false','Historical trace did not start folded');expect(document.querySelector('.assistant-answer').textContent.includes('ALL CHECKS PASSED'),'Final answer lost');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>setTimeout(resolve,400))})()`)
  fs.writeFileSync(path.join(output,'completed-answer.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    expect(getComputedStyle(document.querySelector('.conversation-topbar')).borderBottomWidth==='0px','Topbar divider remains');
    for(const selector of ['.rail-account-trigger','.composer-add-menu > summary']){const element=document.querySelector(selector),rect=element.getBoundingClientRect();expect(Math.abs(rect.width-rect.height)<1&&getComputedStyle(element).borderRadius==='50%','Control background is not circular');}
    expect(document.querySelector('.rail-task-pane').getBoundingClientRect().left>=document.querySelector('.rail-icon-dock').getBoundingClientRect().right,'Sidebar columns overlap');
    document.querySelector('.rail-account-trigger').click();await tick();
    const menu=document.querySelector('.account-menu-popover');expect(!menu.querySelector('nav small'),'Settings descriptions remain');
    expect(getComputedStyle(menu).backgroundColor==='rgb(255, 255, 255)','Settings background is not white');
    await new Promise(resolve=>setTimeout(resolve,300));
  })()`)
  fs.writeFileSync(path.join(output,'settings-menu.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    [...document.querySelectorAll('.account-menu-popover nav button')].find(button=>button.textContent.includes('模型连接')).click();await tick();await tick();
    const panel=document.querySelector('.settings-page');expect(getComputedStyle(panel).backgroundColor==='rgb(255, 255, 255)','Secondary settings background is not white');
    expect(getComputedStyle(document.querySelector('.main-frame')).borderStartStartRadius==='0px','Interior corner notch remains');
    expect(getComputedStyle(document.querySelector('.rail-new-chat')).height==='32px','New chat is not compact');
    expect(document.querySelector('#agent-prompt').value==='另一任务草稿','Settings lost conversation draft');
    await new Promise(resolve=>setTimeout(resolve,300));
  })()`)
  fs.writeFileSync(path.join(output,'settings-secondary.png'),(await win.webContents.capturePage()).toPNG())
  const hoverPoint=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('.rail-nav [aria-label="对话"]').click();await tick();const rect=document.querySelector('.rail-nav [data-tooltip]').getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}})()`)
  win.webContents.sendInputEvent({type:'mouseMove',...hoverPoint})
  await win.webContents.executeJavaScript(`(async()=>{await tick();const tip=getComputedStyle(document.querySelector('.rail-nav [data-tooltip]'),'::after');expect(tip.opacity==='1'&&tip.borderRadius==='8px'&&tip.backgroundColor==='rgb(237, 237, 237)','Styled tooltip not visible on hover')})()`)
  fs.writeFileSync(path.join(output,'sidebar-tooltip.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    window.sidebarFixture();await tick();
    const five=document.querySelector('[aria-label="项目 五条对话的项目"]'),six=document.querySelector('[aria-label="项目 六条对话的项目"]');
    expect(five.querySelectorAll('.conversation-select').length===5&&!five.querySelector('.task-group-expand'),'Five tasks must stay unfolded without extra button');
    expect(six.querySelectorAll('.conversation-select').length===5,'Six tasks must default to five');
    six.querySelector('.task-group-expand').click();await tick();expect(six.querySelectorAll('.conversation-select').length===6,'Expand did not show all tasks');
    six.querySelector('.sidebar-project-title').click();await tick();expect(six.querySelector('.sidebar-project-title').getAttribute('aria-expanded')==='false'&&six.querySelector('[hidden]'),'Project did not collapse');
    six.querySelector('.sidebar-project-title').click();await tick();expect(six.querySelector('.conversation-select').getBoundingClientRect().height>0,'Project did not reopen');
    expect(six.querySelectorAll('.conversation-select').length===6,'Collapse lost show-all choice');
    six.querySelector('.task-group-expand').click();await tick();expect(six.querySelectorAll('.conversation-select').length===5,'Show less failed');
    window.publishUpdate({status:'downloading',progress:42,currentVersion:'1.1.0',availableVersion:'1.2.0'});await tick();
    expect(document.querySelector('.rail-update-button [role="progressbar"]').getAttribute('aria-valuenow')==='42','Ring lost real download percentage');
    document.querySelector('.rail-update-button').click();await tick();expect(window.installCalls===0&&document.querySelector('.settings-page h1').textContent==='软件更新','Downloading click must show progress, not install');
    const search=document.querySelector('.settings-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'模型');search.dispatchEvent(new Event('input',{bubbles:true}));await tick();
    expect(document.querySelectorAll('.settings-navigation nav button').length===1,'Settings search did not filter');document.querySelector('.settings-navigation nav button').click();await tick();expect(document.querySelector('.model-connection-settings'),'Settings navigation failed');
    document.querySelector('.rail-nav [aria-label="对话"]').click();await tick();expect(document.querySelector('#agent-prompt').value==='另一任务草稿','Returning from settings lost draft');
    window.publishUpdate({status:'downloaded',progress:100,currentVersion:'1.1.0',availableVersion:'1.2.0'});await tick();
  })()`)
  fs.writeFileSync(path.join(output,'sidebar-projects-update.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{document.querySelector('.rail-update-button').click();await tick();expect(window.installCalls===1,'Ready update did not invoke install once');expect(document.querySelector('.rail-update-button').disabled,'Install state did not disable button')})()`)
  console.log('COMPOSER_REFRESH_UI_PASSED: drafts, async attachments, send clearing, context layout, badges, scroll, Trace, Catch removal')
  win.destroy();app.exit(0)
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
