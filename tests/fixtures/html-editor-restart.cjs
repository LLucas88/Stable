'use strict'

const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {app,BrowserWindow,dialog,webContents}=require('electron')
const root=path.resolve(process.argv[2])
const hasConflict=process.argv[3]==='conflict'
const updatedText='HTML_PENDING_TEXT_RESTART'

process.env.STABLE_QA_USER_DATA=path.join(root,'profile')
process.env.STABLE_QA_CAPTURE=path.join(root,'unused-capture.png')
process.env.STABLE_QA_CAPTURE_DELAY='60000'
process.env.STABLE_QA_THEME='light'
process.env.STABLE_CLOUD_ENABLED='0'
process.env.STABLE_DEV_WATCH='1'
for(const method of ['show','showInactive','focus']) BrowserWindow.prototype[method]=function(){}
app.getAppPath=()=>path.resolve(__dirname,'../..')
app.disableHardwareAcceleration()
const responses=hasConflict?[0,3]:[]
dialog.showMessageBox=async(...args)=>{
 const options=args.at(-1)
 assert.ok(responses.length,'A successful autosave must not prompt before restarting')
 assert.equal(options.buttons[3],'放弃写入并退出')
 return {response:responses.shift()}
}

let host
app.on('browser-window-created',(_event,win)=>{if(!host)host=win})
require('../../desktop/main.cjs')

async function main(){
 await app.whenReady()
 const deadline=Date.now()+15000
 let development
 while(Date.now()<deadline){
  if(host&&!host.webContents.isLoading()){
   development=await host.webContents.executeJavaScript('window.stable.development.state()').catch(()=>null)
   if(development?.action==='restart')break
  }
  await new Promise(resolve=>setTimeout(resolve,50))
 }
 assert.equal(development?.action,'restart','The test launcher must offer a source restart')

 const ui=code=>host.webContents.executeJavaScript(code)
 const state=await ui('window.stable.bootstrap()')
 const file=path.join(state.paths.workspace,'restart-preview.html')
 const original='<!doctype html><meta charset="utf-8"><h1 id="title">Original heading</h1>'
 fs.writeFileSync(file,original)
 await ui(`window.stable.preview.openFile(${JSON.stringify(file)},{x:400,y:100,width:700,height:600})`)
 const parameters={conversationId:state.activeConversationId,action:'editorStart',filePath:file}
 const editor=await ui(`window.stable.browser.command(${JSON.stringify(parameters)})`)
 assert.ok(editor.sessionId)
 const contents=webContents.getAllWebContents().find(page=>page.getURL().endsWith('/restart-preview.html'))
 assert.ok(contents)
 await contents.executeJavaScriptInIsolatedWorld(1015,[{code:`
  (() => {
    const heading=document.querySelector('#title')
    heading.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))
    heading.textContent=${JSON.stringify(updatedText)}
    heading.dispatchEvent(new Event('input',{bubbles:true}))
  })()
 `}])
 assert.equal(fs.readFileSync(file,'utf8'),original,'The input is still pending when the user clicks restart')

 const applyRestart=()=>ui(`window.stable.development.apply(${development.revision})`)
 const external=original+'<!-- external edit -->'
 if(hasConflict){
  fs.writeFileSync(file,external)
  const cancelled=await applyRestart()
  assert.equal(cancelled.action,'restart')
  assert.match(cancelled.message,/重启已取消/)
  assert.equal(host.isDestroyed(),false)
  assert.equal(fs.readFileSync(file,'utf8'),external)
  assert.equal(await contents.executeJavaScript('document.body.inert'),false,'The editor must unlock after cancelling the quit')
 }
 app.once('will-quit',()=>{
  try{
   assert.equal(responses.length,0)
   const saved=fs.readFileSync(file,'utf8')
   if(hasConflict)assert.equal(saved,external)
   else assert.ok(saved.includes(updatedText))
   console.log('HTML_EDITOR_RESTART_QUIT_CHECKED')
  }catch(error){console.error(error.stack);process.exitCode=1}
 })
 const result=await applyRestart().catch(error=>{
  if(!host.isDestroyed())throw error
 })
 if(result?.action==='restart')assert.fail(result.message||'The source restart was blocked')
}

main().catch(error=>{console.error(error.stack);app.exit(1)})
