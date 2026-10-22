'use strict'
const { readSource } = require('./../helpers/read-source.cjs')
// Hidden/offscreen Electron, real import IPC + disposable local fixtures. No
// interaction with the user's desktop, production profile, models or network.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path')
const { StableStore } = require('../../desktop/services/store.cjs')
const { WorkBuddyImportService } = require('../../desktop/services/workbuddy-import.cjs')
const { registerWorkBuddyIpc } = require('../../desktop/services/workbuddy-ipc.cjs')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/workbuddy-import')
fs.mkdirSync(output, { recursive: true })
const profile = fs.mkdtempSync(path.join(output, 'profile-'))
app.setPath('userData', profile); app.disableHardwareAcceleration()
let win, store

async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  const source = path.join(profile, 'source'), workspace = path.join(profile, 'workspace')
  fs.mkdirSync(path.join(source, 'projects/example'), { recursive: true }); fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(source, 'memory'))
  fs.writeFileSync(path.join(source, 'memory/user.md'), '# 演示记忆\n输出结果时保留零值。')
  const messages = [
    { id: 'u', type: 'message', role: 'user', cwd: workspace, timestamp: '2026-01-01T10:00:00Z', content: [{ type: 'input_text', text: '<user_query>请分析今年销售额</user_query>' }] },
    { id: 'a', parentId: 'u', type: 'message', role: 'assistant', timestamp: '2026-01-01T10:00:01Z', content: [{ type: 'output_text', text: '这是历史分析结果。' }] },
    { type: 'ai-title', aiTitle: '销售复盘测试' },
  ]
  fs.writeFileSync(path.join(source, 'projects/example/session.jsonl'), messages.map(m => JSON.stringify(m)).join('\n'))
  store = new StableStore(profile)
  const service = new WorkBuddyImportService({ store, userData: profile, workspace })
  const codexRoot=path.join(profile,'codex');fs.mkdirSync(path.join(codexRoot,'sessions'),{recursive:true});fs.writeFileSync(path.join(codexRoot,'sessions/rollout-test.jsonl'),[
    {type:'session_meta',payload:{id:'codex-fixture',source:'vscode'}},
    {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'问题'}]}},
    {type:'response_item',payload:{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'不应导入的进度'}]}},
    {type:'response_item',payload:{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'最终回答'}]}}
  ].map(row=>JSON.stringify(row)).join('\n'));
  const originalScan = service.scan.bind(service); service.scan = (root, provider) => originalScan(provider === 'codex' ? codexRoot : source, provider);
  const agentState = id => ({ activeConversationId: id, conversations: store.listConversations(), messages: store.listMessages(id), projects: store.listProjects(), paths: { userData: profile, workspace } })
  registerWorkBuddyIpc({ ipcMain, service: () => service, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [source] }) }, getWindow: () => win, agentState })
  ipcMain.handle('fixture:bootstrap', () => agentState(store.activeConversationId()))
  ipcMain.handle('fixture:select', (_event, id) => agentState(store.selectConversation(id)))
  const preload = path.join(profile, 'preload.cjs')
  fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');const invoke=(key,value)=>ipcRenderer.invoke('stable:workbuddy:'+key,value);contextBridge.exposeInMainWorld('stable',{bootstrap:()=>ipcRenderer.invoke('fixture:bootstrap'),agent:{select:id=>ipcRenderer.invoke('fixture:select',id)},dataImport:{state:()=>invoke('state'),scan:(chooseDirectory,provider)=>invoke('scan',{chooseDirectory,provider}),detail:(token,id)=>invoke('detail',{token,id}),importSelected:(token,ids)=>invoke('import',{token,ids}),continuationOptions:id=>invoke('continuationOptions',{id}),continueConversation:(id,documentIds)=>invoke('continue',{id,documentIds})}});`)
  win = new BrowserWindow({ show: false, width: 1420, height: 1000, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function AccountDock(', 'export function AccountDock(').replace('function SettingsContent(', 'export function SettingsContent(').replace('function SettingsNavigation(', 'export function SettingsNavigation(')
  const bundled = await build({ stdin: { contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AccountDock,SettingsContent,SettingsNavigation} from './src/settings/SettingsWorkspace';
    const initial={appVersion:'test',cloud:{account:null},update:{status:'development'},theme:'light'};
    function Test(){const [state,setState]=useState(initial),[module,setModule]=useState(null);return <><aside><AccountDock state={state} onSelect={setModule}/>{module&&<SettingsNavigation activeModule={module} onSelect={setModule}/>}</aside><main>{module&&<SettingsContent module={module} state={state} replaceState={value=>setState(current=>({...current,...value}))} updateTheme={()=>{}} action={async(_,fn)=>fn()} onSelect={setModule} onOpenImported={agent=>{window.fixtureOpened=agent;document.getElementById('opened').textContent='已打开 '+agent.activeConversationId}}/>}</main></>}

    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: appSource, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="rail"><div id="root"></div></div><div id="opened"></div></body></html>'))
  for (const name of ['tokens.css', 'app.css', 'sidebar-layout.css', 'workbuddy-import.css']) await win.webContents.insertCSS(readSource(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0;background:var(--color-paper)}#root{display:grid;grid-template-columns:280px minmax(0,1fr);height:100vh;width:100vw}#root>aside{position:relative}#root>main{min-width:0;min-height:0}.rail-account-dock{position:absolute;bottom:8px;left:8px}.rail{display:contents}#opened{position:fixed;top:0;right:0}@media(max-width:960px){#root{grid-template-columns:52px minmax(0,1fr)}}')
  await win.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}')
  await win.webContents.executeJavaScript(`(()=>{${bundled.outputFiles[0].text};return true})()`)
  console.log('UI_STAGE mounted')
  await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const expect=(value,message)=>{if(!value)throw Error(message)};
    const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await tick()}throw Error('UI wait timed out')};
    const button=text=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===text);
    await wait(()=>document.querySelector('.rail-account-trigger'));document.querySelector('.rail-account-trigger').click();await tick();
    Array.from(document.querySelectorAll('.account-menu-popover nav button')).find(el=>el.textContent.includes('数据导入')).click();await tick();
    expect(document.querySelectorAll('.migration-provider').length===2,'Both source applications required');
    expect(!document.querySelector('.settings-navigation header button') && !document.querySelector('.settings-page-toolbar button'),'Return controls must be removed');
    expect(document.querySelector('.migration-page').textContent.includes('Codex'),'Codex entry missing');
    button('导入').click();await wait(()=>document.querySelector('.migration-group'));
    expect(button('开始导入').disabled,'Selection must be explicit');
    expect(document.querySelectorAll('.migration-category').length===5,'Five asset categories required');
    const category=text=>Array.from(document.querySelectorAll('.migration-category button')).find(el=>el.textContent.startsWith(text));
    category('聊天会话').click();await tick();document.querySelector('.migration-item-name').click();await wait(()=>document.querySelector('.workbuddy-preview'));
    expect(document.querySelector('.workbuddy-preview').textContent.includes('请分析今年销售额'),'Preview missing Q/A');
    document.querySelector('.workbuddy-item-top input').click();await tick();
    document.querySelector('[aria-label="返回"]').click();await tick();category('记忆').click();await tick();document.querySelector('.workbuddy-item-top input').click();await tick();
    expect(document.querySelector('.workbuddy-import-footer').textContent.includes('已选择 2 项'),'Selection count wrong');
    document.querySelector('[aria-label="返回"]').click();await tick();button('开始导入').click();await wait(()=>document.querySelector('.workbuddy-results'));
    expect(document.querySelector('.workbuddy-results').textContent.includes('已导入 2 项'),'Import result missing');
    expect(button('开始导入').disabled,'Duplicate import still selectable');expect(!document.querySelector('[role=alert]'),'Unexpected error');
  })()`)
  await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,250))`)
  const bounds = await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.settings-page').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
  if (bounds.left < 0 || bounds.top < 0 || bounds.right > bounds.width || bounds.bottom > bounds.height) throw Error('Import panel escaped viewport: ' + JSON.stringify(bounds))
  win.webContents.invalidate()
  fs.writeFileSync(path.join(output, 'import-light.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  console.log('UI_STAGE imported', JSON.stringify(service.history().map(item => ({kind:item.kind,targetId:item.targetId}))))
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='dark'`)
  await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`)
  win.webContents.invalidate()
  fs.writeFileSync(path.join(output, 'import-dark.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  win.setContentSize(620, 900)
  await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`)
  const narrow = await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.settings-page').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
  if (narrow.left < 0 || narrow.top < 0 || narrow.right > narrow.width || narrow.bottom > narrow.height) throw Error('Narrow import panel escaped viewport: ' + JSON.stringify(narrow))
  win.setContentSize(1420, 1000)
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await tick()}throw Error('UI wait timed out')};
    const button=text=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===text);
    button('打开对话').click();await wait(()=>window.fixtureOpened);
    if(window.fixtureOpened.messages.length!==2)throw Error('History lost');
    if(window.fixtureOpened.conversations.find(c=>c.id===window.fixtureOpened.activeConversationId).sourceType!=='local')throw Error('Imported conversation is not native');
    return {id:window.fixtureOpened.activeConversationId,messages:window.fixtureOpened.messages.length};
  })()`)
  const context = store.getSetting('workbuddy-context:' + result.id)
  console.log('UI_STAGE continued', JSON.stringify(result), Boolean(context))
  if (context.references.length !== 0) throw Error('Imported memory was automatically activated')
  store.addMessage(result.id, 'user', '继续这个对话');
  if(store.listMessages(result.id).length !== 3) throw Error('Cannot continue in place')
  if (store.listProjects().length !== 0) throw Error('Unselected project imported')
  if (errors.length) throw Error(errors.join('\n'))
  await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await tick()}throw Error('UI wait timed out')};
    document.querySelector('[aria-label="返回"]').click();await tick();
  })()`);
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='light'`);
  win.webContents.invalidate();fs.writeFileSync(path.join(output,'applications-light.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await tick()}throw Error('UI wait timed out')};
    Array.from(document.querySelectorAll('.migration-provider')).find(el=>el.textContent.includes('Codex')).querySelector('button').click();await wait(()=>document.querySelector('.migration-category'));
    Array.from(document.querySelectorAll('.migration-category')).find(el=>el.textContent.includes('聊天会话')).querySelector('input').click();await tick();
    Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='开始导入').click();await wait(()=>document.querySelector('.workbuddy-results'));window.fixtureOpened=null;
    Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='打开对话').click();await wait(()=>window.fixtureOpened);
    if(window.fixtureOpened.messages.map(m=>m.content).join('|')!=='问题|最终回答')throw Error('Codex Q/A import failed');
    if(window.fixtureOpened.conversations.find(c=>c.id===window.fixtureOpened.activeConversationId).sourceType!=='local')throw Error('Codex not native');
  })()`);
  console.log('WORKBUDDY_IMPORT_UI_PASSED', JSON.stringify({ settingsEntry: true, preview: true, scopedImport: true, optInMemory: true, continuationMessages: result.messages }))
  win.destroy(); store.close(); app.exit(0)
}
main().catch(error => { console.error('WORKBUDDY_IMPORT_UI_FAILED', error.stack); win?.destroy(); store?.close(); app.exit(1) })
