'use strict'
// Hidden Electron window, isolated user data, mocked IPC, all network denied.
const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const { readFileSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.join(__dirname, '../..')
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'stable-login-ui-'))
app.setPath('userData', dataDir)
app.disableHardwareAcceleration()
let window

async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  window = new BrowserWindow({ show: false, width: 1000, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  const bundle = buildSync({
    stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {WendingLoginPanel} from './src/WendingLoginPanel';
      window.testResult = {sent:0, verified:0, selected:0, ready:0, closed:0, states:[]};
      const state = (phase, extra={}) => ({phase,channel:'0',detail:'测试状态',...extra});
      window.stable={extensions:{
        sendWendingCode: async (mobile,channel)=>{ if(mobile!=='13800000000'||channel!=='0') throw Error('wrong private input'); window.testResult.sent++; await new Promise(r=>setTimeout(r,50)); return state('code_sent',{mobileHint:'138****0000'}); },
        verifyWendingCode: async code=>{ if(code!=='654321') throw Error('wrong private input'); window.testResult.verified++; return state('choose_account',{accounts:[{id:'a'.repeat(24),label:'测试账号 A'},{id:'b'.repeat(24),label:'测试账号 B'}]}); },
        selectWendingAccount: async id=>{if(id!=='b'.repeat(24))throw Error('wrong account');window.testResult.selected++;return state('choose_brand',{brands:[{id:'c'.repeat(24),label:'测试品牌'}]});},
        selectWendingBrand: async()=>state('ready',{brandLabel:'测试品牌'}),
        refreshWendingBrands: async()=>state('choose_brand',{brands:[]}), resetWendingLogin: async()=>state('signed_out'),
        prepareWending: async()=>({status:'ready',login:state('signed_out')}),cancelWendingLogin:async()=>state('unknown')
      }};
      function TestApp(){const [value,setValue]=useState(state('signed_out')); const [closed,setClosed]=useState(false); window.setTestState=setValue;window.reopenTest=()=>setClosed(false);
      return closed?<p>已取消</p>:<WendingLoginPanel state={value} onState={v=>{window.testResult.states.push(v);setValue(v)}} onReady={async()=>{window.testResult.ready++}} onClose={()=>{window.testResult.closed++;setClosed(true)}}/>;}
      createRoot(document.getElementById('root')).render(<TestApp/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
  }).outputFiles[0].text
  const css = readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8') + readFileSync(path.join(root, 'src/styles/app.css'), 'utf8')
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{padding:24px;margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>'))
  await window.webContents.insertCSS(css)
  await window.webContents.executeJavaScript(bundle)
  const result = await window.webContents.executeJavaScript(`(async()=>{
    let step='mount';
    const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI wait timed out: '+step);};
    const expect=(yes,message)=>{if(!yes)throw Error(message)};
    const input=(selector,value)=>{const element=document.querySelector(selector);const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const submit=()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await wait(()=>document.querySelector('input[type=tel]'));
    await new Promise(r=>setTimeout(r,50));
    step='validation';
    expect(window.testResult.sent===0,'Opening form must not send SMS');
    submit();await wait(()=>document.querySelector('[role=alert]'));
    expect(document.activeElement.getAttribute('role')==='alert','Validation error must receive keyboard focus');
    input('input[type=tel]','13800000000');await new Promise(r=>setTimeout(r,20));submit();submit();
    step='send';
    await wait(()=>document.querySelector('input[autocomplete=one-time-code]'));
    expect(window.testResult.sent===1,'Double submit sent duplicate SMS');
    expect(!document.body.innerText.includes('13800000000'),'Full phone leaked into page text');
    input('input[autocomplete=one-time-code]','654321');await new Promise(r=>setTimeout(r,20));submit();
    step='verify';
    await wait(()=>document.querySelector('select option[value="'+ 'b'.repeat(24)+'"]'));
    expect(window.testResult.ready===0,'Multiple accounts require selection');
    input('select','b'.repeat(24));await new Promise(r=>setTimeout(r,20));submit();
    step='account';
    await wait(()=>document.querySelector('select option[value="'+ 'c'.repeat(24)+'"]'));
    expect(window.testResult.ready===0,'Brand confirmation is required');
    input('select','c'.repeat(24));await new Promise(r=>setTimeout(r,20));submit();
    step='brand';
    await wait(()=>window.testResult.ready===1);
    expect(window.testResult.verified===1&&window.testResult.selected===1,'Unexpected calls');
    const stored=JSON.stringify(window.testResult.states);
    expect(!/13800000000|654321/.test(stored),'Credentials leaked into public state');
    window.setTestState({phase:'signed_out',channel:'0',detail:'测试状态',retryAfter:2});
    step='cooldown';
    await wait(()=>document.querySelector('button[type=submit]')?.disabled);
    const labels=Array.from(document.querySelectorAll('input,select')).every(el=>document.querySelector('label[for="'+el.id+'"]'));
    expect(labels,'Every field needs a visible label');
    const style=getComputedStyle(document.querySelector('input'));
    expect(parseFloat(style.height)>=40,'Input target too small');
    document.querySelector('button[aria-label="关闭登录表单"]').click();await wait(()=>window.testResult.closed===1);
    expect(!document.querySelector('input'),'Cancel must unmount private form fields');
    return {passed:true,sent:window.testResult.sent,ready:window.testResult.ready,closed:window.testResult.closed};
  })()`)
  if (!result.passed) throw new Error('UI test did not complete')
  await window.webContents.executeJavaScript('window.reopenTest()')
  for (const width of [375, 1000]) {
    window.setSize(width, 850)
    let previousBackground
    for (const theme of ['light', 'dark']) {
      const metrics = await window.webContents.executeJavaScript(`(async()=>{
        document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});
        await new Promise(r=>setTimeout(r,60));
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const element=document.querySelector('input');const style=getComputedStyle(element);
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
        const lum=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
        const a=lum(style.color),b=lum(style.backgroundColor);
        const closeStyle=getComputedStyle(document.querySelector('button[aria-label="关闭登录表单"]'));
        const icon=lum(closeStyle.color),iconBackground=lum(closeStyle.backgroundColor);
        const overflow=Array.from(document.querySelectorAll('input,select,button')).some(el=>el.getBoundingClientRect().right>innerWidth||el.getBoundingClientRect().left<0);
        return {overflow,background:style.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),iconContrast:(Math.max(icon,iconBackground)+.05)/(Math.min(icon,iconBackground)+.05),fields:document.querySelectorAll('input,select').length};
      })()`)
      if (metrics.overflow || metrics.contrast < 4.5 || metrics.iconContrast < 3 || metrics.fields !== 2) throw new Error('Login layout or contrast failed: ' + width + ' ' + theme)
      if (previousBackground === metrics.background) throw new Error('Theme did not change')
      previousBackground = metrics.background
    }
  }
  if (process.env.STABLE_LOGIN_QA_SCREENSHOT) writeFileSync(process.env.STABLE_LOGIN_QA_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  console.log('WENDING_LOGIN_UI_PASSED', JSON.stringify(result))
  window.destroy()
  app.exit(0)
}

run().catch((error) => { console.error('WENDING_LOGIN_UI_FAILED', error.message); window?.destroy(); app.exit(1) })
process.on('exit', () => { try { rmSync(dataDir, { recursive: true, force: true }) } catch {} })
