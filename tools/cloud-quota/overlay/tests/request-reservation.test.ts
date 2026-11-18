import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateReservationMicros, calculateActualCostMicros } from '../lib/core/gateway.ts';
import { countOpenAIInputTokens, InputTokenCountError, tokenCountBody } from '../lib/core/openai-input-tokens.ts';

const body = {model:'gpt-6.1-sol',input:[{role:'user',content:[{type:'input_text',text:'中😀'}, {type:'input_image',image_url:'data:image/png;base64,AA=='}]}, {type:'reasoning',encrypted_content:'fixture'}],tools:[{type:'function',name:'edit',parameters:{type:'object'}}],text:{format:{type:'text'}},reasoning:{effort:'high'},tool_choice:'auto',parallel_tool_calls:true,store:false,stream:true,max_output_tokens:32768,include:['reasoning.encrypted_content']};
const price = {inputMicrosPerMillion:14_400_000,outputMicrosPerMillion:72_000_000,pricingPolicy:{version:1 as const,kind:'openai-cache' as const,source:'https://developers.openai.com',verifiedAt:'2026-11-04',tiers:[{label:'short',inputMicrosPerMillion:14_400_000,cachedInputMicrosPerMillion:720_000,outputMicrosPerMillion:72_000_000,promptLessThan:272001},{label:'long',inputMicrosPerMillion:28_800_000,cachedInputMicrosPerMillion:1_440_000,outputMicrosPerMillion:108_000_000}]}};
const estimate=(count?:number,output=32768)=>estimateReservationMicros({body:{max_tokens:output},contextWindow:1_050_000,modelMaxOutputTokens:128000,price,measuredInputTokens:count});

test('measured input removes full-window hold while covering all price/cache tiers',()=>{
 assert.equal(estimate().reservedMicros,76_779_648);
 assert.equal(estimate(12000).reservedMicros,4_402_944);
 assert(estimate(12000).reservedMicros < 36_653_777);
 for(const input of [0,12000,272000,272001,900000])for(const output of [1,32768,128000]){
  const reserved=estimate(input,output);
  for(const write of [0,input])assert(calculateActualCostMicros({promptTokens:input,completionTokens:output,totalTokens:input+output,cacheWrite12hTokens:write},price)<=reserved.reservedMicros);
 }
});
test('untrusted request count cannot lower quota; invalid trusted counts fail closed',()=>{
 const spoof=estimateReservationMicros({body:{max_tokens:32768,measuredInputTokens:0,input_tokens:0},contextWindow:1_050_000,modelMaxOutputTokens:128000,price});
 assert.equal(spoof.reservedMicros,estimate().reservedMicros);
 for(const count of [-1,NaN,Infinity,1.2,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>estimate(count));
 assert.throws(()=>estimate(1_050_000),/上下文/);
});
test('count includes exact text, image, reasoning and tool inputs but no generation fields',async()=>{
 const before=JSON.stringify(body);
 assert.deepEqual(Object.keys(tokenCountBody(body)).sort(),['model','input','tools','tool_choice','parallel_tool_calls','text','reasoning'].sort());
 const count=await countOpenAIInputTokens({body,providerKey:'private-test-key',signal:new AbortController().signal,fetchImpl:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses/input_tokens');assert.equal(request.redirect,'manual');assert.equal(request.method,'POST');
  assert.deepEqual(await request.json(),tokenCountBody(body));
  return Response.json({object:'response.input_tokens',input_tokens:12000});
 }});
 assert.equal(count,12000);assert.equal(JSON.stringify(body),before);
});
test('HTTP errors, malformed counts, redirects and oversized bodies never become estimates',async()=>{
 for(const response of [new Response('sensitive',{status:429}),new Response('',{status:302}),new Response('invalid'),Response.json({object:'wrong',input_tokens:12}),Response.json({object:'response.input_tokens',input_tokens:-1}),Response.json({object:'response.input_tokens',input_tokens:1.1}),new Response('x'.repeat(16385))]){
  await assert.rejects(countOpenAIInputTokens({body,providerKey:'private-test-key',signal:new AbortController().signal,fetchImpl:async()=>response}),e=>e instanceof InputTokenCountError&&!e.message.includes('sensitive')&&!e.message.includes('private-test-key'));
 }
});
test('deadline covers unresponsive headers and a stalled response body',async()=>{
 for(const fetchImpl of [async()=>new Promise<Response>(()=>{}),async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'))}}))]){
  const keepAlive=setTimeout(()=>{},1000);
  try{await assert.rejects(countOpenAIInputTokens({body,providerKey:'fixture',signal:new AbortController().signal,fetchImpl,timeoutMs:20}),InputTokenCountError)}finally{clearTimeout(keepAlive)}
 }
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(countOpenAIInputTokens({body,providerKey:'fixture',signal:controller.signal,fetchImpl:async()=>{calls++;return Response.json({})}}));
 assert.equal(calls,0);
});
