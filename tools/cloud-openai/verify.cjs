'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url')
async function main(){
 const source=path.resolve(process.argv[2]||'.local/ecs-production/source')
 const load=p=>import(pathToFileURL(path.join(source,p)).href)
 const {assertResponsesBody,responseReservationBody,supportsOpenAIResponses}=await load('lib/core/openai-responses.ts')
 const {normalizeUsage,calculateActualCostMicros}=await load('lib/core/gateway.ts')
 const {OpenAiSseMeter}=await load('lib/core/sse.ts')
 const {validateOpenAIImageBody,imageActualCost,imageReservation}=await load('lib/core/openai-images.ts')
 const body={model:'gpt-6.1-sol',input:[{role:'user',content:'hi'}],store:false,stream:true,max_output_tokens:32,tools:[{type:'namespace',name:'stable_tools',tools:[{type:'function',name:'read',parameters:{type:'object'}}]}]}
 assertResponsesBody(body);assert.equal(responseReservationBody(body).max_tokens,32)
 const optionalEffort=new Set(['gpt-6.1-terra','gpt-6-sol','gpt-6-luna'])
 for(const model of ['gpt-6.2-astra','gpt-6.2-sol','gpt-6.1-sol','gpt-6.1-terra','gpt-6-astra','gpt-6-sol','gpt-6-luna']){
  assert(supportsOpenAIResponses(model));assertResponsesBody({...body,model})
  for(const effort of ['low','medium','high','xhigh','max'])assertResponsesBody({...body,model,reasoning:{effort}})
  const request={...body,model,reasoning:{effort:'none'}}
  if(optionalEffort.has(model))assertResponsesBody(request);else assert.throws(()=>assertResponsesBody(request),/思考深度/)
  assert.throws(()=>assertResponsesBody({...body,model,reasoning:{effort:'ultra'}}),/思考深度/)
 }
 for(const model of ['gpt-5.6','gpt-6.3-unreleased','gpt-image-2.6-sunburst','constructor',['gpt-6-sol']]){
  assert(!supportsOpenAIResponses(model));assert.throws(()=>assertResponsesBody({...body,model}),/未开放/)
 }
 for(const changes of [{store:true},{previous_response_id:'other'},{tools:[{type:'web_search'}]},{reasoning:{effort:'ultra'}},{input:[{type:'item_reference',id:'other'}]}])assert.throws(()=>assertResponsesBody({...body,...changes}))
 assert.throws(()=>assertResponsesBody({...body,input:[{role:'user',content:[{type:'input_text',text:'a',prompt_cache_breakpoint:{ttl:'12h'}}]}]}))
 const usage={input_tokens:12000,output_tokens:100,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}}
 const normalized=normalizeUsage(usage);assert.equal(normalized.cacheWrite30mTokens,3000)
 const price={inputMicrosPerMillion:1000000,outputMicrosPerMillion:5000000,pricingPolicy:{kind:'openai-cache',tiers:[{label:'standard',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:5000000}]}}
 assert.equal(calculateActualCostMicros(normalized,price),15650)
 const imagePrice={...price,pricingPolicy:{...price.pricingPolicy,imageInput:{inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:500000}},maxOutputTokens:100,contextWindow:1000}
 const imageUsage={input_tokens:30,output_tokens:3,input_tokens_details:{text_tokens:10,image_tokens:20,cached_tokens:6,cached_tokens_details:{text_tokens:2,image_tokens:4}}}
 assert.equal(imageActualCost(imageUsage,imagePrice,true).actual,58)
 assert.throws(()=>imageActualCost(imageUsage,imagePrice,false))
 assert.throws(()=>imageActualCost({...imageUsage,input_tokens_details:{...imageUsage.input_tokens_details,cached_tokens:7}},imagePrice,true))
 assert.throws(()=>imageActualCost({...imageUsage,input_tokens:31},imagePrice,true))
 assert.throws(()=>imageReservation({prompt:'hello',references:[{}]}, {...imagePrice,contextWindow:100}))
 assert.throws(()=>imageReservation({prompt:'hello',references:[{}]}, {...imagePrice,pricingPolicy:price.pricingPolicy}))
 assert(imageReservation({prompt:'hello',references:[{}]},imagePrice).reservedMicros>imageActualCost(imageUsage,imagePrice,true).actual)
 assert.equal(normalizeUsage({...usage,input_tokens_details:{...usage.input_tokens_details,cache_write_tokens:8000}}),null)
 const meter=new OpenAiSseMeter();const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{id:'response_test',usage}})+'\n\n');for(let i=0;i<bytes.length;i+=3)meter.push(bytes.slice(i,i+3));assert.deepEqual(meter.finish().usage,normalized)
 for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare']){assert.equal(validateOpenAIImageBody({model,prompt:'coffee',size:'1536x2048',quality:'low',background:'transparent'}).model,model);assert.throws(()=>validateOpenAIImageBody({model,prompt:'coffee',size:'512x512',quality:'low',background:'opaque'}))}
 console.log('PASS: Responses tool restrictions, effort validation, cache-write billing, chunked terminal usage, image options')
 // Compile server entry points against the actual gateway source; no network or production state.
 await require('esbuild').build({stdin:{contents:`export {POST as responses} from '${path.join(source,'app/v1/responses/route.ts').replaceAll('\\','/')}';export {handleOpenAIImage} from '${path.join(source,'lib/server/openai-image-gateway.ts').replaceAll('\\','/')}';`,resolveDir:source,loader:'ts'},outfile:path.resolve('.local/openai-key-setup/gateway-compiled.cjs'),bundle:true,platform:'node',format:'cjs',external:['cloudflare:workers'],plugins:[{name:'aliases',setup(b){b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}))}}]})
 console.log('PASS: server endpoints bundle')
}
main().catch(e=>{console.error(e);process.exitCode=1})
