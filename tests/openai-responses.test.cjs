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
 for(const [id,acceptsNone] of [
  ['gpt-6.2-astra',false],['gpt-6.2-sol',false],['gpt-6-astra',false],['gpt-6-sol',true],['gpt-6-luna',true],
 ]){
  const flags=cloudReasoningProfile({id,provider:'openai',responses_supported:true})
  assert.equal(flags.cloudResponses,true,id)
  const cloud={...flags,providerId:'stable-cloud',baseURL:'http://127.0.0.1:12345/v1',model:id}
  assert.deepEqual(reasoningOptions(cloud).map(option=>option.id),['auto',...(acceptsNone?['none']:[]),'low','medium','high','xhigh','max'],id)
  assert.deepEqual(reasoningParameters(cloud,'none'),acceptsNone?{reasoning_effort:'none'}:{},id)
  assert.equal(cloudReasoningProfile({id,provider:'openai'}).cloudResponses,undefined,id)
 }
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

test('503 is not guessed to be a permissions error and known preflight failures stay specific',async()=>{
 for(const fixture of [
  {status:503,body:'<html>PRIVATE_SECRET</html>',expected:/服务暂时不可用/,permanent:false},
  {status:503,code:'model_not_configured',expected:/服务器配置不完整/,permanent:true},
  {status:503,code:'input_token_count_unavailable',expected:/尚未提交模型生成/,permanent:false},
  {status:503,code:'openai_egress_unavailable',expected:/线路暂时不可用/,permanent:false},
  {status:502,code:'upstream_authentication_failed',expected:/供应商凭据或权限异常/,permanent:true},
  {status:503,code:'PRIVATE_SECRET',expected:/服务暂时不可用/,permanent:false},
 ]){
  let calls=0
  const adapter=new OpenAIResponses({model:sol,apiKey:'fixture',fetchImpl:async()=>{calls++;return fixture.body?new Response(fixture.body,{status:fixture.status}):Response.json({error:{code:fixture.code,message:'PRIVATE_SECRET'}},{status:fixture.status})}})
  await assert.rejects(adapter.request({messages:[],max_tokens:128}),e=>{
   assert.equal(e.status,fixture.status);assert.match(e.message,fixture.expected);assert(!e.message.includes('PRIVATE_SECRET'));assert.notEqual(e.code,'PRIVATE_SECRET');assert.equal(e.permanentProviderFailure,fixture.permanent)
   if(fixture.status===503&&fixture.code!=='model_not_configured')assert(!e.message.includes('权限'))
   return true
  })
  assert.equal(calls,1,'failure handling must not automatically issue another request')
 }
})

test('Stable quota and provider quota are distinct permanent failures with redacted details',async()=>{
 for(const cloud of [false,true]){
  const model=cloud?{...sol,providerId:'stable-cloud',baseURL:'http://127.0.0.1:12345/v1',cloudResponses:true}:sol
  const adapter=new OpenAIResponses({model,apiKey:'fixture',fetchImpl:async()=>Response.json({error:{code:'insufficient_quota',message:'secret upstream detail'}},{status:429})})
  await assert.rejects(adapter.request({messages:[],max_tokens:128}),e=>e.status===429&&e.code==='insufficient_quota'&&e.permanentProviderFailure&&e.message.includes(cloud?'Stable 账号可用额度不足':'OpenAI API 可用额度不足')&&!e.message.includes('secret upstream detail'))
 }
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
