const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os')
const {resolveWorkspaceEntry}=require('../desktop/services/preview.cjs')
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stable-editor-ipc-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'report.html');fs.writeFileSync(file,'<h1>hello</h1>')
 const callbacks={},calls=[],contents={isDestroyed:()=>false,loadFile:async()=>{},close:()=>{}},view={webContents:contents},sender={mainFrame:{}},event={sender,senderFrame:sender.mainFrame},editor={document:{path:file},contents,view}
 const context={attachmentPreviews:new (require('../desktop/services/attachment-previews.cjs').AttachmentPreviews)(),ipcMain:{handle:(name,fn)=>callbacks[name]=fn},store:{conversation:id=>id==='a',activeConversationId:()=> 'a'},featureFlags:{sharedBrowser:true},mainWindow:{webContents:sender},browserSession:{},previewSourcePath:file,previewKind:'html',previewView:view,resolveWorkspaceEntry,conversationPaths:()=>({workspace:directory,writableRoots:[directory],readableRoots:[directory]}),htmlEditors:{start:async options=>{calls.push(options);return{sessionId:'session'}},get:(id,key)=>{if(id!=='a'||key!=='session')throw Error('会话不匹配');return editor},flush:async()=>true,stop:async()=>true,poll:async()=>({deliveries:[]}),find:()=>editor,state:()=>({sessionId:'session'}),acknowledge:()=>true},dialog:{showMessageBox:async()=>({response:0})}}
 const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8'),start=source.indexOf("  ipcMain.handle('stable:browser:command'"),end=source.indexOf("  ipcMain.handle('stable:preview:existingFiles'",start)
 vm.runInNewContext(source.slice(start,end),context)
 return{context,calls,event,file,command:callbacks['stable:browser:command']}
}
test('editor IPC requires main frame, active matching preview and writable root',async t=>{
 const f=fixture(t);assert.equal((await f.command(f.event,{conversationId:'a',action:'editorStart',filePath:f.file})).sessionId,'session');assert.equal(f.calls[0].file,f.file)
 await assert.rejects(f.command({sender:{},senderFrame:{}},{conversationId:'a',action:'editorStart',filePath:f.file}),/不允许/)
 await assert.rejects(f.command({...f.event,senderFrame:{}},{conversationId:'a',action:'editorSave',sessionId:'session'}),/不允许/)
 f.context.previewSourcePath='other';await assert.rejects(f.command(f.event,{conversationId:'a',action:'editorStart',filePath:f.file}),/先打开/)
 f.context.previewSourcePath=f.file;f.context.conversationPaths=()=>({writableRoots:[],readableRoots:[path.dirname(f.file)]});await assert.rejects(f.command(f.event,{conversationId:'a',action:'editorStart',filePath:f.file}),/工作区/)
 assert.equal(fs.readFileSync(f.file,'utf8'),'<h1>hello</h1>')
})
test('editor commands reject unknown sessions and cancelled reload retains the session',async t=>{
 const f=fixture(t);await assert.rejects(f.command(f.event,{conversationId:'a',action:'editorSave',sessionId:'other'}),/匹配/);assert.equal(await f.command(f.event,{conversationId:'a',action:'editorReload',sessionId:'session'}),false)
 await assert.rejects(f.command(f.event,{conversationId:'a',action:'editorArbitrary',sessionId:'session'}),/未知/)
})
