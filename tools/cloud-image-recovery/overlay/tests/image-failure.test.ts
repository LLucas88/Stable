import assert from 'node:assert/strict';
import test from 'node:test';
import { safeImageFailure, readImageFailure, knownImageRejection, imageFailureMessage } from '../lib/core/image-failure.ts';
test('diagnostics retain only public enums and request identifiers, never upstream messages',()=>{
 const value=safeImageFailure(400,{error:{code:'moderation_blocked',param:'prompt',message:'secret',moderation_details:{moderation_stage:'output',internal:'secret'}}},'req_12345678');
 assert.match(imageFailureMessage(value),/生成结果.*审核/);assert(!JSON.stringify(value).includes('secret'));
 const malicious=safeImageFailure(400,{error:{code:'sk-private',param:'password',moderation_details:{moderation_stage:'secret'}}},'Bearer secret');
 assert.deepEqual(malicious,{version:1,status:400,code:null,param:null,stage:null,requestId:null});
 assert.match(imageFailureMessage(safeImageFailure(400,{error:{code:'invalid_value',param:'size'}})),/参数 size/);
 assert.equal(knownImageRejection(400),true);for(const status of [408,409,500,502,504])assert.equal(knownImageRejection(status),false);
});
test('failure parser handles malformed, huge and stalled bodies without losing terminal status',async()=>{
 for(const body of ['not-json','x'.repeat(17000)])assert.equal((await readImageFailure(new Response(body,{status:400}))).status,400);
 const response=new Response(new ReadableStream({start(){}}),{status:400});
 const f=await readImageFailure(response,10);assert.equal(f.status,400);assert.equal(f.code,null);
 const safe=await readImageFailure(Response.json({error:{code:'invalid_value',param:'quality',message:'secret'}},{status:400}));assert.equal(safe.param,'quality');assert(!JSON.stringify(safe).includes('secret'));
});
