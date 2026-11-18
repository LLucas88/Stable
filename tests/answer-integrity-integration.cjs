'use strict'
// Regression: real SDK, isolated profiles, local simulated provider only.
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {ClaudeHarnessRunner}=require('../desktop/services/claude-harness.cjs')
const {createClaudeAnswer}=require('../desktop/services/claude-answer.cjs')
const {failedTurn}=require('../desktop/services/failed-turn.cjs')
const {createStreamTranscript}=require('../desktop/services/stream-transcript.cjs')
const {buildTraceTimeline}=require('../src/trace-timeline.ts')
const model={providerId:'fixture',model:'audit-fixture',baseURL:'https://audit.invalid/v1'}
function response(content,finish='stop',calls){
 const delta={content,...(calls?{tool_calls:calls}:{})}
 return new Response('data: '+JSON.stringify({choices:[{index:0,delta,finish_reason:finish}],usage:{prompt_tokens:20,completion_tokens:10}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
}
function fixture(t,responder){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-answer-audit-')),workspace=path.join(root,'workspace')
 fs.mkdirSync(workspace)
 const events=[],items=[],requests=[]
 const runner=new ClaudeHarnessRunner({userData:root,workspace,onRuntimeItem:(_key,_thread,_turn,item)=>items.push(item),fetchImpl:async(url,init)=>{
  assert.equal(url,model.baseURL+'/chat/completions','all model traffic must be local fixture')
  const body=JSON.parse(init.body);requests.push(body);return responder(body,requests.length)
 }})
 t.after(()=>{runner.cancel();assert(!runner.busy);assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100})})
 return {events,items,requests,run:()=>runner.run('检查报告',model,'fixture-only',30000,e=>events.push(e),'read-only',[],{key:'audit',cwd:workspace})}
}
for(const invalid of ['missing_finish','invalid_tool'])test('native SDK correction excludes superseded text: '+invalid,{timeout:45000},async t=>{
 const f=fixture(t,(_body,n)=>{
  assert(n<=2)
  if(n===1)return response('旧结论：库存为零。',invalid==='missing_finish'?null:'tool_calls',invalid==='invalid_tool'?[{index:0,id:'bad',function:{name:'Read',arguments:'{bad'}}]:undefined)
  return response('更正结论：库存为十。')
 })
 const answer=await f.run()
 assert.equal(f.requests.length,2)
 assert.equal(answer,'更正结论：库存为十。')
 assert(f.events.some(e=>e.eventType==='agent/answer'&&e.content.includes('旧结论：库存为零。')))
 console.log('VERIFIED_CORRECTED_TEXT',JSON.stringify({invalid,answer}))
})
test('native failure displays assembled body once while preserving raw records',{timeout:45000},async t=>{
 const f=fixture(t,(_body,n)=>{
  assert(n<=3)
  if(n===1)return response('报告前半部分。','length')
  if(n===2)return response('报告后半部分。','length')
  return Response.json({error:{message:'isolated audit terminal rejection'}},{status:400})
 })
 await assert.rejects(f.run())
 const transcript=createStreamTranscript(),trace=[]
 for(const e of f.events){if(e.eventType==='agent/answer-delta'){const previous=transcript.append(e);if(previous)trace.push(previous)}}
 const last=transcript.flush();if(last)trace.push(last)
 const terminal=failedTurn({id:'audit',trace,items:f.items,error:'isolated failure'})
 const displayed=buildTraceTimeline(terminal.trace,terminal.content).filter(x=>x.eventType==='agent/answer').map(x=>x.content).join('\n')
 assert.equal(displayed.split('报告前半部分。').length-1,1)
 assert.equal(displayed.split('报告后半部分。').length-1,1)
 console.log('VERIFIED_FAILURE_SINGLE_BODY',JSON.stringify({displayed,rawItems:f.items.length}))
})
test('full last-message result preserves earlier truncated body for multiple blocks',()=>{
 const a=createClaudeAnswer()
 const add=(id,uuid,text,stop_reason)=>a.assistant({uuid,message:{id,stop_reason,content:[{type:'text',text}]}})
 add('first','a','报告前文。','max_tokens')
 add('last','b','后文第一块。','end_turn')
 add('last','c','后文第二块。','end_turn')
 assert.equal(a.text(),'报告前文。后文第一块。\n后文第二块。')
 const answer=a.finish('后文第一块。\n后文第二块。')
 assert.equal(answer,'报告前文。后文第一块。\n后文第二块。')
 console.log('VERIFIED_MULTIBLOCK_RESULT',JSON.stringify({answer}))
})

test('real SDK receives multiple Anthropic text blocks without losing earlier continuation',{timeout:45000},async t=>{
 const {ClaudeMessagesBridge}=require('../desktop/services/claude-messages-bridge.cjs')
 const original=ClaudeMessagesBridge.prototype.respond
 let responses=0
 ClaudeMessagesBridge.prototype.respond=async function(upstream,res,...args){
  if(++responses===1)return original.call(this,upstream,res,...args)
  await upstream.text()
  res.writeHead(200,{'content-type':'text/event-stream'})
  const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`)
  emit('message_start',{message:{id:'msg_audit_multiple_blocks',type:'message',role:'assistant',model:model.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:20,output_tokens:0}}})
  for(const [index,text] of ['后文第一块。','后文第二块。'].entries()){
   emit('content_block_start',{index,content_block:{type:'text',text:''}})
   emit('content_block_delta',{index,delta:{type:'text_delta',text}})
   emit('content_block_stop',{index})
  }
  emit('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:20}})
  emit('message_stop',{});res.end()
 }
 t.after(()=>{ClaudeMessagesBridge.prototype.respond=original})
 const f=fixture(t,(_body,n)=>{assert(n<=2);return response(n===1?'报告前文。':'local multiblock protocol fixture',n===1?'length':'stop')})
 assert.equal(await f.run(),'报告前文。后文第一块。\n后文第二块。')
 assert.equal(f.requests.length,2)
})
