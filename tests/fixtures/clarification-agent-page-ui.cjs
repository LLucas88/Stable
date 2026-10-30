const { readSource } = require('./../helpers/read-source.cjs')
const {app,BrowserWindow,session}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),output=path.join(root,'qa-artifacts/clarification-card');fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'page-profile-')));app.disableHardwareAcceleration()
let win
async function main(){
 await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}))
 win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true}})
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.log('RENDERER',message)});
 const source= fs.readFileSync(path.join(root,'src/App.tsx'),'utf8').replace('function AgentPage(','export function AgentPage(')
 const parsedCard = require('../../desktop/services/clarification.cjs').waitingCard('已收到源表，读者决定报告内容深度。\n\n[[STABLE_WAITING_FOR_INPUT]]\n' + JSON.stringify({question:'这份报告主要面向谁？',hint:'受众影响内容深度。可补充报告用途和页数。',options:[{label:'管理层决策摘要',description:'突出结论和建议。'},{label:'专业团队详细分析',description:'展开方法和数据细节。'}]}))
 assert.ok(parsedCard)
 const bundle=(await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AgentPage} from './src/App';
 window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);
 const taskStart=Date.now()-90000;
 const q={...${JSON.stringify(parsedCard)},id:'question-1',status:'waiting'};
 let messages=[{id:'u',role:'user',content:'请生成一份 Word 报告',createdAt:new Date().toISOString()},{id:'a',role:'assistant',content:q.question,trace:[{id:'task-continuity',runId:'initial',kind:'status',status:'completed',time:taskStart,startedAt:taskStart},{id:'explanation',runId:'c',kind:'reasoning',eventType:'agent/answer',status:'completed',content:'已收到源表，读者决定报告内容深度。',time:Date.now()},{id:'clarification',runId:'c',kind:'status',status:'completed',title:'等待补充信息',time:Date.now(),clarification:q}],createdAt:new Date().toISOString()}];
 const initial={cloud:{status:'disabled',enabled:false},activeConversationId:'a',conversations:[{id:'a',title:'报告生成',capability:'auto',permissionMode:'full',modelId:'mock',dataIds:[],pinned:false,messageCount:2,waitingForInput:true}],messages,projects:[],data:[],skills:[],knowledge:[],library:[],workflows:[],theme:'light',paths:{workspace:'E:/mock'},models:{items:[{id:'mock',displayName:'测试模型',model:'mock',providerId:'mock'}],defaultModelId:'mock'},team:{devices:[],conversationOffers:[]}};
 const state=()=>({...initial,messages,conversations:initial.conversations.map(c=>({...c,waitingForInput:messages.at(-1)?.id==='a'}))});let listener;window.sent=[];window.errors=[];window.timer={id:q.id,deadline:Date.now()+20000,interacted:false};
 window.stable={appearance:{setCompletedCount:async()=>{}},preview:{close:async()=>{},onEvent:()=>()=>{}},files:{path:()=>''},editor:{onPasteIntoComposer:()=>()=>{},onSelectAllMessages:()=>()=>{}},agent:{viewState:async()=>({}),onEvent:fn=>{listener=fn;return()=>{}},state:async()=>state(),configure:async()=>state(),clarificationTimer:async(_c,_id,action)=>{if(action==='interact')window.timer.interacted=true;return {...window.timer}},run:async(...args)=>{window.sent.push(args);messages=[...messages,{id:'reply',createdAt:new Date().toISOString(),role:'user',content:'【用户选择】\\n问题：'+q.question+'\\n路线：'+q.options[args[5].option].label+'\\n处理提示：'+q.options[args[5].option].description},{id:'done',createdAt:new Date().toISOString(),role:'assistant',content:'已按专业团队要求完成报告。',trace:[{id:'task-continuity',runId:args[4],continuationOf:'a',kind:'status',status:'completed',time:taskStart,startedAt:taskStart},{id:'complete',kind:'status',status:'completed',time:Date.now()}]}];const done=messages.pop();window.publishState();await new Promise(resolve=>window.finishRun=resolve);messages.push(done);return {...state(),answer:'完成',library:[],skills:[],workflows:[]}}}};
 function Test(){const [value,setValue]=useState(initial);window.publishState=()=>setValue(state());window.switchTask=away=>setValue({...initial,activeConversationId:away?'b':'a',conversations:[...initial.conversations,{...initial.conversations[0],id:'b',title:'其他任务',waitingForInput:false}],messages:away?[]:messages});return <AgentPage active={true} state={value} prefill="" consumePrefill={()=>{}} updateAgent={v=>setValue(s=>({...s,...v}))} updateAutomations={()=>{}} updateTeam={()=>{}} action={async(_,fn)=>{try{await fn()}catch(e){window.errors.push(e.message)}}} openConversation={()=>{}} conversationTasksTarget={document.getElementById('tasks')}/>}
 createRoot(document.getElementById('root')).render(<Test/>);
 `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.svg':'dataurl','.png':'dataurl','.mp4':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'export-page',setup(b){b.onLoad({filter:/[\\/]src[\\/]App\.tsx$/},()=>({contents:source,loader:'tsx',resolveDir:path.join(root,'src')}))}}]})).outputFiles[0].text
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><body><div id="tasks" style="display:none"></div><div id="root" style="height:100vh"></div></body></html>'))
 for(const name of ['context-usage.css','answer-tools.css','tool-trace.css','tokens.css','app.css','workbench-surfaces.css']) await win.webContents.insertCSS(readSource(path.join(root,'src/styles',name),'utf8'))
 await win.webContents.executeJavaScript(bundle);await new Promise(r=>setTimeout(r,500))
 const timerBefore=await win.webContents.executeJavaScript(`document.querySelector('.trace-elapsed')?.textContent`);assert.match(timerBefore,/1分钟/);
 await new Promise(r=>setTimeout(r,1200));
 assert.notEqual(await win.webContents.executeJavaScript(`document.querySelector('.trace-elapsed')?.textContent`),timerBefore);
 const metrics=await win.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.composer .clarification-card'),send=card?.querySelector('.clarification-send'),input=document.querySelector('#agent-prompt');return {card:!!card,send:send?.textContent,input:!!input,bottom:send?.getBoundingClientRect().bottom,height:innerHeight,layout:getComputedStyle(card.querySelector('.clarification-option')).display}})()`)
 assert.ok(metrics.card&&metrics.input,JSON.stringify(metrics));assert.equal(metrics.layout,'flex');assert.equal(metrics.send,'发送');assert.ok(metrics.bottom<=metrics.height,JSON.stringify(metrics))
 fs.writeFileSync(path.join(output,'agent-page.jpg'),(await win.webContents.capturePage()).toJPEG(75))
 await win.webContents.executeJavaScript(`document.querySelector('.clarification-card-heading button').click()`);await new Promise(r=>setTimeout(r,80))
 assert.equal(await win.webContents.executeJavaScript(`window.sent.length`),0)
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.clarification-card').getClientRects().length`),0)
 assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.conversation-input-badge')?.textContent`),'需要用户回答')
 await win.webContents.executeJavaScript(`document.querySelector('.clarification-collapsed button').click()`);await new Promise(r=>setTimeout(r,80))
 await win.webContents.executeJavaScript(`window.switchTask(true)`);await new Promise(r=>setTimeout(r,80))
 assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('.clarification-card')`),false)
 assert.equal(await win.webContents.executeJavaScript(`window.sent.length`),0)
 await win.webContents.executeJavaScript(`window.switchTask(false)`);await new Promise(r=>setTimeout(r,80))
 assert.ok(await win.webContents.executeJavaScript(`document.querySelector('.clarification-card').getClientRects().length > 0`))
 await win.webContents.executeJavaScript(`document.querySelectorAll('.clarification-card input')[1].click()`);await new Promise(r=>setTimeout(r,80));await win.webContents.executeJavaScript(`document.querySelector('.clarification-send').click()`);await new Promise(r=>setTimeout(r,300))
 const pending=await win.webContents.executeJavaScript(`({bubbles:document.querySelectorAll('.user-bubble').length,question:document.querySelector('.user-question')?.textContent,assistant:!!document.querySelector('[data-message-id="a"]'),radius:getComputedStyle(document.querySelector('.user-bubble[data-clarification]')).borderRadius,text:document.querySelector('.conversation-stream').innerText})`)
 assert.equal(pending.bubbles,2);assert.equal(pending.question,'这份报告主要面向谁？');assert.equal(pending.assistant,true);assert.equal(pending.radius,'22px');assert.doesNotMatch(pending.text,/本次任务没有额外执行记录/)
 assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('[data-message-id="a"] .assistant-answer')`),false)
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.run-trace').length`),1);
 assert.match(await win.webContents.executeJavaScript(`document.querySelector('.trace-elapsed').textContent`),/1分钟/);
 await win.webContents.executeJavaScript(`document.querySelector('[data-message-id="a"] .trace-summary').click()`);await new Promise(r=>setTimeout(r,80))
 assert.match(await win.webContents.executeJavaScript(`document.querySelector('[data-message-id="a"]').innerText`),/已收到源表，读者决定报告内容深度/)
 fs.writeFileSync(path.join(output,'answer-bubble.png'),(await win.webContents.capturePage()).toPNG())
 await win.webContents.executeJavaScript('window.finishRun()');await new Promise(r=>setTimeout(r,200))
 assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.run-trace').length`),1);
 await win.webContents.executeJavaScript(`document.querySelector('.trace-summary').click()`);await new Promise(r=>setTimeout(r,80));
 const result=await win.webContents.executeJavaScript(`({sent:window.sent,errors:window.errors,card:!!document.querySelector('.clarification-card'),text:document.body.innerText})`)
 assert.equal(result.sent.length,1,JSON.stringify(result));assert.deepEqual(result.sent[0][5],{id:'question-1',source:'choice',option:1});assert.equal(result.card,false);assert.match(result.text,/已按专业团队要求完成报告/);assert.deepEqual(result.errors,[]);assert.doesNotMatch(result.text,/处理提示：|展开方法和数据细节/);assert.match(result.text,/专业团队详细分析/)
 console.log('CLARIFICATION_AGENT_PAGE_UI_PASSED');win.destroy();app.quit()
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
