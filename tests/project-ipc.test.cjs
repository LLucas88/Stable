const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm')
const {createRequire}=require('node:module'),{StableStore}=require('../desktop/services/store.cjs')
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-project-ipc-')),workspace=path.join(root,'workspace');fs.mkdirSync(workspace)
 const calls=[],shell={openPath:async value=>{calls.push(value);return ''}},store=new StableStore(root),handlers={},agentRunners=new Map(),dialog={showOpenDialog:async()=>({canceled:true,filePaths:[]})}
 const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8'),start=source.indexOf("  ipcMain.handle('stable:projects:pickFolders'"),end=source.indexOf("  ipcMain.handle('stable:agent:viewState'",start)
 const manageStart=source.indexOf("  ipcMain.handle('stable:projects:manage'"),manageEnd=source.indexOf("  ipcMain.handle('stable:agent:rename'",manageStart)
 vm.runInNewContext(source.slice(start,end)+source.slice(manageStart,manageEnd),{shell,ipcMain:{handle:(key,fn)=>handlers[key]=fn},require:createRequire(path.join(__dirname,'../desktop/main.cjs')),store,paths:{workspace},path,mainWindow:null,dialog,agentRunners,requireText:v=>v,agentState:id=>({activeConversationId:id,conversations:store.listConversations(),projects:store.listProjects(),context:store.conversationContext(id)})})
 t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true})})
 return {root,workspace,store,dialog,agentRunners,calls,shell,call:(method,payload)=>handlers['stable:projects:'+method](null,payload)}
}
test('project IPC preserves existing conversation history and uses new contexts only when needed',t=>{
 const {root,workspace,store,call,agentRunners}=fixture(t),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b)
 const project=call('create',{name:'Project',folders:[a,b]}),original=store.activeConversationId()
 const selected=call('open',{projectId:project.id,conversationId:original});assert.equal(selected.activeConversationId,original);assert.equal(selected.context.cwd,a)
 store.addMessage(original,'user','历史内容');const separate=call('open',{projectId:null,conversationId:original})
 assert.notEqual(separate.activeConversationId,original);assert.equal(store.listMessages(original)[0].content,'历史内容');assert.equal(store.conversationContext(original).cwd,a);assert.equal(separate.context.cwd,workspace)
 agentRunners.set(original,{});assert.throws(()=>call('open',{projectId:project.id,conversationId:original}),/停止/)
 const count=store.listConversations().length;fs.renameSync(b,b+'-missing');assert.throws(()=>call('open',{projectId:project.id}));assert.equal(store.listConversations().length,count)
})
test('folder picker cancellation does not create projects; selected folders and names pass through IPC',async t=>{
 const {call,dialog,store,root}=fixture(t);assert.equal((await call('pickFolders')).length,0);assert.equal(store.listProjects().length,0)
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});assert.deepEqual(await call('pickFolders'),[root])
 const project=call('create',{name:'自定义名称',folders:[root]});assert.equal(project.name,'自定义名称');assert.equal(project.folders[0].path,root)
})


test('project menu pins persist, Explorer uses project root, and removal keeps conversations and files',async t=>{
 const {root,store,call,calls,shell,agentRunners}=fixture(t),a=path.join(root,'source-a'),b=path.join(root,'source-b');fs.mkdirSync(a);fs.mkdirSync(b)
 const pa=call('create',{name:'A',folders:[a]}),pb=call('create',{name:'B',folders:[b]}),id=store.activeConversationId()
 call('open',{projectId:pa.id,conversationId:id});store.addMessage(id,'user','保留聊天');const file=path.join(a,'report.txt');fs.writeFileSync(file,'保留文件')
 await call('manage',{id:pa.id,action:'pin'});assert.equal(store.listProjects()[0].id,pa.id)
 const secondStore=new StableStore(root);try{assert.equal(secondStore.listProjects()[0].pinned,true)}finally{secondStore.close()}
 await call('manage',{id:pb.id,action:'open'});assert.equal(calls.at(-1),b)
 shell.openPath=async()=> 'fixture denied';await assert.rejects(call('manage',{id:pb.id,action:'open'}),/fixture denied/)
 agentRunners.set(id,{});await assert.rejects(call('manage',{id:pa.id,action:'remove'}),/停止/);assert(store.listProjects().some(p=>p.id===pa.id));agentRunners.clear()
 await call('manage',{id:pa.id,action:'unpin'});assert.equal(store.listProjects().find(p=>p.id===pa.id).pinned,false)
 await call('manage',{id:pa.id,action:'remove'});assert(!store.listProjects().some(p=>p.id===pa.id));assert.equal(store.conversationContext(id).projectId,null);assert.equal(store.conversationContext(id).cwd,a);assert.equal(store.listMessages(id)[0].content,'保留聊天');assert.equal(fs.readFileSync(file,'utf8'),'保留文件')
 await assert.rejects(call('manage',{id:'missing',action:'pin'}),/找不到/)
})
