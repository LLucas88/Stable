'use strict'
// Actual React hook and stylesheet in a hidden, network-blocked Electron renderer.
const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const { readFileSync, mkdtempSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.join(__dirname, '../..')
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'stable-composer-ui-'))
app.setPath('userData', dataDir)
app.disableHardwareAcceleration()
let window

async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  window = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true, backgroundThrottling: false } })
  const bundle = buildSync({
    stdin: { contents: `import React, {useRef,useState} from 'react'; import {createRoot} from 'react-dom/client'; import {useComposerAutosize} from './src/use-composer-autosize';
      function TestApp(){const [text,setText]=useState('');const [active,setActive]=useState(true);const ref=useRef(null);
      window.setText=setText;window.setActive=setActive;useComposerAutosize(ref,text,active);
      return <main hidden={!active}><div className="composer"><div className="composer-box">
      <label htmlFor="agent-prompt">给 Stable 一个任务</label><textarea id="agent-prompt" ref={ref} value={text} onChange={e=>setText(e.target.value)}/>
      <div className="composer-actions"><button className="composer-tool" aria-label="附件">＋</button><button className="composer-send" aria-label="发送">↑</button></div>
      </div></div></main>};createRoot(document.getElementById('root')).render(<TestApp/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
  }).outputFiles[0].text
  const css = readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8') + readFileSync(path.join(root, 'src/styles/app.css'), 'utf8')
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="root"></div></html>'))
  await window.webContents.insertCSS(css)
  await window.webContents.executeJavaScript(bundle)
  const result = await window.webContents.executeJavaScript(`(async()=>{
    const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Composer UI wait timed out');};
    const expect=(yes,message)=>{if(!yes)throw Error(message)};
    const tick=()=>new Promise(r=>setTimeout(r,60));
    await wait(()=>document.querySelector('#agent-prompt'));await tick();
    const input=document.querySelector('#agent-prompt');const initial=input.offsetHeight;
    const set=async value=>{window.setText(value);await tick();};
    const nativeInput=async value=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await tick();};
    const long=Array.from({length:30},(_,i)=>'第 '+i+' 行长文本').join('\\n');
    const colors=[];
    for(const theme of ['light','dark']){
      document.documentElement.dataset.theme=theme;await tick();
      for(const lines of [0,1,2,3,4]){await set(Array.from({length:lines},()=> '短文本').join('\\n'));expect(input.offsetHeight===initial,theme+' <=4 lines changed height');}
      await nativeInput('1\\n2\\n3\\n4\\n5');expect(input.offsetHeight>initial&&input.offsetHeight<=2*initial,'Fifth line must expand within 2x');
      await set(long);expect(input.offsetHeight===2*initial,'Long text must cap at exactly 2x');
      expect(input.scrollHeight>input.clientHeight,'Overflow must remain scrollable');
      input.scrollTop=input.scrollHeight;expect(input.scrollTop>0,'Cannot reach bottom');
      input.focus();await nativeInput(long+'\\n末尾继续输入');
      expect(input.scrollTop+input.clientHeight>=input.scrollHeight-2,'Typed ending/caret is outside viewport');
      input.focus();input.setSelectionRange(2,7);const position=input.scrollTop;
      window.dispatchEvent(new Event('resize'));await tick();
      expect(input.selectionStart===2&&input.selectionEnd===7,'Resize changed selection');
      expect(input.scrollTop===position,'Resize lost scroll position');
      expect(document.activeElement===input,'Resize lost focus');
      const style=getComputedStyle(input);expect(style.resize==='none','Manual resize grip remains');
      expect(style.overflowY==='auto'&&style.scrollbarGutter==='stable','Scrollbar must remain usable and stable');
      for(const part of ['::-webkit-scrollbar-track','::-webkit-scrollbar-corner','::-webkit-scrollbar-button'])expect(getComputedStyle(input,part).backgroundColor==='rgba(0, 0, 0, 0)','Scrollbar background is not transparent');
      colors.push(getComputedStyle(input,'::-webkit-scrollbar-thumb').backgroundColor);
      const buttons=Array.from(document.querySelectorAll('.composer-actions button')).map(e=>e.getBoundingClientRect());
      expect(buttons.every(r=>r.bottom<innerHeight&&r.left>=0&&r.right<=innerWidth),'Toolbar clipped');
      await set('恢复短文本');expect(input.offsetHeight===initial,'Deleting text did not restore height');
      await set('');expect(input.offsetHeight===initial&&input.scrollTop===0,'Clear/send did not reset height/scroll');
    }
    expect(colors[0]!==colors[1],'Scrollbar has no light/dark treatment');
    // Soft wraps, sidebar/preview width changes, and long unbroken text.
    const box=document.querySelector('.composer-box');box.style.width='850px';await tick();
    const wrapped='会员经营数据分析'.repeat(15);await set(wrapped);expect(input.offsetHeight===initial,'Wide short wrap unexpectedly expanded');
    box.style.width='280px';await tick();expect(input.offsetHeight===2*initial,'Narrow soft wraps did not expand');
    expect(input.scrollWidth===input.clientWidth,'Long text created horizontal scrolling');
    box.style.width='850px';await tick();expect(input.offsetHeight===initial,'Widening did not restore height');
    await set('x'.repeat(2000));expect(input.offsetHeight===2*initial&&input.scrollWidth===input.clientWidth,'Unbroken text sizing/overflow failed');
    window.setActive(false);await tick();await set(long);window.setActive(true);await tick();expect(input.offsetHeight===2*initial,'Returning from hidden page lost sizing');
    await set('');expect(input.offsetHeight===initial,'New draft height did not reset');
    document.documentElement.style.fontSize='24px';window.dispatchEvent(new Event('resize'));await tick();const enlarged=input.offsetHeight;
    expect(enlarged>initial,'Baseline must follow font scaling');await set(long);expect(input.offsetHeight===2*enlarged,'Scaled height did not cap at 2x: '+JSON.stringify({initial,enlarged,height:input.offsetHeight,min:getComputedStyle(input).minHeight,max:getComputedStyle(input).maxHeight,inline:input.style.height}));
    return {initial,max:initial*2,themes:2,explicitAndSoftWraps:true,shrinkClearHiddenResize:true,focusSelectionScrollPreserved:true};
  })()`)
  console.log('COMPOSER_AUTOSIZE_UI_PASSED', JSON.stringify(result))
  window.destroy();app.exit(0)
}

run().catch(error=>{console.error('COMPOSER_AUTOSIZE_UI_FAILED',error.message);window?.destroy();app.exit(1)})
process.on('exit',()=>{try{rmSync(dataDir,{recursive:true,force:true})}catch{}})
