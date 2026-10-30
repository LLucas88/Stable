'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url')
async function main(){
 const source=path.resolve(process.argv[2]||'.local/ecs-production/source')
 const load=p=>import(pathToFileURL(path.join(source,p)).href)
 const {assertResponsesBody,responseReservationBody}=await load('lib/core/openai-responses.ts')
 const {normalizeUsage,calculateActualCostMicros}=await load('lib/core/gateway.ts')
 const {OpenAiSseMeter}=await load('lib/core/sse.ts')
 const {validateOpenAIImageBody}=await load('lib/core/openai-images.ts')
 const body={model:'gpt-6.1-sol',input:[{role:'user',content:'hi'}],store:false,stream:true,max_output_tokens:32,tools:[{type:'namespace',name:'stable_tools',tools:[{type:'function',name:'read',parameters:{type:'object'}}]}]}
 assertResponsesBody(body);assert.equal(responseReservationBody(body).max_tokens,32)
 for(const changes of [{store:true},{previous_response_id:'other'},{tools:[{type:'web_search'}]},{reasoning:{effort:'ultra'}},{input:[{type:'item_reference',id:'other'}]}])assert.throws(()=>assertResponsesBody({...body,...changes}))
 assert.throws(()=>assertResponsesBody({...body,input:[{role:'user',content:[{type:'input_text',text:'a',prompt_cache_breakpoint:{ttl:'12h'}}]}]}))
 const usage={input_tokens:12000,output_tokens:100,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}}
 const normalized=normalizeUsage(usage);assert.equal(normalized.cacheWrite30mTokens,3000)
 const price={inputMicrosPerMillion:1000000,outputMicrosPerMillion:5000000,pricingPolicy:{kind:'openai-cache',tiers:[{label:'standard',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:5000000}]}}
 assert.equal(calculateActualCostMicros(normalized,price),15650)
 assert.equal(normalizeUsage({...usage,input_tokens_details:{...usage.input_tokens_details,cache_write_tokens:8000}}),null)
 const meter=new OpenAiSseMeter();const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{id:'response_test',usage}})+'\n\n');for(let i=0;i<bytes.length;i+=3)meter.push(bytes.slice(i,i+3));assert.deepEqual(meter.finish().usage,normalized)
 for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare']){assert.equal(validateOpenAIImageBody({model,prompt:'coffee',size:'1536x2048',quality:'low',background:'transparent'}).model,model);assert.throws(()=>validateOpenAIImageBody({model,prompt:'coffee',size:'512x512',quality:'low',background:'opaque'}))}
 console.log('PASS: Responses tool restrictions, effort validation, cache-write billing, chunked terminal usage, image options')
 // Compile server entry points against the actual gateway source; no network or production state.
 await require('esbuild').build({stdin:{contents:`export {POST as responses} from '${path.join(source,'app/v1/responses/route.ts').replaceAll('\\','/')}';export {handleOpenAIImage} from '${path.join(source,'lib/server/openai-image-gateway.ts').replaceAll('\\','/')}';`,resolveDir:source,loader:'ts'},outfile:path.resolve('.local/openai-key-setup/gateway-compiled.cjs'),bundle:true,platform:'node',format:'cjs',external:['cloudflare:workers'],plugins:[{name:'aliases',setup(b){b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}))}}]})
 console.log('PASS: server endpoints bundle')
}
main().catch(e=>{console.error(e);process.exitCode=1})
