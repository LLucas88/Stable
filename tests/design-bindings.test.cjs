const test=require('node:test'),assert=require('node:assert/strict')
const {resolveDesignPrompt}=require('../desktop/services/design-prompt.cjs')
const {validateDesignRequest}=require('../desktop/services/design-request.cjs')
const {finishDesignImage}=require('../desktop/services/design-output.cjs')
const base={model:'gpt-image-2.5-sunburst',quality:'high',background:'opaque',ratio:'1:1',resolution:'2k',count:4,text:'',mode:'generate',bindings:{}}
test('unbound panel values cannot constrain the image request',()=>{
 const result=resolveDesignPrompt(base,'一只小猫')
 assert.equal(result.size,'auto');assert.equal(result.quality,'auto');assert.equal(result.background,'auto');assert.equal(result.count,1)
 assert.deepEqual(validateDesignRequest(result),result)
})
test('bindings are independent and prompt parameters take priority',()=>{
 const onlyQuality=resolveDesignPrompt({...base,bindings:{quality:true}},'小猫')
 assert.equal(onlyQuality.quality,'high');assert.equal(onlyQuality.size,'auto');assert.equal(onlyQuality.count,1)
 const explicit=resolveDesignPrompt({...base,bindings:{size:true,count:true,quality:true}},'生成2张小猫，尺寸1024x1536，质量低，透明背景')
 assert.equal(explicit.size,'1024x1536');assert.equal(explicit.quality,'low');assert.equal(explicit.count,2);assert.equal(explicit.background,'transparent')
 assert.throws(()=>resolveDesignPrompt(base,'尺寸2048x4436'),/3840/)
})
test('automatic output retains actual dimensions without resizing or cropping',()=>{
 const image={getSize:()=>({width:1024,height:1536}),isEmpty:()=>false,toPNG:()=>Buffer.from('png'),resize:()=>assert.fail('must retain auto size')}
 const result=finishDesignImage(image,{},resolveDesignPrompt(base,'小猫'))
 assert.deepEqual(result.dimensions,{width:1024,height:1536})
})
test('cloud validator supports omitted defaults and auto, rejects invalid explicit parameters',()=>{
 const fs=require('node:fs'),Module=require('node:module'),esbuild=require('esbuild')
 const source=fs.readFileSync(require('node:path').join(__dirname,'../tools/cloud-openai/overlay/lib/core/openai-images.ts'),'utf8').replace(/^import .*;\r?\n/gm,'')
 const code=esbuild.transformSync(source,{loader:'ts',format:'cjs'}).code
 const m=new Module('image-validator');m._compile(code,'image-validator.cjs')
 const validate=m.exports.validateOpenAIImageBody,request={model:base.model,prompt:'小猫'}
 const result=validate(request);assert.equal(result.size,'auto');assert.equal(result.quality,'auto');assert.equal(result.background,'auto')
 assert.equal(validate({...request,size:'1024x1536',quality:'high'}).size,'1024x1536')
 assert.throws(()=>validate({...request,size:'bad'}));assert.throws(()=>validate({...request,quality:'bad'}));assert.throws(()=>validate({...request,background:'bad'}))
})
