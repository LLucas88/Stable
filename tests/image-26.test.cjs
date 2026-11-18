'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {createImageGenerator,validateArgs}=require('../desktop/services/image-generation.cjs')
const {ImageJobStore}=require('../desktop/services/image-job-store.cjs')
const {inspectArtifact}=require('../desktop/services/image-artifacts.cjs')
const {ModelRegistry}=require('../desktop/services/model-registry.cjs')
const {resolveDesignPrompt}=require('../desktop/services/design-prompt.cjs')
const model='gpt-image-2.6-sunburst',svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280"><rect width="1280" height="1280" fill="#f00"/></svg>')
const gif=Buffer.from('47494638396101000100800000000000ffffff'+'21f90400140000002c0000000001000100000202440100'.repeat(2)+'3b','hex')
function fixture(t,format,options={}){
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'image26-'));t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}))
  const calls=[],jobs=new ImageJobStore(path.join(workspace,'receipts')),bytes=format==='svg'?svg:gif
  const settings={nativeImage:{},jobStore:jobs,resolveRoute:()=>({protocol:'openai-images',endpoint:'https://fixture.invalid/v1/images/generations',editEndpoint:'https://fixture.invalid/v1/images/edits',apiKey:'fixture-only',scope:'fixture',replay:false}),fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({data:[{b64_json:bytes.toString('base64')}],output_format:format,usage:{input_tokens:12,output_tokens:9},...(format==='svg'?{svg_usage:{model:'fixture-author',input_tokens:4,output_tokens:6,total_tokens:10}}:{})})}},args={model,prompt:'a small icon',outputFormat:format,size:'auto',quality:'auto',background:'auto',output:'result.'+format,...(format==='gif'?{frameCount:2,frameDurationMs:200}:{})}
  return {workspace,args,calls,jobs,settings,run:(patch={})=>createImageGenerator({...settings,...options})({workspace,args:{...args,...patch}})}
}
test('Image 2.6 options reject incompatible combinations before any request',()=>{
  const args={model,prompt:'poster',output:'a.png'}
  for(const bad of [{complexity:'max'},{model:'gpt-image-2.5-flare',complexity:'high'},{outputFormat:'jpeg',background:'transparent',output:'a.jpg'},{outputFormat:'svg',output:'a.png'},{outputFormat:'gif',output:'a.gif',frameCount:17},{frameCount:3},{outputFormat:'gif',output:'a.gif',frameDurationMs:19}])assert.throws(()=>validateArgs({...args,...bad}))
  assert.equal(validateArgs({...args,complexity:'low',quality:'max'}).quality,'max')
  const design={model,mode:'generate',ratio:'1:1',resolution:'standard',count:1,text:'',bindings:{}}
  const resolved=resolveDesignPrompt(design,'复杂海报，构图复杂度低，输出格式 GIF，帧数 8，每帧时长 300')
  assert.equal(resolved.complexity,'low');assert.equal(resolved.outputFormat,'gif');assert.equal(resolved.frameCount,8)
  assert.throws(()=>resolveDesignPrompt({...design,outputFormat:'svg'},'生成 2 张'),/SVG/)
})
test('SVG remains genuine vector data, keeps both usage records, and replays without paying again',async t=>{
  const x=fixture(t,'svg'),result=await x.run({complexity:'medium'})
  assert(fs.readFileSync(result.path).equals(svg));assert.equal(result.mimeType,'image/svg+xml');assert.equal(result.svgUsage.total_tokens,10)
  assert.equal(x.calls[0].body.complexity,'medium');assert.equal(x.calls[0].body.output_format,'svg');assert.equal(x.calls[0].body.svg,undefined)
  assert.equal((await x.run({complexity:'medium'})).reused,true);assert.equal(x.calls.length,1);assert.equal(x.jobs.list()[0].usage.output_tokens,9)
})
test('GIF keeps animation bytes, actual frames and delays, and verifies delivery settings',async t=>{
  const x=fixture(t,'gif'),result=await x.run()
  assert(fs.readFileSync(result.path).equals(gif));assert.equal(result.frameCount,2);assert.equal(result.durationMs,400)
  assert.deepEqual(result.frameDurationsMs,[200,200]);assert.equal(x.calls[0].body.frame_count,2);assert.equal(x.calls[0].body.frame_duration_ms,200)
  assert.throws(()=>inspectArtifact(gif,'gif',{}, {size:'auto',frameCount:9}),/帧数/)
  assert.throws(()=>inspectArtifact(gif.subarray(0,-1),'gif'),/完整/)
  assert.throws(()=>inspectArtifact(svg,'gif'),/GIF/)
})
test('SVG rejects executable content, external resources and malformed XML',()=>{
  for(const content of ['<script>alert(1)</script>','<foreignObject/>','<use href="https://outside.invalid/a"/>','<rect onclick="alert(1)"/>','<style>@import "https://outside.invalid/a"</style>','<rect style="fill:url(https://outside.invalid/a)"/>'])assert.throws(()=>inspectArtifact(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${content}</svg>`),'svg'))
  assert.throws(()=>inspectArtifact(Buffer.from('<!DOCTYPE svg [<!ENTITY x "bad">]>'+svg),'svg'))
  assert.equal(inspectArtifact(svg,'svg').width,1280)
})
test('existing official/proxy credentials stay on the selected host and aliases are explicit',()=>{
  const profiles=[{id:'official',providerId:'openai',model,baseURL:'https://api.openai.com/v1'},{id:'proxy',providerId:'proxy',model,baseURL:'https://relay.invalid/v1'},{id:'chat',providerId:'relay',model:'chat-only',baseURL:'https://chat.invalid/custom/v1'}]
  const registry=new ModelRegistry({modelCatalog:()=>({items:profiles,defaultModelId:'chat'})},{get:key=>({'model:official:apiKey':'official-fixture','model:proxy:apiKey':'proxy-fixture','model:chat:apiKey':'chat-fixture'}[key])})
  assert.throws(()=>registry.resolveImageRoute('chat',{model}),/多个图片/)
  const official=registry.resolveImageRoute('official',{model}),proxy=registry.resolveImageRoute('official',{model,connectionId:'proxy',upstreamModel:'image26-alias'})
  assert.equal(official.endpoint,'https://api.openai.com/v1/images/generations');assert.equal(official.apiKey,'official-fixture')
  assert.equal(proxy.editEndpoint,'https://relay.invalid/v1/images/edits');assert.equal(proxy.apiKey,'proxy-fixture');assert.equal(proxy.upstreamModel,'image26-alias');assert.equal(proxy.replay,false)
  assert.throws(()=>registry.resolveImageRoute('official',{model,connectionId:'missing'}),/不存在/)
})
test('direct provider unknown submission cannot silently resubmit',async t=>{
  let calls=0;const x=fixture(t,'svg',{fetchImpl:async()=>{calls++;throw Error('fixture disconnect')}})
  await assert.rejects(x.run(),/结果未确认/);await assert.rejects(x.run(),/结果未知/);assert.equal(calls,1)
})
test('official JSON and explicit proxy multipart preserve reference and markup bytes',async()=>{
  const {imageWireRequest}=require('../desktop/services/image-generation.cjs'),bytes=Buffer.from('fixture-bytes'),id='a'.repeat(64)
  const refs=[{id,mimeType:'image/png',data:bytes.toString('base64')}],input={model,prompt:'edit',size:'auto',quality:'auto',background:'auto',complexity:'low',outputFormat:'png'}
  const json=imageWireRequest(input,{upstreamModel:'alias'},refs,{markup:{id,bytes}}),parsed=JSON.parse(json.body)
  assert.equal(parsed.model,'alias');assert.equal(parsed.images[0].image_url,'data:image/png;base64,'+refs[0].data);assert.equal(parsed.markup.image_url,parsed.images[0].image_url);assert.equal(parsed.references,undefined);assert.equal(parsed.quality,undefined)
  const multipart=imageWireRequest(input,{editTransport:'multipart'},refs,{markup:{id,bytes}})
  assert.equal(multipart.headers['Content-Type'],undefined);assert(multipart.body instanceof FormData);assert.equal(multipart.body.get('complexity'),'low')
  assert(Buffer.from(await multipart.body.get('image[]').arrayBuffer()).equals(bytes));assert(Buffer.from(await multipart.body.get('markup').arrayBuffer()).equals(bytes))
  const cloud=JSON.parse(imageWireRequest(input,{replay:true,editTransport:'multipart'},refs,{markup:{id,bytes}}).body)
  assert.equal(cloud.references[0].id,id);assert.equal(cloud.markup.id,id);assert.equal(cloud.images,undefined)
})
test('cloud Image 2.6 validation and SVG admission/usage use separate configured author rates',()=>{
  const Module=require('node:module'),esbuild=require('esbuild')
  const source=fs.readFileSync(path.join(__dirname,'../tools/cloud-openai/overlay/lib/core/openai-images.ts'),'utf8').replace(/^import .*;\r?\n/gm,'')
  // Pricing primitives have separate gateway tests. Exercise the image contract
  // with exact integer fixtures, including the extra SVG reservation and charge.
  const helpers='const calculateTokenCostMicros=(n,r)=>Math.ceil(n*r/1000000);const resolvePrice=(_,m)=>m;const reservationRates=m=>m;\n'
  const m=new Module('image26-cloud');m._compile(helpers+esbuild.transformSync(source,{loader:'ts',format:'cjs'}).code,'image26-cloud.cjs')
  const {validateOpenAIImageBody:validate,imageReservation:reserve,imageActualCost:cost}=m.exports
  assert.equal(validate({model,prompt:'icon',output_format:'gif'}).frame_count,9)
  assert.throws(()=>validate({model,prompt:'icon',output_format:'svg',references:[]},true))
  assert.throws(()=>validate({model,prompt:'icon',output_format:'jpeg',background:'transparent'}))
  const price={inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:0,maxOutputTokens:100,pricingPolicy:{imageOutputFormats:['svg'],svgAuthor:{model:'author',inputMicrosPerMillion:3000000,outputMicrosPerMillion:4000000,maxInputTokens:20,maxOutputTokens:30}}}
  assert.throws(()=>reserve({prompt:'icon',output_format:'gif'},price),/not_enabled/)
  const estimate=reserve({prompt:'icon',output_format:'svg'},price);assert.equal(estimate.reservedMicros,260+200+60+120)
  const usage={input_tokens:10,output_tokens:5,input_tokens_details:{text_tokens:10,image_tokens:0}},billed=cost(usage,price,false,{model:'author',input_tokens:2,output_tokens:3,total_tokens:5})
  assert.equal(billed.imageCost,20);assert.equal(billed.svgCost,18);assert.equal(billed.actual,38)
  assert.throws(()=>cost(usage,price,false,{model:'unknown',input_tokens:2,output_tokens:3,total_tokens:5}),/svg_usage/)
})
