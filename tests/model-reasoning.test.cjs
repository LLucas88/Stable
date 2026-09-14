'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {reasoningOptions,reasoningParameters}=require('../desktop/services/model-reasoning.cjs')
const {composeAgentPrompt}=require('../desktop/services/prompts.cjs')
const {CodexResponsesBridge,readSSE}=require('../desktop/services/codex-responses-bridge.cjs')
const ds={baseURL:'https://api.deepseek.com/v1',model:'deepseek-v4-flash'}
const glm={baseURL:'https://open.bigmodel.cn/api/paas/v4',model:'glm-5.3-flash'}
test('options match official model and endpoint; unknown routes get no guessed parameters',()=>{
 assert.deepEqual(reasoningOptions(ds).map(x=>x.id),['auto','none','low','high','max'])
 assert.deepEqual(reasoningOptions(glm).map(x=>x.id),['auto','low','high','max'])
 for(const model of [{...ds,baseURL:'https://third-party.test/v1'},{...ds,model:'unknown'},{...glm,model:'glm-next'}]){
  assert.deepEqual(reasoningOptions(model),[]);assert.deepEqual(reasoningParameters(model,'max'),{})
 }
 assert.deepEqual(reasoningParameters(ds,'none'),{thinking:{type:'disabled'}})
 for(const value of ['auto','fast','analysis','reasoning'])assert.deepEqual(reasoningParameters(ds,value),{})
})
test('all old and new strengths produce identical prompt text',()=>{
 const base={identity:'Stable',query:'计算总额',history:[],skills:[]}
 for(const capability of ['auto','fast','analysis','reasoning','none','low','high','max'])assert.equal(composeAgentPrompt({...base,capability}),composeAgentPrompt(base))
})
test('bridge sends official parameters only in body, across repeated turns and default reset',async()=>{
 for(const profile of [ds,glm]){
  const model={...profile,reasoningSelection:'high'},requests=[]
   for(const selected of ['high','max','auto']){
    model.reasoningSelection=selected
    const bridge=new CodexResponsesBridge({model,apiKey:'fixture',fetchImpl:async(_url,request)=>{requests.push(JSON.parse(request.body));return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')}})
    await bridge.start()
    try{
    const response=await fetch(bridge.baseURL+'/responses',{method:'POST',headers:{authorization:'Bearer '+bridge.token,'content-type':'application/json'},body:JSON.stringify({input:'计算总额',reasoning:{effort:'low'}})})
    for await(const _event of readSSE(response.body)){}
    }finally{await bridge.close()}
   }
   assert.equal(requests[0].reasoning_effort,'high');assert.equal(requests[1].reasoning_effort,'max')
   assert.equal(requests[2].reasoning_effort,undefined);assert.equal(requests[2].thinking,undefined)
   assert.deepEqual(requests[0].messages,requests[1].messages);assert.deepEqual(requests[0].messages,requests[2].messages)
 }
})


test('current DeepSeek model IDs preserve direct and cloud reasoning controls',()=>{
 const {cloudReasoningProfile}=require('../desktop/services/model-reasoning.cjs')
 for(const id of ['deepseek-flash','deepseek-v4-pro']){
   const direct={baseURL:'https://api.deepseek.com',model:id}
   assert.deepEqual(reasoningParameters(direct,'max'),{thinking:{type:'enabled'},reasoning_effort:'max'})
   const cloud={...cloudReasoningProfile({id,provider:'deepseek'}),providerId:'stable-cloud',baseURL:'http://127.0.0.1:1234/v1',model:id}
   assert.deepEqual(reasoningParameters(cloud,'high'),{reasoning_effort:'high'})
 }
})
