const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {LocalHtmlPreview}=require('../desktop/services/local-html-preview.cjs')
const {runWithDeliveryChecks}=require('../desktop/services/delivery.cjs')
test('local HTML serves relative assets but not outside files or unsupported data',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-html-'));const preview=new LocalHtmlPreview(root)
 try{
 fs.writeFileSync(path.join(root,'报告.html'),'<script src="app.js"></script>');fs.writeFileSync(path.join(root,'app.js'),'window.ok=true');fs.writeFileSync(path.join(root,'private.json'),'{}')
 const url=await preview.open(path.join(root,'报告.html'))
 assert.equal((await fetch(url)).status,200);assert.equal((await fetch(new URL('app.js',url))).status,200)
 assert.equal((await fetch(new URL('private.json',url))).status,404)
 assert.equal((await fetch(new URL('../报告.html',url))).status,404)
 assert.equal((await fetch(url,{method:'POST'})).status,405)
 await assert.rejects(preview.open(path.join(root,'private.json')),/HTML/)
 }finally{preview.dispose();fs.rmSync(root,{recursive:true,force:true})}
})
test('named report excludes generated scratch HTML; explicit scratch delivery remains supported',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-delivery-'));fs.mkdirSync(path.join(root,'_deck'))
 try{for(const explicit of [false,true]){
 const report=path.join(root,`report${explicit}.html`),scratch=path.join(root,'_deck',`_shot${explicit}.html`)
 const result=await runWithDeliveryChecks({workspace:root,delivery:{type:'artifact',extensions:['.html']},prompt:'生成报告',execute:async()=>{fs.writeFileSync(report,'report');fs.writeFileSync(scratch,'temp');return `完成：\n${explicit?scratch:report}`}})
 assert.deepEqual(result.artifacts,[explicit?scratch:report]);assert(!result.answer.includes(explicit?report:scratch))
 }}finally{fs.rmSync(root,{recursive:true,force:true})}
})
