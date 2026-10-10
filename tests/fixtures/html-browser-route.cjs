'use strict'
const {app,BrowserWindow,nativeImage} = require('electron')
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict')
const {BuiltinTools}=require('../../desktop/services/builtin-tools.cjs')
const {BrowserSessionService}=require('../../desktop/services/browser-session.cjs')
const {createClaudeTools}=require('../../desktop/services/claude-tools.cjs')
const output=path.resolve(__dirname,'../../qa-artifacts/html-browser-route')
fs.mkdirSync(output,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(output,'profile-')));app.disableHardwareAcceleration()
let win,service,builtins
async function main(){
  await app.whenReady()
  const values=new Map(), store={getSetting:k=>values.get(k),setSetting:(k,v)=>values.set(k,structuredClone(v))}
  store.setSetting('browser-download-settings',{directory:output})
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  service=new BrowserSessionService({electron:require('electron'),store,getWindow:()=>win})
  const fixture=path.join(output,'fixture.html')
  fs.writeFileSync(fixture,'<!doctype html><meta charset="utf-8"><h1>报告验证测试</h1><button onclick="this.textContent=\'验证通过\'">检查交互</button>')
  const file=process.env.STABLE_HTML_PREVIEW_SMOKE_FILE || fixture
  const original=fs.readFileSync(file)
  builtins=new BuiltinTools({workspace:[output,path.dirname(file)],electron:require('electron'),browserSession:service,conversationId:'preview-test'})
  const sdk={tool:(name,description,shape,handler)=>({name,handler}),createSdkMcpServer:x=>x}
  const server=createClaudeTools({sdk,workspace:output,builtinTools:builtins,requestApproval:async()=>true})
  const tool=server.tools.find(t=>t.name==='stable_browser')
  const call=async args=>{const result=await tool.handler(args);assert(!result.isError,JSON.stringify(result));return result}
  const opened=JSON.parse((await call({action:'open',url:file})).content[0].text)
  assert(opened.tabId)
  assert.equal(opened.diagnosticsEnabled,false)
  const read=JSON.parse((await call({action:'read',tabId:opened.tabId})).content[0].text)
  assert(read.text.length>10)
  assert.equal(read.diagnosticsEnabled,false)
  assert.equal((await tool.handler({action:'diagnostics',tabId:opened.tabId})).isError,true,'Diagnostics must still require user permission')
  service.get('preview-test',opened.tabId).diagnostics=true
  const enabled=JSON.parse((await call({action:'read',tabId:opened.tabId})).content[0].text)
  assert.equal(enabled.diagnosticsEnabled,true)
  await call({action:'diagnostics',tabId:opened.tabId})
  if(file===fixture){await call({action:'click',tabId:opened.tabId,ref:enabled.controls.find(c=>c.label==='检查交互').ref})}
  const screenshot=await call({action:'screenshot',tabId:opened.tabId})
  const image=screenshot.content.find(c=>c.type==='image');assert(image,'MCP screenshot image missing')
  const pixels=nativeImage.createFromBuffer(Buffer.from(image.data,'base64'));assert(!pixels.isEmpty());assert(pixels.getSize().width>=1000)
  assert.equal(win.isVisible(),false)
  assert.equal(BrowserWindow.getAllWindows().length,1,'Temporary capture host leaked')
  assert(!service.get('preview-test',opened.tabId).view.webContents.isDestroyed())
  fs.writeFileSync(path.join(output,file===fixture?'fixture.png':'report.png'),pixels.toPNG())
  assert.deepEqual(fs.readFileSync(file),original)
  service.control('preview-test',opened.tabId,true)
  assert.equal((await tool.handler({action:'screenshot',tabId:opened.tabId})).isError,true)
  console.log('HTML_BROWSER_ROUTE_PASSED '+JSON.stringify({originalUnchanged:true,readCharacters:read.text.length,imageSize:pixels.getSize()}))
}
main().then(()=>{builtins?.dispose();service?.dispose();win?.destroy();app.exit(0)}).catch(e=>{console.error(e);builtins?.dispose();service?.dispose();win?.destroy();app.exit(1)})
