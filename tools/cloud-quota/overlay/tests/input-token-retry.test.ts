import test from 'node:test';
import assert from 'node:assert/strict';
import {countOpenAIInputTokens,InputTokenCountError,type CountDiagnostic} from '../lib/core/openai-input-tokens.ts';
const ok=()=>Response.json({object:'response.input_tokens',input_tokens:7});
const opts=(fetchImpl:(r:Request)=>Promise<Response>,logs:CountDiagnostic[]=[])=>({body:{model:'fixture',input:'PRIVATE_PROMPT'},providerKey:'PRIVATE_KEY',signal:new AbortController().signal,fetchImpl,retryDelayMs:0,onDiagnostic:(r:CountDiagnostic)=>logs.push(r)});
for(const status of [408,429,500,502,503,504])test(`temporary HTTP ${status} retries count once with unchanged input`,async()=>{
 let calls=0;const logs:CountDiagnostic[]=[];const inputs:unknown[]=[];
 assert.equal(await countOpenAIInputTokens(opts(async r=>{assert(r.url.endsWith('/responses/input_tokens'));inputs.push(await r.json());return ++calls===1?new Response('PRIVATE_ERROR',{status}):ok();},logs)),7);
 assert.equal(calls,2);assert.deepEqual(inputs[0],inputs[1]);assert.equal(logs[0].retrying,true);assert.equal(logs[1].outcome,'recovered');assert.equal(logs[0].diagnosticId,logs[1].diagnosticId);
 assert(!JSON.stringify(logs).includes('PRIVATE_'));
});
for(const status of [400,401,403,404,302])test(`permanent HTTP ${status} is not retried`,async()=>{
 let calls=0;const logs:CountDiagnostic[]=[];
 await assert.rejects(countOpenAIInputTokens(opts(async()=>{calls++;return new Response('PRIVATE_ERROR',{status});},logs)),(e:unknown)=>e instanceof InputTokenCountError&&e.diagnosticId===logs[0].diagnosticId&&!e.message.includes('PRIVATE_'));
 assert.equal(calls,1);assert.equal(logs[0].upstreamStatus,status);
});
test('network reset retries but TLS errors do not',async()=>{
 for(const [code,count] of [['ECONNRESET',2],['CERT_HAS_EXPIRED',1]] as const){let calls=0;const logs:CountDiagnostic[]=[];await assert.rejects(countOpenAIInputTokens(opts(async()=>{calls++;throw new Error('PRIVATE_KEY',{cause:{code}});},logs)));assert.equal(calls,count);assert(!JSON.stringify(logs).includes('PRIVATE_KEY'));}
});
test('long Retry-After declines retry instead of violating provider backoff',async()=>{
 let calls=0;await assert.rejects(countOpenAIInputTokens(opts(async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});})));assert.equal(calls,1);
});
test('shared budget caps stalled count; cancellation during backoff stops retry',async()=>{
 const keep=setTimeout(()=>{},2000);
 try{
  let calls=0;const start=Date.now();await assert.rejects(countOpenAIInputTokens({...opts(async()=>{calls++;return new Promise<Response>(()=>{});}),timeoutMs:30,totalTimeoutMs:65}));assert(calls<=2);assert(Date.now()-start<1000);
  const c=new AbortController();calls=0;await assert.rejects(countOpenAIInputTokens({...opts(async()=>{calls++;setTimeout(()=>c.abort(),10);return new Response('',{status:503});}),signal:c.signal,retryDelayMs:100}),e=>e instanceof InputTokenCountError&&e.reason==='cancelled');assert.equal(calls,1);
 }finally{clearTimeout(keep);}
});
test('invalid JSON and schema are not retried; logger cannot break successful recovery',async()=>{
 for(const r of [new Response('bad'),Response.json(null),Response.json({object:'response.input_tokens',input_tokens:-1})]){let calls=0;await assert.rejects(countOpenAIInputTokens(opts(async()=>{calls++;return r;})));assert.equal(calls,1);}
 let calls=0;assert.equal(await countOpenAIInputTokens({...opts(async()=>++calls===1?new Response('',{status:503}):ok()),onDiagnostic:()=>{throw Error('logging unavailable');}}),7);
});
