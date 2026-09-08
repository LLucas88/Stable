const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PageAnnotations,saveCurrentPage}=require('../desktop/services/browser-page-actions.cjs')
const {extractAttachmentText}=require('../desktop/services/attachments.cjs')
test('saving original file creates a real copy, records it, and cancellation adds nothing',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-save-')),source=path.join(dir,'source.html'),destination=path.join(dir,'copy.html');fs.writeFileSync(source,'<h1>报告</h1>')
 const downloads={items:[],store:{getSetting:()=>null},persist(){this.persisted=true}},electron={app:{getPath:()=>dir},dialog:{showSaveDialog:async()=>({filePath:destination})}}
 const saved=await saveCurrentPage({electron,downloads,conversationId:'a',sourcePath:source});assert.equal(saved.path,destination);assert(fs.readFileSync(source).equals(fs.readFileSync(destination)));assert.equal(downloads.items.length,1);assert(downloads.persisted)
 electron.dialog.showSaveDialog=async()=>({canceled:true});assert((await saveCurrentPage({electron,downloads,conversationId:'a',sourcePath:source})).cancelled);assert.equal(downloads.items.length,1)
 electron.dialog.showSaveDialog=async()=>({filePath:path.join(dir,'missing','copy.html')});await assert.rejects(saveCurrentPage({electron,downloads,conversationId:'a',sourcePath:source}));assert.equal(downloads.items.length,1)
})
test('annotation attachment contains source, selected text, comment and screenshot accessible to task extraction',async()=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'stable-note-')),image={toPNG:()=>Buffer.from('image'),resize:()=>({toDataURL:()=> 'data:image/png;base64,aW1hZ2U='})}
 const contents={isDestroyed:()=>false,getURL:()=> 'https://example.test/report',executeJavaScriptInIsolatedWorld:async(_,scripts)=>scripts[0].code.includes('.take()')?{text:'会员留存率',comment:'补充上月对比',tag:'h2',selector:'h2:nth-of-type(1)',title:'报告',rect:{x:1,y:2,width:100,height:20},scrollX:0,scrollY:0}:true,capturePage:async()=>image}
 const service=new PageAnnotations(),{sessionId}=await service.start('a',contents,contents.getURL())
 assert.deepEqual(await service.poll('b',sessionId,workspace),{ended:true})
 const result=await service.poll('a',sessionId,workspace);assert.equal(result.attachment.annotation.comment,'补充上月对比');const extracted=await extractAttachmentText(result.attachment.path);for(const text of ['会员留存率','补充上月对比','https://example.test/report','页面截图.png'])assert(extracted.text.includes(text));assert.equal(result.ended,false);await service.stop('a',sessionId);assert.deepEqual(await service.poll('a',sessionId,workspace),{ended:true})
})
test('web save awaits page serialization and records the resulting file',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-web-save-')),dest=path.join(dir,'page.html'),downloads={items:[],store:{getSetting:()=>null},persist(){}};let format
 const contents={getTitle:()=> 'report',savePage:async(file,type)=>{format=type;fs.writeFileSync(file,'<h1>saved page</h1>')}}
 const electron={app:{getPath:()=>dir},dialog:{showSaveDialog:async()=>({filePath:dest})}}
 await saveCurrentPage({electron,downloads,conversationId:'a',contents});assert.equal(format,'HTMLComplete');assert.equal(downloads.items[0].path,dest)
})
