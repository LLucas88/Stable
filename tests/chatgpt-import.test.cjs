'use strict'
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), JSZip=require('jszip')
const {scanChatGPT,parseConversation,clientRoots}=require('../desktop/services/chatgpt-reader.cjs')
const {StableStore}=require('../desktop/services/store.cjs')
const {WorkBuddyImportService}=require('../desktop/services/workbuddy-import.cjs')
function fixture(t, cleanup=()=>{}){const parent=path.resolve(__dirname,'../.local/chatgpt-tests');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'case-'));t.after(()=>{cleanup();fs.rmSync(root,{recursive:true,force:true})});return root}
function conversation(){return {id:'conversation-1',title:'测试报告',current_node:'a',project_id:'project-1',project_name:'报告项目',mapping:{
 root:{id:'root',parent:null,children:['u'],message:null},
 u:{id:'u',parent:'root',children:['thinking','old'],message:{id:'u',author:{role:'user'},content:{content_type:'text',parts:['生成报告']},create_time:1}},
 thinking:{id:'thinking',parent:'u',children:['a'],message:{id:'t',author:{role:'assistant'},channel:'analysis',content:{content_type:'text',parts:['DO_NOT_IMPORT_ANALYSIS']}}},
 old:{id:'old',parent:'u',children:[],message:{id:'old',author:{role:'assistant'},content:{content_type:'text',parts:['OLD_BRANCH']}}},
 a:{id:'a',parent:'thinking',children:[],message:{id:'a',author:{role:'assistant'},channel:'final',content:{content_type:'text',parts:['[报告](sandbox:/mnt/data/report.html)']},create_time:2}}
}}}
test('ChatGPT graph keeps active Q/A and delivered files, not analysis or old branches',()=>{const m=parseConversation(conversation());assert.deepEqual(m.map(m=>m.role),['user','assistant']);assert(!JSON.stringify(m).includes('DO_NOT_IMPORT'));assert(!JSON.stringify(m).includes('OLD_BRANCH'));assert.equal(m[1].refs[0].name,'report.html')})
test('ambiguous and cyclic ChatGPT branches are rejected',()=>{let c=conversation();delete c.current_node;assert.throws(()=>parseConversation(c),/分支/);c=conversation();c.mapping.root.parent='a';assert.throws(()=>parseConversation(c),/循环/)})
test('official export ZIP imports a native conversation with a durable HTML attachment and explicit project',async t=>{
 let store;const root=fixture(t,()=>store?.close()), zip=new JSZip();zip.file('conversations-001.json',JSON.stringify([conversation()]));zip.file('report.html','<!doctype html><h1>Report</h1>');zip.file('auth.json','SECRET');const file=path.join(root,'export.zip');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));
 const profile=path.join(root,'profile'), workspace=path.join(root,'workspace');fs.mkdirSync(workspace);store=new StableStore(profile);const service=new WorkBuddyImportService({store,userData:profile,workspace});const p=await service.scan(file,'chatgpt');assert.equal(p.provider,'chatgpt');assert.equal(p.items.filter(i=>i.kind==='session').length,1);assert.equal(p.items.filter(i=>i.kind==='file').length,1);assert(!JSON.stringify(p).includes('SECRET'));
 const r=await service.importSelected(p.token,p.items.filter(i=>i.status==='ready').map(i=>i.id));assert(r.results.every(i=>i.status==='imported'),JSON.stringify(r));const id=r.results.find(i=>i.kind==='session').targetId;
 assert.equal(store.conversation(id).sourceType,'local');assert.equal(store.conversation(id).title,'测试报告');const messages=store.listMessages(id);assert.equal(messages.length,2);assert.equal(messages[1].attachments.length,1);assert.match(fs.readFileSync(messages[1].attachments[0].path,'utf8'),/Report/);assert(!messages[1].content.includes('sandbox:'));assert(store.conversationContext(id).projectId);store.addMessage(id,'user','继续');assert.equal(store.listMessages(id).length,3);assert(service.history().every(i=>i.provider==='chatgpt'));
 const again=await service.importSelected(p.token,p.items.filter(i=>i.status==='ready').map(i=>i.id));assert(again.results.every(i=>i.status==='skipped'))
})
test('local client scanner reads supported cache snapshots and does not treat install presence as complete history',async t=>{
 const root=fixture(t), cache=path.join(root,'AppData/Local/Packages/OpenAI.ChatGPT-Desktop_example/LocalCache/conversations');fs.mkdirSync(cache,{recursive:true});fs.writeFileSync(path.join(cache,'conversation.json'),JSON.stringify(conversation()));fs.writeFileSync(path.join(cache,'auth.json'),'SECRET');const roots=clientRoots(root);assert.equal(roots.length,1);const p=await scanChatGPT(null,path.join(root,'stage'),{roots});assert.equal(p.items.filter(i=>i.kind==='session'&&i.status==='ready').length,1);assert.equal(p.items.find(i=>i.kind==='file').status,'unavailable');
 const empty=await scanChatGPT(null,path.join(root,'empty'),{roots:[]});assert.equal(empty.items.length,0);assert.match(empty.warnings[0],/未发现/)
})
test('ZIP traversal and symlink entries are rejected before writing outside staging',async t=>{
 const root=fixture(t);for(const [index,name,options]of [[1,'../escape.json',{}],[2,'link.json',{unixPermissions:0o120777}]]){const zip=new JSZip();zip.file(name,'{}',options);const file=path.join(root,index+'.zip');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer',platform:'UNIX'}));await assert.rejects(scanChatGPT(file,path.join(root,'stage'+index)),/不安全/)}assert(!fs.existsSync(path.join(root,'escape.json')))
})
test('missing or duplicate artifacts never resolve to an arbitrary outside file',async t=>{
 const root=fixture(t),zip=new JSZip();zip.file('conversations.json',JSON.stringify([conversation()]));zip.file('one/report.html','one');zip.file('two/report.html','two');const file=path.join(root,'export.zip');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));const p=await scanChatGPT(file,path.join(root,'stage'));assert.equal(p.items.find(i=>i.kind==='file').status,'unavailable')
})
