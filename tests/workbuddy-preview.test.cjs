const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {DataImportService}=require('../desktop/services/data-import/service.cjs')
const {digest}=require('../desktop/services/data-import/workbuddy-reader.cjs')
test('imported preview grants only referenced documents from intact original snapshot',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'import-preview-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
 const source=path.join(root,'source'),archive=path.join(root,'imports','session');fs.mkdirSync(source);fs.mkdirSync(archive,{recursive:true})
 const file=path.join(source,'report.xlsx'),other=path.join(source,'other.xlsx');fs.writeFileSync(file,'fixture');fs.writeFileSync(other,'fixture')
 const bytes=Buffer.from(JSON.stringify({type:'assistant',role:'assistant',content:[{type:'text',text:'交付：`'+file+'`'}]})+'\n');fs.writeFileSync(path.join(archive,'original.jsonl'),bytes)
 const record={path:archive,fingerprint:digest(bytes),metadata_json:JSON.stringify({originalPath:source})}
 const service=Object.create(DataImportService.prototype);service.outputRoot=path.join(root,'imports');service.store={getSetting:()=>({files:[]}),db:{prepare:()=>({get:()=>record})}}
 assert.deepEqual(service.previewRoots('session',file),[source]);assert.deepEqual(service.previewRoots('session',other),[])
 fs.appendFileSync(path.join(archive,'original.jsonl'),' ');assert.deepEqual(service.previewRoots('session',file),[])
})
