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
    const item=(id,time,props={})=>({id,runId:'r',kind:'tool',title:'使用工具 stable_excel',status:'completed',time,startedAt:time-1250,...props});
    const entries=[item('intro',1,{kind:'reasoning',eventType:'agent/answer',content:'先检查资料，然后修改报告。'}),
      item('read',2,{toolName:'Read',inputDetail:'{"file_path":"source.xlsx"}'}),
      item('browser',3,{toolName:'stable_browser',inputDetail:'{"action":"open"}'}),
      item('env',4,{kind:'status',id:'runtime-info',title:'执行环境'}),
      item('automatic',5,{kind:'approval',automaticApproval:true,title:'完全访问权限'}),
      item('write',6,{toolName:'Write',inputDetail:JSON.stringify({file_path:'report.html',content:'完整文件内容'}),detail:'文件已写入'}),
      item('next',7,{kind:'reasoning',eventType:'agent/answer',content:'现在更新页面样式。'}),
      item('exec',8,{toolName:'Bash',inputDetail:'python -c "from pathlib import Path; Path(\\\'report.html\\\').write_text(\\\''+'长命令'.repeat(160)+'\\\') )"',status:'running',startedAt:Date.now()-1000}),
      item('failed',9,{toolName:'Read',status:'failed',detail:'文件不存在'}),
      item('approval',10,{kind:'approval',title:'需要审批',reason:'确认命令权限',status:'running',requestId:'req'})];
    function Test(){const [state,setState]=useState({items:entries,status:'running',active:true});window.updateTrace=setState;window.entries=entries;
      return <RunTrace {...state} startedAt={Date.now()-10000}/>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.svg':'dataurl','.png':'dataurl','.mp4':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"','import.meta.env.BASE_URL':'"/"'},plugins:[{name:'export-trace',setup(b){b.onLoad({filter:/[\\/]src[\\/]App\.tsx$/},()=>({contents:source,loader:'tsx',resolveDir:path.join(root,'src')}))}}]})).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><div id="root" style="max-width:900px;padding:30px;margin:auto"></div></html>'))
  await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/tokens.css'),'utf8')+fs.readFileSync(path.join(root,'src/styles/app.css'),'utf8')+fs.readFileSync(path.join(root,'src/styles/tool-trace.css'),'utf8'))
  await win.webContents.executeJavaScript(bundle)
  await win.webContents.executeJavaScript(`
    window.tick=()=>new Promise(r=>setTimeout(r,50));window.wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await tick()}throw Error('Timeout: '+fn)};
    window.expect=(ok,message)=>{if(!ok)throw Error(message)};undefined;
  `)
  await win.webContents.executeJavaScript(`(async()=>{
    await wait(()=>document.querySelectorAll('.trace-action').length===3);
    expect(document.querySelectorAll('.trace-text').length===2,'Public progress text missing');
    expect(!document.querySelector('.trace-group'),'Obsolete outer operation groups remain');
    expect(!document.querySelector('.trace-action[open]'),'Commands should start folded');
    expect(!document.body.textContent.includes('执行环境')&&!document.body.textContent.includes('完全访问权限'),'Environment and auto approvals remain visible');
    expect(!document.body.textContent.includes('source.xlsx')&&!document.body.textContent.includes('stable_browser'),'Read-only tools remain visible');
    expect(document.querySelector('.trace-command').textContent==='Write report.html','File operation path not shown');
    await wait(()=>document.querySelector('.trace-running-label')?.textContent.startsWith('python -c'));
    const running=document.querySelector('.trace-running-label');
    expect(running.textContent.startsWith('python -c'),'Bash command not shown first');
    expect(getComputedStyle(running).whiteSpace==='nowrap'&&getComputedStyle(running).textOverflow==='ellipsis','Command is not one-line truncated');
    expect(running.scrollWidth>running.clientWidth,'Fixture command must exceed one line');
    expect(!document.querySelector('.trace-issue'),'Failure count remains inline');
    expect(!document.querySelector('.trace-action[data-status="completed"] .trace-action-state'),'Tool status remains inline');
    expect(getComputedStyle(running).animationName==='trace-text-shimmer','Running command animation missing');
    expect(getComputedStyle(document.querySelector('.trace-activity i')).animationName==='conversation-dot','Activity animation missing');
    running.closest('summary').click();await tick();
    const expanded=document.querySelector('.trace-action[open]');
    expect(expanded.querySelector('pre').textContent===window.entries.find(x=>x.id==='exec').inputDetail,'Expanded command lost content');
    expect(document.querySelector('.trace-elapsed').textContent.length>0,'Elapsed time lost');
    window.updateTrace(s=>({...s,items:[...s.items,{id:'hidden-read',kind:'tool',toolName:'Grep',status:'completed',time:9.5}]}));await tick();
    expect(document.querySelector('.trace-action[open]'),'Incoming events closed expanded command');
  })()`)
  await win.webContents.executeJavaScript(`(async()=>{
    window.updateTrace(s=>({...s,streaming:{id:'stream',time:11,content:'正在生成新的操作说明。'.repeat(20)}}));await tick();
    const live=document.querySelector('.trace-text[data-live] .trace-text-content');
    expect(live&&live.textContent.length>0&&live.textContent.length<200,'Progress did not reveal incrementally');
    expect(getComputedStyle(document.querySelector('.trace-stream-cursor')).animationName==='trace-cursor','Streaming cursor animation missing');
    const initial=live.textContent.length;await tick();expect(live.textContent.length>initial,'Progress stopped streaming');
    window.updateTrace(s=>({...s,streaming:{...s.streaming,content:s.streaming.content+'追加片段'}}));
    await wait(()=>live.textContent.endsWith('追加片段'));
    document.querySelector('.tool-trace-button').click();await tick();
    const panel=document.querySelector('.tool-trace-dialog');
    expect(panel.open,'Trace did not open');
    expect(panel.querySelectorAll('.tool-trace-row').length===6,'Trace must include read and search calls');
    expect(panel.textContent.includes('1 次失败'),'Trace failure count missing');
    const failed=panel.querySelector('[data-status="failed"]');failed.querySelector('summary').click();await tick();
    expect(failed.open&&failed.querySelector('pre').getBoundingClientRect().height>0,'Trace result did not expand');
    expect(failed.textContent.includes('1.3 秒')&&failed.textContent.includes('文件不存在'),'Trace duration or error result missing');
    const written=[...panel.querySelectorAll('.tool-trace-row')].find(row=>row.textContent.includes('Write'));written.querySelector('summary').click();await tick();
    expect(written.querySelector('pre').textContent==='文件已写入','Trace result is not tool output');
    expect(!panel.textContent.includes('完整文件内容'),'Trace unexpectedly includes input parameters');
  })()`)
  fs.writeFileSync(path.join(output,'tool-trace-results.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="关闭 Trace"]').click()`)
  fs.writeFileSync(path.join(output,'file-commands.png'),(await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`(async()=>{
    window.updateTrace(s=>({...s,status:'completed',active:false,items:s.items.map(x=>x.status==='running'?{...x,status:'completed'}:x)}));await tick();
    expect(!document.querySelector('.trace-timeline'),'Historical run must start folded');
    document.querySelector('.trace-summary').click();await tick();
    expect(!document.querySelector('.trace-running-label'),'Completed command still animates');
    expect(!document.querySelector('.trace-pending'),'Completed approval remains pending');
    expect(document.querySelectorAll('.trace-action').length===2,'Completed records show wrong operations');
  })()`)
  console.log('TRACE_GROUPS_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(e=>{console.error(e);win?.destroy();app.exit(1)})
