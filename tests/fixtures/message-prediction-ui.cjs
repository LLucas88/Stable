'use strict'
const { readSource } = require('./../helpers/read-source.cjs')
// Real React composer, hidden Electron window and fake IPC; no user profile or network.
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'qa-artifacts/message-prediction')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } })
  win.webContents.on('console-message', event => { if (event.level !== 'info') console.log('renderer:', event.message) })
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function AgentPage(', 'export function AgentPage(').replace('function ThemeSettingsModule(', 'export function ThemeSettingsModule(')
  const bundle = (await build({ stdin: { contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {AgentPage} from './src/App'; import {ThemeSettingsModule} from './src/settings/SettingsWorkspace';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
    const messages=id=>[{id:id+'-user',role:'user',content:'修复问题并验证',createdAt:'2026-10-13T10:00:00Z'},{id:id+'-answer',role:'assistant',content:'已完成修复，可以继续运行测试。',createdAt:'2026-10-13T10:00:01Z',trace:[{id:'complete',kind:'status',status:'completed',title:'任务完成',time:1}]}];
    const initial={activeConversationId:'a',conversations:['a','b'].map(id=>({id,title:id,capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],messageCount:2})),messages:messages('a'),data:[],skills:[{id:'s',name:'测试 Skill',enabled:true}],skillReferences:[{id:'s',kind:'skill',name:'测试 Skill'}],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'D:/mock'},models:{items:[{id:'mock',model:'mock',displayName:'测试模型',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
    window.requests=[];window.cancelled=[];window.sent=[];window.errors=[];window.waiting={};window.defer=false;window.settingsWrites=[];
    window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},settings:{messagePredictions:async enabled=>{window.settingsWrites.push(enabled);return enabled}},agent:{
      onEvent:()=>()=>{},chapters:async()=>[],state:async id=>({...initial,activeConversationId:id,messages:messages(id)}),configure:async id=>({...initial,activeConversationId:id,messages:messages(id)}),
      run:(id,prompt)=>{window.sent.push({id,prompt});return new Promise(()=>{})},setSkillReferences:async()=>[],
      prediction:async(id,messageId,requestId)=>{window.requests.push({id,messageId,requestId});if(window.defer)return await new Promise(resolve=>window.waiting[id]=resolve);return {conversationId:id,sourceMessageId:messageId,suggestion:'继续运行测试，并保留原来的对比规则。'}},
      cancelPrediction:async id=>{window.cancelled.push(id);return true},
    }};
    function Test(){const [value,setValue]=useState(initial),[settings,showSettings]=useState(false);window.patch=v=>setValue(s=>({...s,...v}));window.switchTo=id=>setValue(s=>({...s,activeConversationId:id,messages:messages(id)}));window.showSettings=showSettings;
      return <><div style={{display:settings?'none':'contents'}}><AgentPage active={!settings} state={value} prefill='' consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.errors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/></div>{settings&&<ThemeSettingsModule state={value} replaceState={setValue} updateTheme={()=>{}} action={async(_,fn)=>fn()}/>}</>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-export', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div class="app-shell"><aside class="rail"><div id="tasks"></div></aside><main class="main-frame"><div id="root"></div></main></div></body></html>'))
  for (const name of ['tokens.css', 'app.css', 'context-usage.css', 'answer-tools.css', 'tool-trace.css', 'workbench-surfaces.css']) await win.webContents.insertCSS(readSource(path.join(root, 'src/styles', name), 'utf8'))
  await win.webContents.insertCSS('body{margin:0}#root{height:100vh;width:100%}.app-shell{height:100vh;grid-template-columns:280px minmax(0,1fr)}.main-frame{height:100vh}.rail{padding:18px}')
  await win.webContents.executeJavaScript(`(()=>{${bundle};return true})()`)
  await win.webContents.executeJavaScript(`
    window.tick=()=>new Promise(r=>setTimeout(r,40));window.wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await tick()}throw Error('UI timeout: '+fn+' requests='+JSON.stringify(window.requests)+' draft='+window.input()?.value+' errors='+JSON.stringify(window.errors))};
    window.expect=(ok,message)=>{if(!ok)throw Error(message)};
    window.input=()=>document.querySelector('#agent-prompt');window.ghost=()=>document.querySelector('.composer-prediction-overlay');
    window.type=async value=>{input().focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));await tick()};
    window.key=(key,extra={})=>input().dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
    undefined;
  `)
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>ghost());expect(input().value==='','Ghost changed the draft');expect(window.sent.length===0,'Ghost sent a message');
    const style=getComputedStyle(input()), overlayStyle=getComputedStyle(ghost());expect(style.fontSize===overlayStyle.fontSize&&style.lineHeight===overlayStyle.lineHeight,'Prediction typography differs');
    expect(ghost().getBoundingClientRect().width<=input().getBoundingClientRect().width+1,'Prediction overflows');
    input().focus();key('Tab');await tick();expect(input().value.includes('继续运行测试'),'Tab did not accept');expect(window.sent.length===0,'Tab sent');expect(!ghost(),'Accepted suggestion still visible');
    await type('');expect(!ghost(),'Consumed suggestion reappeared');
    window.switchTo('b');await wait(()=>ghost());key('Enter');await tick();key('Enter',{repeat:true});await tick();expect(window.sent.length===0,'Enter or key repeat sent during acceptance');
    expect(input().selectionStart===input().value.length,'Caret not at end');input().dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));
    key('Enter');await wait(()=>window.sent.length===1);expect(window.sent[0].id==='b','Sent to wrong conversation');
    window.patch({messagePredictionsEnabled:false});await tick();expect(!ghost(),'Disabled prediction visible');
  })()`)
  // Reset to independent completed threads while the fake b run remains pending.
  await win.webContents.executeJavaScript(`(async()=>{
    window.patch({conversations:['a','b','c','d','e','f','g'].map(id=>({id,title:id,capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],messageCount:2})),messagePredictionsEnabled:true});
    window.switchTo('c');
    await wait(()=>ghost());input().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));await tick();expect(!ghost(),'IME did not hide prediction');key('Enter',{isComposing:true,keyCode:229});await tick();expect(input().value==='','IME Enter accepted prediction');input().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await wait(()=>ghost());key('Escape');await tick();expect(!ghost(),'Escape did not dismiss');
    window.switchTo('d');await wait(()=>ghost());key('ArrowRight');await tick();expect(input().value.includes('继续运行测试'),'ArrowRight failed');
    input().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));await tick();key('Enter');key('Enter',{keyCode:229});await tick();expect(window.sent.length===1,'IME confirmation sent a nonempty draft');input().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await tick();
    await type('用户自己的内容');expect(!ghost(),'Typing failed to hide');
    window.defer=true;window.switchTo('e');await wait(()=>window.waiting.e);window.switchTo('f');await wait(()=>window.waiting.f);window.waiting.e({conversationId:'e',sourceMessageId:'e-answer',suggestion:'STALE'});await tick();expect(!ghost(),'Old thread suggestion leaked');
    window.waiting.f({conversationId:'f',sourceMessageId:'f-answer',suggestion:'先验证本次修改，再检查剩余问题。'});await wait(()=>ghost());expect(!ghost().textContent.includes('STALE'),'Stale result displayed');expect(window.cancelled.length>0,'Pending requests were not cancelled');
  })()`)
  fs.writeFileSync(path.join(output, 'prediction-light.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{document.documentElement.dataset.theme='dark';await tick();await tick();expect(getComputedStyle(document.documentElement).colorScheme==='dark','Dark theme did not apply')})()`)
  fs.writeFileSync(path.join(output, 'prediction-dark.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    window.showSettings(true);await wait(()=>document.querySelector('.prediction-setting input'));document.querySelector('.prediction-setting input').click();await tick();expect(window.settingsWrites.at(-1)===false,'Switch not saved');window.showSettings(false);await tick();expect(!ghost(),'Global switch did not hide prediction');
    window.defer=false;window.switchTo('g');const count=window.requests.length;await new Promise(r=>setTimeout(r,450));expect(window.requests.length===count,'Disabled switch still requests predictions');
    expect(window.sent.length===1,'Unexpected sends');expect(window.errors.length===0,'UI errors: '+window.errors.join(';'));
  })()`)
  console.log('MESSAGE_PREDICTION_UI_PASSED')
  win.destroy(); app.exit(0)
}
main().catch(error => { console.error(error); win?.destroy(); app.exit(1) })
