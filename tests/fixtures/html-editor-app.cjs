const electron=require('electron'),{app,BrowserWindow,webContents}=electron,fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const out=path.resolve(__dirname,'../../qa-artifacts/html-editor-app');fs.mkdirSync(out,{recursive:true});const root=fs.mkdtempSync(path.join(out,'run-'))
process.env.STABLE_QA_USER_DATA=path.join(root,'profile');process.env.STABLE_QA_CAPTURE=path.join(root,'app.png');process.env.STABLE_QA_CAPTURE_DELAY='60000';process.env.STABLE_QA_THEME='light'
for(const name of ['show','showInactive','focus'])BrowserWindow.prototype[name]=function(){}
app.getAppPath=()=>path.resolve(__dirname,'../..')
app.disableHardwareAcceleration();let host
app.on('browser-window-created',(_event,win)=>{if(!host)host=win})
require('../../desktop/main.cjs')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function main(){
 await app.whenReady();for(let i=0;i<100;i++){if(host&&!host.webContents.isLoading()&&await host.webContents.executeJavaScript('!!window.stable?.bootstrap').catch(()=>false))break;await delay(100)}
 const ui=code=>host.webContents.executeJavaScript(code),state=await ui('window.stable.bootstrap()'),id=state.activeConversationId,workspace=state.paths.workspace
 const file=path.join(workspace,'editor-main.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><h1 id="title">实际主进程</h1><p id="body">正文</p>')
 await ui(`window.stable.preview.openFile(${JSON.stringify(file)},{x:400,y:100,width:700,height:600})`)
 const started=await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorStart',filePath:${JSON.stringify(file)}})`)
 const contents=webContents.getAllWebContents().find(w=>w.getURL().includes('editor-main.html'));assert.ok(contents)
 const edit=code=>contents.executeJavaScriptInIsolatedWorld(1015,[{code:code+';true'}])
 await edit(`__stableHtmlEditor.choose('#title');__stableHtmlEditor.run('text','真实 IPC 保存')`)
 await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorSave',sessionId:${JSON.stringify(started.sessionId)}})`);assert.ok(fs.readFileSync(file,'utf8').includes('真实 IPC 保存'))
 await edit(`document.querySelector('#title').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));document.querySelector('#title').textContent='切换自动保存';document.querySelector('#title').dispatchEvent(new Event('input',{bubbles:true}))`)
 await ui('window.stable.preview.close()');await delay(300);assert.ok(fs.readFileSync(file,'utf8').includes('切换自动保存'));assert.equal(contents.isDestroyed(),false)
 await ui(`window.stable.preview.openFile(${JSON.stringify(file)},{x:400,y:100,width:700,height:600})`);assert.equal(webContents.getAllWebContents().find(w=>w.getURL().includes('editor-main.html')).id,contents.id)
 await edit(`__stableHtmlEditor.run('undo')`);await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorSave',sessionId:${JSON.stringify(started.sessionId)}})`);assert.ok(fs.readFileSync(file,'utf8').includes('真实 IPC 保存'))
 // External/AI updates refresh only a clean editor; dirty updates remain conflicts.
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('真实 IPC 保存','AI 更新后'))
 await delay(1400);assert.equal(await contents.executeJavaScript(`document.querySelector('#title').textContent`),'AI 更新后')
 const disk=fs.readFileSync(file,'utf8');await edit(`__stableHtmlEditor.choose('#title');__stableHtmlEditor.run('text','未保存的修改')`);fs.writeFileSync(file,disk+'<!-- external -->')
 electron.dialog.showMessageBox=async()=>({response:1})
 app.quit();await delay(300);assert.equal(host.isDestroyed(),false);assert.ok(fs.readFileSync(file,'utf8').endsWith('<!-- external -->'))
 await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorReload',sessionId:${JSON.stringify(started.sessionId)}})`)
 // Upload grants precede sending a message; opening the file must also pass the request filter.
 const uploaded=path.join(root,'uploaded.html'),neighbor=path.join(root,'not-uploaded.html')
 fs.writeFileSync(uploaded,'<!doctype html><link rel="stylesheet" href="uploaded.css"><h1 id="upload">上传即预览</h1><script src="uploaded.js"></script>')
 fs.writeFileSync(neighbor,'not uploaded');fs.writeFileSync(path.join(root,'uploaded.css'),'h1{color:rgb(12,34,56)}');fs.writeFileSync(path.join(root,'uploaded.js'),'window.uploadedScript=true')
 await assert.rejects(ui(`window.stable.preview.openFile(${JSON.stringify(uploaded)},{x:400,y:100,width:700,height:600})`),/工作区/)
 await ui(`window.stable.agent.inspectAttachments([${JSON.stringify(uploaded)}])`)
 await ui(`window.stable.preview.openFile(${JSON.stringify(uploaded)},{x:400,y:100,width:700,height:600})`)
 const uploadContents=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/uploaded.html'));assert.ok(uploadContents)
 assert.equal(await uploadContents.executeJavaScript(`document.querySelector('#upload').textContent`),'上传即预览');assert.equal(await uploadContents.executeJavaScript('window.uploadedScript'),true);assert.equal(await uploadContents.executeJavaScript(`getComputedStyle(document.querySelector('h1')).color`),'rgb(12, 34, 56)')
 await assert.rejects(ui(`window.stable.preview.openFile(${JSON.stringify(neighbor)},{x:400,y:100,width:700,height:600})`),/工作区/)
 const uploadEdit=await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorStart',filePath:${JSON.stringify(uploaded)}})`)
 await uploadContents.executeJavaScriptInIsolatedWorld(1015,[{code:`__stableHtmlEditor.choose('#upload');__stableHtmlEditor.run('text','上传后可编辑');true`}])
 await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorSave',sessionId:${JSON.stringify(uploadEdit.sessionId)}})`);assert.ok(fs.readFileSync(uploaded,'utf8').includes('上传后可编辑'))
 await ui(`window.stable.browser.command({conversationId:${JSON.stringify(id)},action:'editorStop',sessionId:${JSON.stringify(uploadEdit.sessionId)}})`)
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,file,sessionId:started.sessionId,retainedContents:contents.id,uploadedPreview:true,uploadedRelativeAssets:true,uploadedEdit:true,neighborDenied:true},null,2))

 console.log('HTML_EDITOR_APP_PASSED');app.exit(0)
}
main().catch(error=>{console.error(error.stack);app.exit(1)})
