const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto')
const {DesignReferences}=require('../desktop/services/design-references.cjs')
const {createImageGenerator}=require('../desktop/services/image-generation.cjs')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
const nativeImage={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>png})}
test('reference snapshots retain selected bytes across changes, reject foreign paths and tampering',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'design-refs-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'a.png');fs.writeFileSync(file,png)
 const vault=new DesignReferences(path.join(dir,'vault'),nativeImage),ids=vault.capture([{path:file}],()=>[dir]);fs.writeFileSync(file,'changed')
 const materialized=vault.materialize([{path:file,name:'a.png'}],ids,dir);assert.deepEqual(fs.readFileSync(materialized[0].path),png)
 assert.deepEqual(vault.capture(materialized,()=>[dir]),ids,'Queue execution must use the send-time snapshot after the original changes')
 fs.writeFileSync(materialized[0].path,Buffer.concat([png,Buffer.from('modified')]));assert.throws(()=>vault.capture(materialized,()=>[dir]),/快照被修改/)
 assert.deepEqual(vault.read(ids)[0].bytes,png);assert.throws(()=>vault.capture([{path:file}],()=>[path.join(dir,'vault')]),/工作区/)
 fs.writeFileSync(path.join(dir,'vault',ids[0]+'.image'),'tampered');assert.throws(()=>vault.read(ids),/快照/)
})
test('generation sends original reference bytes in order to edits and never silently uses GLM',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'design-upload-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let calls=0
 const references=[png,Buffer.concat([png,Buffer.from('second')])].map(bytes=>({id:createHash('sha256').update(bytes).digest('hex'),mimeType:'image/png',bytes}))
 const generate=createImageGenerator({references,nativeImage,resolveRoute:()=>({endpoint:'https://test/generations',editEndpoint:'https://test/edits',apiKey:'fixture',scope:'fixture',replay:true}),fetchImpl:async(url,init)=>{
  calls++;assert.equal(url,'https://test/edits');const body=JSON.parse(init.body);assert.deepEqual(body.references.map(r=>Buffer.from(r.data,'base64')),references.map(r=>r.bytes));return Response.json({data:[{b64_json:png.toString('base64')}]})}})
 const args={prompt:'style reference',model:'gpt-image-2.5-sunburst',output:'out.png'}
 await assert.rejects(generate({workspace:dir,args:{...args,model:'glm-image'}}),/GLM/);assert.equal(calls,0)
 await assert.rejects(generate({workspace:dir,args:{...args,referenceIds:['a'.repeat(64)]}}),/本次/);assert.equal(calls,0)
 await generate({workspace:dir,args});await generate({workspace:dir,args});assert.equal(calls,1)
})
