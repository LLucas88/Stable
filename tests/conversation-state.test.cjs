const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { StableStore } = require('../desktop/services/store.cjs')
function setup(t) { const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-history-v2-')); const store=new StableStore(root); t.after(()=>{try{store.close()}catch{};fs.rmSync(root,{recursive:true,force:true})}); return {root,store} }
test('10,000 equal-time messages page newest-first, display oldest-first, and have no gaps or duplicates',t=>{
  const {store}=setup(t), id=store.activeConversationId();store.db.exec('BEGIN')
  const insert=store.db.prepare('INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)')
  for(let i=0;i<10000;i++)insert.run('message-'+i,id,'user','内容'+i,'2020-01-01T00:00:00.000Z')
  store.db.exec('COMMIT');const first=store.messagePage(id);assert.equal(first.messages[0].content,'内容9800');assert.equal(first.messages.at(-1).content,'内容9999')
  let page=first, ids=[];do{ids.push(...page.messages.map(m=>m.id));page=page.beforeCursor?store.messagePage(id,page.beforeCursor):null}while(page)
  assert.equal(ids.length,10000);assert.equal(new Set(ids).size,10000);assert.equal(store.recentContext(id).at(-1).content,'内容9999')
})
test('project runs resolve stable real directories; offline or replaced roots do not fall back or hide history',t=>{
  const {store,root}=setup(t), a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b)
  const pa=store.registerProject('A',a),pb=store.registerProject('B',b),ca=store.activeConversationId(),cb=store.createConversation()
  store.bindProject(ca,pa,root);store.bindProject(cb,pb,root);store.addMessage(ca,'user','保留原始消息')
  assert.equal(store.resolveRunContext(ca,root).cwd,a);assert.equal(store.resolveRunContext(cb,root).cwd,b)
  store.selectConversation(cb);store.renameConversation(ca,'换名字');assert.equal(store.resolveRunContext(ca,root).cwd,a)
  fs.renameSync(a,path.join(root,'old-a'));assert.throws(()=>store.resolveRunContext(ca,root),/不可用/);assert.equal(store.listMessages(ca)[0].content,'保留原始消息')
  fs.mkdirSync(a);assert.throws(()=>store.resolveRunContext(ca,root),/身份/)
  store.archiveConversation(cb,true);assert.throws(()=>store.resolveRunContext(cb,root),/恢复/);store.archiveConversation(cb,false);assert.equal(store.resolveRunContext(cb,root).cwd,b)
})
test('migration writes a consistent backup and does not regenerate it on reopen',t=>{
  const {store,root}=setup(t);const marker=store.getSetting('conversationStateV2');assert.ok(fs.existsSync(marker.backup));store.close();const reopened=new StableStore(root)
  assert.equal(reopened.getSetting('conversationStateV2').backup,marker.backup);reopened.close()
})

test('indexed substring search paginates, includes short Chinese terms and follows updates/deletes',t=>{
 const {store}=setup(t),first=store.activeConversationId();const ids=[]
 for(let n=0;n<7;n++){const id=n?store.createConversation():first;ids.push(id);store.addMessage(id,'user','品牌报表 unique-needle '+n);store.renameConversation(id,'Search fixture '+n)}
 const a=store.searchConversations('unique-needle',3),b=store.searchConversations('unique-needle',3,3);assert.equal(a.length,3);assert.equal(new Set([...a,...b].map(x=>x.id)).size,6)
 assert.equal(store.searchConversations('品牌').length,7);assert.equal(store.searchConversations('品牌报表').length,7)
 store.clearMessages(first);assert(!store.searchConversations('unique-needle').some(x=>x.id===first));const message=store.listMessages(ids[1])[0];store.db.prepare('UPDATE messages SET content=? WHERE id=?').run('changed content',message.id);assert(!store.searchConversations('unique-needle').some(x=>x.id===ids[1]));assert.equal(store.searchConversations('changed content')[0].id,ids[1])
 assert(store.db.prepare('SELECT rowid FROM message_search WHERE message_search MATCH ?').all('"unique-needle"').length===5)
})

test('migration dry run uses a separate consistent copy and preserves records and original database',t=>{const {store,root}=setup(t);store.addMessage(store.activeConversationId(),'user','演练保留正文');const {verifyMigration}=require('../scripts/verify-conversation-migration.cjs');const output=root+'-dry-run';const report=verifyMigration(root,output);assert(report.sourceUntouched&&report.recordsPreserved);assert.equal(report.integrity,'ok');assert.equal(store.listMessages(store.activeConversationId())[0].content,'演练保留正文');assert.throws(()=>verifyMigration(root,output),/新目录/);t.after(()=>fs.rmSync(output,{recursive:true,force:true}))})


test('multi-folder projects persist, deduplicate folders and reject unavailable secondary roots before execution',t=>{
  const {store,root}=setup(t),a=path.join(root,'source-a'),b=path.join(root,'source-b');fs.mkdirSync(a);fs.mkdirSync(b)
  const projectId=store.createProject('命名项目',[a,b,a]),id=store.activeConversationId();store.bindProject(id,projectId,root)
  assert.equal(store.listProjects()[0].name,'命名项目');assert.deepEqual(store.resolveRunContext(id,root).writableRoots,[a,b])
  store.addMessage(id,'user','保留历史');store.close();const reopened=new StableStore(root)
  try {assert.equal(reopened.conversationContext(id).projectId,projectId);assert.equal(reopened.listProjects()[0].folders.length,2);fs.renameSync(b,b+'-offline');assert.throws(()=>reopened.resolveRunContext(id,root),/源文件夹不可用/);assert.equal(reopened.listMessages(id)[0].content,'保留历史')}finally{reopened.close()}
})
test('project creation validates all folders atomically and migrates legacy single-root projects',t=>{
 const {store,root}=setup(t),a=path.join(root,'source');fs.mkdirSync(a)
 assert.throws(()=>store.createProject('bad',[a,path.join(root,'missing')]));assert.equal(store.listProjects().length,0)
 assert.throws(()=>store.createProject('bad',[]));assert.throws(()=>store.createProject('',[a]))
 const id=store.registerProject('old',a);store.db.prepare('DELETE FROM project_folders WHERE project_id=?').run(id);store.close()
 const reopened=new StableStore(root);try{assert.deepEqual(reopened.projectFolders(id).map(f=>f.path),[a])}finally{reopened.close()}
})
test('workbook paths allow an explicit second project folder without permitting sibling escapes or relative fallback',t=>{
 const {root}=setup(t),a=path.join(root,'one'),b=path.join(root,'two'),other=path.join(root,'outside');for(const dir of [a,b,other])fs.mkdirSync(dir)
 for(const dir of [b,other])fs.writeFileSync(path.join(dir,'book.xlsx'),'test')
 const {toolFile}=require('../desktop/services/tool-files.cjs');assert.equal(toolFile([a,b],path.join(b,'book.xlsx')),path.join(b,'book.xlsx'))
 assert.throws(()=>toolFile([a,b],path.join(other,'book.xlsx')),/工作区/);assert.throws(()=>toolFile([a,b],'book.xlsx'))
 assert.equal(toolFile([a,b],'output.xlsx',{output:true}),path.join(a,'output.xlsx'))
})
