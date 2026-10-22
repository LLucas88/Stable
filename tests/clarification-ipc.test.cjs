'use strict'
const { readSource } = require('./helpers/read-source.cjs')
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const helpers={...require('../desktop/services/clarification.cjs'),...require('../desktop/services/clarification-interaction.cjs')};
const assessment=question=>JSON.stringify({status:'waiting',confidence:0.7,missing:'目标读者影响报告内容',question,hint:'可补充用途',options:[{label:'管理层',description:'摘要与建议'},{label:'技术团队',description:'方法与细节'}]});
const rules=fs.readFileSync(path.resolve(__dirname,'../desktop/defaults/AGENTS.md'),'utf8');
const main=readSource(path.resolve(__dirname,'../desktop/main.cjs'),'utf8');
const source=main.slice(main.indexOf("ipcMain.handle('stable:agent:run'"),main.indexOf("ipcMain.handle('stable:agent:steer'"));
function setup(){
 let handler,id=0,prepared=0,executed=0;const messages=[],runs=[],queue=[],failures=[];let executionResult={answer:'完成',trace:[]};
 const runner={supportsTextOnly:true,run:async(...args)=>{runs.push(args);const result=queue.shift();if(result instanceof Error)throw result;return result||'{"status":"ready"}'}};
 const settings=new Map();const store={getSetting:key=>settings.get(key),setSetting:(key,value)=>settings.set(key,value),conversation:()=>({modelId:'mock'}),listMessages:()=>messages,db:{exec:()=>{},prepare:()=>({get:()=>({state:'preparing'})})},addMessage:(_id,role,content,trace,attachments)=>{const m={id:String(++id),role,content,trace,attachments};messages.push(m);return m},updateConversationContext:()=>{},listLibrary:()=>[],listSkills:()=>[],listWorkflows:()=>[]};
 let lastTask;
 vm.runInNewContext(source,{
  messagePredictions:{interrupt(){}},
  taskAlerts:new (require('../desktop/services/task-alerts.cjs').TaskAlerts)({notify:()=>{}}), ...helpers,ipcMain:{handle:(_name,cb)=>handler=cb},requireText:v=>v,modelRegistry:{resolve:()=>({model:{model:'mock'},apiKey:'test-only'})},wendingCli:{forConversation:()=>({login:{pending:false,snapshot:()=>({})}})},createHarnessRunner:()=>runner,conversationLifecycle:{locks:new Map(),checkpoint:()=>{},begin:()=>({duplicate:false}),status:()=>{},finishFailure:(_id,result)=>failures.push(result)},agentRunners:new Map(),randomUUID:()=>String(++id),store,readGlobalInstructions:()=>({content:rules}),conversationPaths:()=>({workspace:'E:/mock-workspace'}),
  prepareAgentMessage:async(payload,_id,_route,displayPayload=payload)=>{prepared++;lastTask=payload;return {messageAttachments:displayPayload.attachments||[],attachments:payload.attachments,selectedReferences:payload.references,extractedAttachments:{installedSkills:[]},selectedData:[],selectedKnowledge:[],selectedSkills:[],selectedScripts:[]}},
  commitAgentMessage:(_id,query,prepared)=>store.addMessage(_id,'user',query,undefined,prepared.messageAttachments),publishAgentState:()=>{},agentState:()=>({messages}),automationIntent:()=>false,
  runAgent:async(query)=>{executed++;lastTask={...lastTask,query};return executionResult},
 });
 return {store,send:prompt=>handler(null,{conversationId:'a',...(typeof prompt==='string'?{prompt}:prompt)}),queue,messages,runs,failures,setResult:result=>{executionResult=result},stats:()=>({prepared,executed,lastTask})};
}
test('actual send handler asks before preparing attachments or running any task, then resumes with original resources',async()=>{
 const env=setup();env.queue.push(assessment('报告给谁看？'));
 await env.send({prompt:'请生成 Word 报告',attachments:[{path:'source.csv',name:'source.csv'}],references:[{kind:'skill',id:'report'}]});
 assert.equal(env.stats().prepared,0);assert.equal(env.stats().executed,0);assert.equal(env.messages.length,2);assert.equal(env.runs[0][7].textOnly,true);assert.equal(env.runs[0][5],'read-only');
 env.queue.push('{"status":"ready"}');await env.send('管理层，三页');
 assert.equal(env.stats().prepared,1);assert.equal(env.stats().executed,1);assert.match(env.stats().lastTask.query,/请生成 Word 报告/);assert.match(env.stats().lastTask.query,/管理层/);assert.equal(env.stats().lastTask.attachments[0].path,'source.csv');assert.equal(env.stats().lastTask.references[0].id,'report');assert.equal(env.messages[2].content,'管理层，三页');
});
test('insufficient follow-up stays waiting and cancellation never prepares or executes the task',async()=>{
 const env=setup();env.queue.push(assessment('报告给谁看？'));await env.send('请生成 Word');
 env.queue.push(assessment('按管理层口径可以吗？'));await env.send('不知道');
 assert.equal(env.stats().executed,0);assert.equal(env.messages.at(-1).trace.at(-1).clarification.status,'waiting');
 await env.send('取消');assert.equal(env.stats().prepared,0);assert.match(env.messages.at(-1).content,/取消/);assert.equal(helpers.pendingClarification(env.messages),null);
});

test('greeting bypasses preflight and complete requests execute despite legacy ask-first rules',async()=>{
 const env=setup();await env.send('你好你叫什么，你能帮我做哪些事');assert.equal(env.runs.length,0);assert.equal(env.stats().executed,1)
 env.queue.push('{"status":"ready"}');await env.send('请解释什么是闭包并给一个 JavaScript 示例');assert.equal(env.stats().executed,2);assert.deepEqual(Array.from(env.messages.at(-1).trace, item => item.id), ['task-continuity'])
})
test('validated card choices resume original resources without re-asking and reject stale replies',async()=>{
 const env=setup();env.queue.push(assessment('报告给谁看？'));await env.send({prompt:'生成 Word 报告',attachments:[{path:'source.csv',name:'source.csv'}]})
 const card=helpers.pendingClarification(env.messages);const calls=env.runs.length
 await env.send({prompt:'forged',clarificationResponse:{id:card.id,source:'choice',option:1}})
 assert.equal(env.runs.length,calls);assert.match(env.stats().lastTask.query,/生成 Word 报告[\s\S]*用户选择[\s\S]*技术团队/);assert.doesNotMatch(env.stats().lastTask.query,/forged/);assert.equal(env.stats().lastTask.attachments[0].path,'source.csv')
 await assert.rejects(env.send({clarificationResponse:{id:card.id,source:'skip'}}),/已经结束/);assert.equal(env.stats().executed,1)
})
test('old timeout, skip and close requests never execute the waiting task',async()=>{
 const env=setup();env.queue.push(assessment('给谁看？'));await env.send('生成 Word 报告');const card=helpers.pendingClarification(env.messages)
 env.store.setSetting('clarification-timer:a',{id:card.id,deadline:0,interacted:false})
 for(const source of ['timeout','skip','close']) await assert.rejects(env.send({clarificationResponse:{id:card.id,source}}),/提交回答/)
 assert.equal(env.stats().executed,0);assert.equal(env.messages.length,2)
 await env.send({clarificationResponse:{id:card.id,source:'custom',text:'给管理层'}})
 assert.equal(env.stats().executed,1)
})
test('renderer cannot forge the internal assessment bypass flag',async()=>{
 const env=setup();env.queue.push(assessment('给谁看？'));await env.send({prompt:'生成报告',clarificationResolved:true});assert.equal(env.stats().executed,0)
})

test('actual send handler continues failed history without calling the assessor',async()=>{
 const env=setup();env.messages.push({role:'user',content:'给卡片加花边'},{role:'assistant',content:'本轮执行失败：工具参数无效。'});
 env.queue.push(new Error('assessor must not run'));
 await env.send('继续');assert.equal(env.runs.length,0);assert.equal(env.stats().executed,1);assert.equal(env.stats().lastTask.query,'继续');
 assert.equal(env.messages[2].content,'继续');
});

test('preflight timeout reports its phase, persists the same error and never starts execution',async()=>{
 const env=setup();env.queue.push(Object.assign(new Error('Claude 任务执行超时。'),{code:'CLAUDE_RUN_TIMEOUT'}));
 await assert.rejects(env.send('请生成报告'),/执行前需求判断超时（90 秒），尚未开始执行本次任务/);
 assert.equal(env.runs[0][3],90_000);assert.equal(env.stats().prepared,0);assert.equal(env.stats().executed,0);assert.equal(env.messages.length,0);
 assert.equal(env.failures[0].state,'rejected');assert.match(env.failures[0].error,/执行前需求判断超时/);
});

test('mid-task clarification timeout does not claim completed operations never ran',async()=>{
 const env=setup();env.queue.push('{"status":"ready"}',Object.assign(new Error('Claude 任务执行超时。'),{code:'CLAUDE_RUN_TIMEOUT'}));
 env.setResult({status:'waiting',answer:'请问报告给谁看？',trace:[]});
 await assert.rejects(env.send('生成报告'),/澄清问题整理超时（90 秒），此前已完成的操作不会回滚/);
 assert.equal(env.stats().executed,1);assert.equal(env.messages.length,1);assert.doesNotMatch(env.failures[0].error,/尚未开始/);
});

test('cancellation and provider failures keep their actual error instead of becoming timeouts',async()=>{
 for(const message of ['任务已停止。','模型服务请求失败（HTTP 401）','模型工具参数无效']){
  const env=setup();env.queue.push(new Error(message));await assert.rejects(env.send('生成报告'),error=>error.message===message);
  assert.equal(env.stats().executed,0);assert.equal(env.failures[0].error,message);
 }
});

test('stop ends a persisted question even with no active runner and clears the reminder',()=>{
 const env=setup(),trace=helpers.clarificationTrace({prompt:'生成报告'},'给谁看？')
 env.messages.push({role:'assistant',content:'给谁看？',trace:[trace]})
 let cancel,finished=0,published=0
 const block=main.slice(main.indexOf("ipcMain.handle('stable:agent:cancel'"),main.indexOf("ipcMain.handle('stable:agent:answerApproval'"))
 vm.runInNewContext(block,{...helpers,randomUUID:()=> 'cancel-delivery',ipcMain:{handle:(_name,cb)=>cancel=cb},requireText:v=>v,agentRunners:new Map(),store:env.store,taskAlerts:{finish:()=>finished++},publishAgentState:()=>published++})
 assert.equal(cancel(null,{conversationId:'a'}),true)
 assert.equal(helpers.pendingClarification(env.messages),null);assert.equal(env.messages.at(-1).content,'本轮已停止。')
 assert.equal(finished,1);assert.equal(published,1)
 assert.equal(cancel(null,{conversationId:'a'}),false);assert.equal(env.stats().executed,0)
})


test('clarification follow-ups do not duplicate previous attachments in either waiting or executing messages',async()=>{
 const env=setup();env.queue.push(assessment('用途？'));await env.send({prompt:'生成报告',attachments:[{path:'old.png',name:'old.png'}]});
 env.queue.push(assessment('页数？'));await env.send('管理层');assert.equal(env.messages[2].attachments,undefined);
 env.queue.push('{"status":"ready"}');await env.send({prompt:'三页',attachments:[{path:'new.png',name:'new.png'}]});
 assert.deepEqual(Array.from(env.stats().lastTask.attachments,i=>i.path),['old.png','new.png']);
 assert.deepEqual(Array.from(env.messages[4].attachments,i=>i.path),['new.png']);
});

test('mid-task question preserves public progress and card explanation in process history',async()=>{
 const env=setup();env.queue.push('{"status":"ready"}');const card=JSON.parse(assessment('是否保留？'));card.explanation='已读取文件，发现额外三行。';
 env.setResult({status:'waiting',answer:card.question,clarification:card,trace:[{id:'progress',kind:'reasoning',eventType:'agent/answer',content:'正在检查截图。'}]});
 await env.send('分析截图');const message=env.messages.at(-1);
 assert.equal(message.trace.find(item=>item.id==='progress').content,'正在检查截图。');assert.equal(message.trace.find(item=>item.id==='clarification-explanation').content,card.explanation);assert.equal(message.trace.at(-1).clarification.question,card.question);
});


test('formatted mid-task question uses the same text as its card so it is not duplicated as a final answer',async()=>{
 const env=setup();env.queue.push('{"status":"ready"}',assessment('需要几页？'));
 env.setResult({status:'waiting',answer:'请先确认报告页数，你希望几页？',trace:[]});
 await env.send('生成报告');const message=env.messages.at(-1);
 assert.equal(message.content,'需要几页？');assert.equal(message.trace.at(-1).clarification.question,message.content);
});


test('actual IPC links repeated questions and the final answer without modifying raw history',async()=>{
 const env=setup();env.queue.push(assessment('报告给谁看？'));await env.send('生成报告');
 const first=env.messages.at(-1),start=first.trace.find(item=>item.id==='task-continuity').startedAt;
 env.queue.push(assessment('需要几页？'));await env.send('管理层');
 const second=env.messages.at(-1),link=second.trace.find(item=>item.id==='task-continuity');
 assert.equal(link.continuationOf,first.id);assert.equal(link.startedAt,start);
 const card=helpers.pendingClarification(env.messages);
 await env.send({prompt:'三页',clarificationResponse:{id:card.id,source:'custom',text:'三页'}});
 const last=env.messages.at(-1).trace.find(item=>item.id==='task-continuity');
 assert.equal(last.continuationOf,second.id);assert.equal(last.startedAt,start);
 assert.equal(env.messages.length,6);assert.equal(env.messages[1],first);assert.equal(env.messages[3],second);
 assert.deepEqual(Array.from(env.messages,m=>m.role),['user','assistant','user','assistant','user','assistant']);
});
