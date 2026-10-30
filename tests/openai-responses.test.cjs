'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {reasoningOptions,reasoningParameters,cloudReasoningProfile}=require('../desktop/services/model-reasoning.cjs')
const {OpenAIResponses}=require('../desktop/services/openai-responses.cjs')
const {readSSE}=require('../desktop/services/model-provider.cjs')
const sol={providerId:'openai',baseURL:'https://api.openai.com/v1',model:'gpt-6.1-sol'}
test('official effort ranges and trusted cloud capability gate',()=>{
 assert.deepEqual(reasoningOptions(sol).map(x=>x.id),['auto','low','medium','high','xhigh','max'])
 const terra={...sol,model:'gpt-6.1-terra'}
 assert.deepEqual(reasoningOptions(terra).map(x=>x.id),['auto','none','low','medium','high','xhigh','max'])
 assert.deepEqual(reasoningParameters(terra,'none'),{reasoning_effort:'none'})
 assert.deepEqual(reasoningParameters(sol,'none'),{})
 assert.deepEqual(reasoningParameters(sol,'ultra'),{})
 assert.deepEqual(reasoningOptions({...sol,baseURL:'https://untrusted.example/v1'}),[])
 assert.equal(cloudReasoningProfile({id:sol.model,provider:'openai',responses_supported:true}).cloudResponses,true)
 assert.equal(cloudReasoningProfile({id:sol.model,provider:'openai'}).cloudResponses,undefined)
})
test('API transport enforces output cap, store false and encrypted reasoning request',async()=>{
 const adapter=new OpenAIResponses({model:sol,apiKey:'fixture',fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(init.body)
  assert.equal(b.max_output_tokens,256);assert.equal(b.store,false);assert.equal(b.reasoning.effort,'medium')
  assert.deepEqual(b.include,['reasoning.encrypted_content']);assert.equal(b.temperature,undefined)
  return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'ok'}]}],usage:{input_tokens:10,output_tokens:2}}})+'\n\n')
 }})
 const response=await adapter.request({messages:[{role:'user',content:'test'}],max_tokens:256,reasoning_effort:'medium',temperature:1})
 const chunks=[];for await(const c of readSSE(response.body))chunks.push(c)
 assert.equal(chunks[0].choices[0].delta.content,'ok');assert.equal(chunks.at(-1).usage.completion_tokens,2)
})
test('provider balance failure remains actionable without exposing response text',async()=>{
 const adapter=new OpenAIResponses({model:sol,apiKey:'fixture',fetchImpl:async()=>Response.json({error:{code:'upstream_insufficient_balance',message:'private'}},{status:402})})
 await assert.rejects(adapter.request({messages:[],max_tokens:128}),e=>e.status===402&&e.message.includes('余额不足')&&!e.message.includes('private'))
})
test('API forced function and replay do not inherit subscription namespace selectors',()=>{
 const adapter=new OpenAIResponses({model:sol,apiKey:'fixture',fetchImpl:fetch})
 const body={messages:[{role:'user',content:'Use echo'}],tools:[{type:'function',function:{name:'echo',parameters:{type:'object',properties:{}}}}],tool_choice:{type:'function',function:{name:'echo'}},max_tokens:256}
 const first=adapter.translate(body).request
 assert.equal(first.tools[0].type,'function');assert.equal(first.tools[0].name,'echo')
 assert.deepEqual(first.tool_choice,{type:'function',name:'echo'})
 const resumed=adapter.translate({...body,messages:[...body.messages,{role:'assistant',content:'',tool_calls:[{id:'call_1',function:{name:'echo',arguments:'{}'}}]},{role:'tool',tool_call_id:'call_1',content:'OK'}]}).request
 assert.equal(resumed.input.find(v=>v.type==='function_call').namespace,undefined)
 assert.equal(resumed.input.find(v=>v.type==='function_call_output').call_id,'call_1')
})
