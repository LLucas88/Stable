const test=require('node:test'),assert=require('node:assert/strict')
const {ModelRegistry}=require('../desktop/services/model-registry.cjs')
const {CloudGatewayProxy}=require('../desktop/services/cloud-gateway-proxy.cjs')
const {reasoningOptions,reasoningParameters}=require('../desktop/services/model-reasoning.cjs')
const {CodexResponsesBridge,readSSE}=require('../desktop/services/codex-responses-bridge.cjs')
for (const [id,provider] of [['glm-5.3-flash','zhipu'],['deepseek-flash','deepseek'],['deepseek-v4-pro','deepseek']]) test('cloud reasoning crosses the local gateway: '+id,async()=>{
 const requests=[]
 const account={baseURL:'https://cloud.test',token:()=> 'fixture',publicState:()=>({status:'authenticated',models:[{id,provider,display_name:id}]})}
 const gateway=new CloudGatewayProxy({account,fetchImpl:async(_url,request)=>{requests.push(JSON.parse(request.body));return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})}})
 await gateway.start()
 try {
 const registry=new ModelRegistry({}, {}, gateway),profile=registry.publicCatalog().items[0]
 assert.deepEqual(reasoningOptions(profile).map(x=>x.id),['auto','low','high','max'])
 for(const effort of ['low','high','max','auto']) {
 const route=registry.resolve(profile.id);route.model.reasoningSelection=effort
 const bridge=new CodexResponsesBridge({...route});await bridge.start()
 try { const response=await fetch(bridge.baseURL+'/responses',{method:'POST',headers:{authorization:'Bearer '+bridge.token,'content-type':'application/json'},body:JSON.stringify({input:'hello'})});for await(const event of readSSE(response.body)){} } finally {await bridge.close()}
 }
 assert.deepEqual(requests.map(x=>x.reasoning_effort),['low','high','max',undefined])
 requests.forEach(x=>{assert.equal(x.model,id);assert.deepEqual(x.messages,requests[0].messages);assert.equal(x.thinking,undefined)})
 assert.deepEqual(reasoningParameters({...profile,cloudReasoning:false},'high'),{})
 }finally{await gateway.stop()}
})
