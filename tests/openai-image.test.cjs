'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {createImageGenerator,validateArgs}=require('../desktop/services/image-generation.cjs')
const {ImageJobStore}=require('../desktop/services/image-job-store.cjs')
const {validateDesignRequest}=require('../desktop/services/design-request.cjs')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
test('both GPT image variants preserve quality and background; reject invalid dimensions before payment',()=>{
 for(const model of ['gpt-image-2.5-sunburst','gpt-image-2.5-flare']){
 const d=validateDesignRequest({model,quality:'xhigh',background:'transparent',mode:'generate',ratio:'3:4',resolution:'2k',count:2,text:''})
 assert.equal(d.quality,'xhigh');assert.equal(d.size,'1536x2048');assert.equal(d.background,'transparent')
 assert.throws(()=>validateArgs({model,size:'512x512',prompt:'hello',output:'a.png'}),/总像素/)
 assert.throws(()=>validateArgs({model,quality:'hd',prompt:'hello',output:'a.png'}),/质量/)
 }
})
test('Cloud base64 image survives restart without another paid call; policy model wins over tool model',async t=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'stable-openai-image-'));t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}))
 const store=new ImageJobStore(path.join(workspace,'receipts'));let calls=0
 const options={policy:{model:'gpt-image-2.5-sunburst',quality:'low',background:'transparent',size:'1024x1024',count:1},jobStore:store,
 resolveRoute:()=>({endpoint:'https://fixture/v1/images/generations',apiKey:'fixture',scope:'cloud:account1',replay:true}),
 nativeImage:{createFromBuffer:b=>({isEmpty:()=>!b.equals(png),getSize:()=>({width:1,height:1}),toPNG:()=>png})},
 fetchImpl:async(_url,init)=>{calls++;const b=JSON.parse(init.body);assert.equal(b.model,'gpt-image-2.5-sunburst');assert.equal(b.quality,'low');assert.equal(b.background,'transparent');return Response.json({data:[{b64_json:png.toString('base64')}]})},
 download:()=>{throw Error('must not download base64')},}
 const request={workspace,args:{model:'glm-image',prompt:'coffee poster',output:'poster.png'}}
 const result=await createImageGenerator(options)(request);assert.equal(result.model,'gpt-image-2.5-sunburst');assert.ok(fs.readFileSync(result.path).equals(png))
 assert.equal((await createImageGenerator(options)(request)).reused,true);assert.equal(calls,1)
})
