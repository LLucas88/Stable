const {app,BrowserWindow,session}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),output=path.join(root,'qa-artifacts/clarification-card');fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'page-profile-')));app.disableHardwareAcceleration()
let win
async function main(){
 await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}))
 win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true}})
 const source=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8').replace('function AgentPage(','export function AgentPage(')
 const bundle=(await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AgentPage} from './src/App';
 window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
 const q={id:'question-1',status:'waiting',question:'这份报告主要面向谁？',hint:'受众影响内容深度。可补充报告用途和页数。',options:[{label:'管理层决策摘要',description:'突出结论和建议。'},{label:'专业团队详细分析',description:'展开方法和数据细节。'}]};
 let messages=[{id:'u',role:'user',content:'请生成一份 Word 报告',createdAt:new Date().toISOString()},{id:'a',role:'assistant',content:q.question,trace:[{id:'clarification',runId:'c',kind:'status',status:'completed',title:'等待补充信息',time:Date.now(),clarification:q}],createdAt:new Date().toISOString()}];
 const initial={activeConversationId:'a',conversations:[{id:'a',title:'报告生成',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false}],messages,projects:[],data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'E:/mock'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
 const state=()=>({...initial,messages});let listener;window.sent=[];window.errors=[];window.timer={id:q.id,deadline:Date.now()+20000,interacted:false};
 window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:()=>()=>{},onSelectAllMessages:()=>()=>{}},agent:{viewState:async()=>({}),onEvent:fn=>{listener=fn;return()=>{}},state:async()=>state(),configure:async()=>state(),clarificationTimer:async(_c,_id,action)=>{if(action==='interact')window.timer.interacted=true;return {...window.timer}},run:async(...args)=>{window.sent.push(args);messages=[...messages,{id:'reply',role:'user',content:args[1]},{id:'done',role:'assistant',content:'已按专业团队要求完成报告。'}];return {...state(),answer:'完成',library:[],skills:[],workflows:[]}}}};
 function Test(){const [value,setValue]=useState(initial);return <AgentPage active={true} state={value} prefill="" consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.errors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
 createRoot(document.getElementById('root')).render(<Test/>);
 `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.png':'dataurl','.mp4':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'export-page',setup(b){b.onLoad({filter:/[\\/]src[\\/]App\.tsx$/},()=>({contents:source,loader:'tsx',resolveDir:path.join(root,'src')}))}}]})).outputFiles[0].text
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><body><div id="tasks" style="display:none"></div><div id="root" style="height:100vh"></div></body></html>'))
 await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles/tokens.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/app.css'),'utf8'))
 await win.webContents.executeJavaScript(bundle);await new Promise(r=>setTimeout(r,500))
 const metrics=await win.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.composer .clarification-card'),send=card?.querySelector('.clarification-send'),input=document.querySelector('#agent-prompt');return {card:!!card,send:send?.textContent,input:!!input,bottom:send?.getBoundingClientRect().bottom,height:innerHeight,layout:getComputedStyle(card.querySelector('.clarification-option')).display}})()`)
 assert.ok(metrics.card&&metrics.input,JSON.stringify(metrics));assert.equal(metrics.layout,'flex');assert.match(metrics.send,/发送 \(\d+s\)/);assert.ok(metrics.bottom<=metrics.height,JSON.stringify(metrics))
 fs.writeFileSync(path.join(output,'agent-page.jpg'),(await win.webContents.capturePage()).toJPEG(75))
 await win.webContents.executeJavaScript(`document.querySelectorAll('.clarification-card input')[1].click()`);await new Promise(r=>setTimeout(r,80));await win.webContents.executeJavaScript(`document.querySelector('.clarification-send').click()`);await new Promise(r=>setTimeout(r,300))
 const result=await win.webContents.executeJavaScript(`({sent:window.sent,errors:window.errors,card:!!document.querySelector('.clarification-card'),text:document.body.innerText})`)
 assert.equal(result.sent.length,1,JSON.stringify(result));assert.deepEqual(result.sent[0][5],{id:'question-1',source:'choice',option:1});assert.equal(result.card,false);assert.match(result.text,/已按专业团队要求完成报告/);assert.deepEqual(result.errors,[])
 console.log('CLARIFICATION_AGENT_PAGE_UI_PASSED');win.destroy();app.quit()
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
