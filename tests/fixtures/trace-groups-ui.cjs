'use strict'
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/trace-groups')
fs.mkdirSync(output, {recursive:true});app.setPath('userData', fs.mkdtempSync(path.join(output,'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback)=>callback({cancel:/^https?:/.test(details.url)}))
  win = new BrowserWindow({show:false,width:1100,height:820,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}})
  const source = fs.readFileSync(path.join(root,'src/App.tsx'),'utf8').replace('function RunTrace(', 'export function RunTrace(')
  const bundle = (await build({stdin:{contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {RunTrace} from './src/App';
    const item=(id,time,props={})=>({id,runId:'r',kind:'tool',title:'使用工具 stable_excel',status:'completed',time,...props});
    const entries=[item('intro',1,{kind:'reasoning',eventType:'agent/answer',content:'先探查数据源，确认可以使用的经营指标。'}),
      ...Array.from({length:30},(_,i)=>item('excel-'+i,i+2,{status:i===12?'failed':'completed',detail:'操作明细 '+i})),
      item('next',40,{kind:'reasoning',eventType:'agent/answer',content:'开始生成报告并检查文件。'}),
      item('exec',41,{title:'使用工具 stable_exec',status:'running'}),
      item('approval',42,{kind:'approval',title:'需要审批',reason:'确认命令权限',status:'running',requestId:'req'})];
    function Test(){const [state,setState]=useState({items:entries,status:'running',active:true});window.updateTrace=setState;window.entries=entries;
      return <RunTrace {...state} startedAt={Date.now()-10000}/>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.svg':'dataurl','.png':'dataurl','.mp4':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"','import.meta.env.BASE_URL':'"/"'},plugins:[{name:'export-trace',setup(b){b.onLoad({filter:/[\\/]src[\\/]App\.tsx$/},()=>({contents:source,loader:'tsx',resolveDir:path.join(root,'src')}))}}]})).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><div id="root" style="max-width:900px;padding:30px;margin:auto"></div></html>'))
  await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/tokens.css'),'utf8')+fs.readFileSync(path.join(root,'src/styles/app.css'),'utf8'))
  await win.webContents.executeJavaScript(bundle)
  await win.webContents.executeJavaScript(`
    window.tick=()=>new Promise(r=>setTimeout(r,50));window.wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick()}throw Error('Timeout: '+fn)};
    window.expect=(ok,message)=>{if(!ok)throw Error(message)};undefined;
  `)
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelectorAll('.trace-group').length===2);
    expect(document.querySelectorAll('.trace-text').length===2,'Progress summaries disappeared');
    expect(getComputedStyle(document.querySelector('.trace-text-content')).color==='rgb(0, 0, 0)','Light progress prose must be black');
    expect(getComputedStyle(document.querySelector('.trace-summary')).color!=='rgb(0, 0, 0)','Time and status colors changed');
    expect(getComputedStyle(document.querySelector('.trace-group')).color!=='rgb(0, 0, 0)','Tool summary color changed');
    expect(!document.querySelector('.trace-group[open]'),'Groups must start folded');
    expect(!document.querySelector('.run-trace .spin'),'Trace spinners must be removed');
    expect(document.querySelectorAll('.trace-running-label').length===2,'Only the running tool and its group should animate');
    const label=document.querySelector('.trace-group-label.trace-running-label');
    expect(getComputedStyle(label).animationName==='trace-text-shimmer','Running label animation missing');
    const pos=getComputedStyle(label).backgroundPosition;await new Promise(r=>setTimeout(r,150));
    expect(getComputedStyle(label).backgroundPosition!==pos,'Running animation is not advancing');
    expect(!document.querySelector('.trace-action-state.trace-running-label, .trace-issue.trace-running-label'),'State colors must not animate');
    const first=document.querySelector('.trace-group');
    expect(!Array.from(document.querySelectorAll('.trace-group > summary')).some(node=>/项操作/.test(node.textContent)),'Operation totals must be hidden');
    const timer=document.querySelector('.trace-elapsed');
    expect(!timer.textContent.includes('思考中'),'Thinking label must be hidden');
    expect(timer.textContent.trim().length>0 && timer.getAttribute('aria-label').startsWith('执行时长 '),'Elapsed time must remain visible and accessible');
    expect(first.querySelector('summary .trace-issue').getBoundingClientRect().height>0,'Failure hidden when group folded');
    expect(first.querySelector('.trace-action').getBoundingClientRect().height===0,'Folded tools are visible');
    expect(document.querySelector('.trace-timeline > .trace-action').getBoundingClientRect().height>0,'Pending approval hidden');
    first.querySelector('summary').click();await tick();
    const list=first.querySelector('.trace-group-items');expect(list.scrollHeight>list.clientHeight,'Expanded list must scroll');
    expect(list.clientHeight<=320,'Expanded group exceeds height cap');
    first.querySelector('.trace-action summary').click();await tick();
    expect(first.querySelector('.trace-action-detail').getBoundingClientRect().height>0,'Individual tool detail inaccessible');
    window.updateTrace(s=>({...s,items:[...s.items,{id:'more',runId:'r',kind:'tool',title:'使用工具 Read',status:'completed',time:32.5}]}));await tick();
    expect(document.querySelector('.trace-group').open,'Streaming closed user-expanded group');
  })()`)
  fs.writeFileSync(path.join(output,'expanded.png'),(await win.webContents.capturePage()).toPNG())
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await win.webContents.executeJavaScript(`expect(getComputedStyle(document.querySelector('.trace-running-label')).animationName==='none','Reduced motion must disable shimmer')`)
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]})
  win.webContents.debugger.detach()
  await win.webContents.executeJavaScript(`(async()=>{
    window.updateTrace(s=>({...s,status:'completed',active:false,items:s.items.map(x=>x.status==='running'?{...x,status:'completed'}:x)}));await tick();
    expect(!document.querySelector('.trace-timeline'),'Completed history should initially fold whole trace');
    expect(document.querySelector('.trace-summary .trace-issue').getBoundingClientRect().height>0,'Historical failure lost in outer summary');
    document.querySelector('.trace-summary').click();await tick();
    expect(!document.querySelector('.trace-group[open]'),'Historical groups must start folded');
    expect(!document.querySelector('.trace-pending'),'Completed approval still pending');
    expect(!document.querySelector('.trace-running-label'),'Completed trace must stop animating');
    document.documentElement.dataset.theme='dark';await tick();
    expect(getComputedStyle(document.querySelector('.trace-text-content')).color===getComputedStyle(document.querySelector('.trace-text')).color,'Dark theme progress color changed');
  })()`)
  fs.writeFileSync(path.join(output,'collapsed-dark.png'),(await win.webContents.capturePage()).toPNG())
  console.log('TRACE_GROUPS_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(e=>{console.error(e);win?.destroy();app.exit(1)})
