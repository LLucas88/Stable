'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {clarifyBeforeExecution,pendingClarification,clarificationTrace,waitingAnswer,WAIT_MARKER,clarificationStream}=require('../desktop/services/clarification.cjs');
const {runWithDeliveryChecks,deliveryRequest}=require('../desktop/services/delivery.cjs');
const rules=fs.readFileSync(path.resolve(__dirname,'../desktop/defaults/AGENTS.md'),'utf8');
const payload={prompt:'请生成 Word 报告',attachments:[{path:'report.csv',name:'report.csv'}],references:[{kind:'skill',id:'report',name:'报告'}]};
const history=result=>[{role:'user',content:payload.prompt},{role:'assistant',content:result.answer,trace:result.trace}];
const chunk=(delta,finish_reason=null)=>({choices:[{index:0,delta,finish_reason}]});
const upstream=chunks=>new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
function sandbox(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-clarification-'));t.after(()=>{const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true})});return root}

const assessment=(extra={})=>JSON.stringify({status:'waiting',confidence:0.7,missing:'报告读者决定内容深度',question:'这份报告的目标读者是谁？',hint:'可补充用途和页数',options:[{label:'管理层摘要',description:'突出结论和决策建议'},{label:'专业团队分析',description:'展开数据及方法细节'}],...extra});
test('only meaningful uncertainty below 90% produces a card despite old ask-every-time rules',async()=>{
 for(const raw of ['{"status":"ready"}',assessment({confidence:0.9}),assessment({confidence:0.99}),assessment({confidence:-1}),assessment({confidence:'0.7'}),assessment({missing:''}),assessment({options:[]}), 'invalid']){
  const result=await clarifyBeforeExecution({payload,messages:[],instructions:rules,ask:async()=>raw});assert.equal(result.status,'ready');
 }
 const result=await clarifyBeforeExecution({payload,messages:[],instructions:rules,ask:async()=>assessment({confidence:0.89})});assert.equal(result.status,'waiting');assert.equal(result.trace[0].clarification.options.length,2);
});
test('screenshot greeting and capability questions never invoke the assessor',async()=>{
 for(const prompt of ['你好你叫什么，你能帮我做哪些事','你好','你是谁？','你能做什么？']){
  const result=await clarifyBeforeExecution({payload:{prompt},messages:[],instructions:rules,ask:async()=>{throw Error('unexpected assessment')}});assert.equal(result.status,'ready');
 }
});

test('clarification survives serialization and resumes original delivery, attachments and references',async()=>{
 const first=await clarifyBeforeExecution({payload,messages:[],instructions:rules,ask:async()=>assessment()});
 const messages=JSON.parse(JSON.stringify(history(first)));
 const next=await clarifyBeforeExecution({payload:{prompt:'管理层，三页即可',attachments:[{name:'extra.csv',path:'extra.csv'}]},messages,instructions:rules,ask:async prompt=>{assert.match(prompt,/目标读者/);assert.match(prompt,/管理层/);return '{"status":"ready"}'}});
 assert.equal(next.status,'ready');assert.match(next.payload.prompt,/请生成 Word 报告/);assert.equal(deliveryRequest(next.payload.prompt).type,'artifact');assert.equal(next.payload.attachments.length,2);assert.equal(next.payload.references[0].id,'report');
 const further=await clarifyBeforeExecution({payload:{prompt:'还没想好'},messages,instructions:rules,ask:async()=>assessment({question:'以管理层为读者可以吗？'})});
 assert.equal(further.status,'waiting');assert.match(further.trace[0].clarification.payload.prompt,/还没想好/);
});

test('cancel and explicit new task do not accidentally execute the pending request',async()=>{
 const messages=[{role:'assistant',trace:[clarificationTrace(payload,'给谁看？')]}];let asks=0;
 const cancel=await clarifyBeforeExecution({payload:{prompt:'取消'},messages,instructions:rules,ask:async()=>{asks++;}});
 assert.equal(cancel.status,'cancelled');assert.equal(asks,0);
 const fresh=await clarifyBeforeExecution({payload:{prompt:'新任务：解释折扣率'},messages,instructions:rules,ask:async()=>'{"status":"waiting","question":"需要计算示例吗？"}'});
 assert.equal(fresh.payload.attachments.length,0);assert.doesNotMatch(fresh.payload.prompt,/Word/);
 assert.equal(pendingClarification([{role:'assistant',content:'完成'}]),null);
});

test('delivery stops once for marked and unmarked questions while ordinary plans still retry',async t=>{
 const workspace=sandbox(t);
 for(const answer of ['开始前，请问这份报告的目标读者是谁？',WAIT_MARKER+'\n请补充风格要求。']){
  let calls=0;const result=await runWithDeliveryChecks({workspace,delivery:deliveryRequest(payload.prompt),prompt:payload.prompt,execute:async()=>{calls++;return answer}});
  assert.equal(calls,1);assert.equal(result.status,'waiting');assert.ok(!result.answer.includes(WAIT_MARKER));
 }
 let calls=0;const result=await runWithDeliveryChecks({workspace,delivery:deliveryRequest(payload.prompt),prompt:payload.prompt,execute:async()=>{calls++;return '我计划下一步生成报告。'}});
 assert.equal(calls,3);assert.equal(result.status,'failed');assert.equal(waitingAnswer('分析结果：为什么增长？原因如下。'),null);
});

test('streamed waiting marker is hidden even across token boundaries and leaves other messages intact',()=>{
 const filter=clarificationStream();let answer='';for(const c of (WAIT_MARKER+'\n请问报告给谁看？'))answer+=filter('a',c);
 assert.equal(answer,'');assert.equal(filter('b','[正常引用]'),'[正常引用]');assert.equal(filter('c','完成'),'完成');
});

test('a current explicit instruction can skip the initial question without rewriting global rules',async()=>{
 const result=await clarifyBeforeExecution({payload:{prompt:'请生成报告，不用提问，直接执行'},messages:[],instructions:rules,ask:async()=>{throw Error('must not ask')}});
 assert.equal(result.status,'ready');
});

test('waiting task is restored after reopening the actual store and disappears when messages are cleared',t=>{
 const {StableStore}=require('../desktop/services/store.cjs');const root=sandbox(t);let store=new StableStore(root);const id=store.activeConversationId();
 store.addMessage(id,'user',payload.prompt);store.addMessage(id,'assistant','报告给谁看？',[clarificationTrace(payload,'报告给谁看？')]);store.close();
 store=new StableStore(root);try{assert.equal(store.conversation(id).waitingForInput,true);assert.equal(pendingClarification(store.listMessages(id)).payload.references[0].id,'report');store.clearMessages(id);assert.equal(store.conversation(id).waitingForInput,false);assert.equal(pendingClarification(store.listMessages(id)),null)}finally{store.close()}
});

test('structured mid-task cards retain model options through delivery verification and never leak JSON while streaming',async t=>{
 const workspace=sandbox(t),raw=WAIT_MARKER+'\n'+assessment()
 const result=await runWithDeliveryChecks({workspace,delivery:deliveryRequest(payload.prompt),prompt:payload.prompt,execute:async()=>raw})
 assert.equal(result.status,'waiting');assert.equal(result.answer,'这份报告的目标读者是谁？');assert.equal(result.clarification.options[1].label,'专业团队分析')
 const filter=clarificationStream();assert.equal([...raw].map(c=>filter('a',c)).join(''),'')
})
test('interaction cancellation survives an actual database close and reopen',t=>{
 const {StableStore}=require('../desktop/services/store.cjs'),{timerState,resolveResponse}=require('../desktop/services/clarification-interaction.cjs');const root=sandbox(t);let store=new StableStore(root);const id=store.activeConversationId();const trace=clarificationTrace(payload,'给谁看？');
 store.addMessage(id,'assistant','给谁看？',[trace]);timerState(store,id,trace.clarification.id,'start',0);timerState(store,id,trace.clarification.id,'interact',100);store.close();store=new StableStore(root)
 try{assert.equal(timerState(store,id,trace.clarification.id,'start',30000).interacted,true);assert.throws(()=>resolveResponse(store,id,{id:trace.clarification.id,source:'timeout'},30000),/提交回答/)}finally{store.close()}
})
