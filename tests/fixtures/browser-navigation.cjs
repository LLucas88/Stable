'use strict'
const electron=require('electron'),{app,BrowserWindow}=electron
const http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict')
const {BrowserSessionService}=require('../../desktop/services/browser-session.cjs')
const root=process.env.STABLE_NAVIGATION_TEST_ROOT
if(!root)throw Error('Missing isolated profile')
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{})
let service,window,source,target
async function main(){
  await app.whenReady()
  let hits=0
  target=http.createServer((_req,res)=>{hits++;res.setHeader('content-type','text/html');res.end('<h1>AUTHORIZED_DESTINATION</h1>')})
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve))
  const destination=`http://127.0.0.1:${target.address().port}/destination`
  source=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:destination});res.end()}else{res.setHeader('content-type','text/html');res.end('<h1>SOURCE_OK</h1>')}})
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${source.address().port}`
  window=new BrowserWindow({show:false,webPreferences:{sandbox:true}})
  const data=new Map(),store={getSetting:key=>data.get(key),setSetting:(key,value)=>data.set(key,structuredClone(value))}
  service=new BrowserSessionService({electron,store,getWindow:()=>window})
  const invoke=url=>service.execute('fixture',{action:'open',url},undefined,'run',{networkAccess:true,workspace:root})
  await assert.rejects(invoke(origin+'/redirect'),error=>{
    assert.equal(error.code,'BROWSER_NAVIGATION_BLOCKED');assert(error.message.includes(destination));assert.match(error.message,/权限检查/);return true
  })
  assert.equal(hits,0,'redirect target must not be contacted before explicit approval')
  assert(!service.sites('fixture').includes(new URL(destination).origin))
  assert.match((await invoke(origin+'/ok')).text,/SOURCE_OK/)
  assert.equal(service.get('fixture').blockedURL,'','a later open must not retain stale redirect evidence')
  assert.match((await invoke(destination)).text,/AUTHORIZED_DESTINATION/)
  assert(hits>0)
  // Exercise the actual hidden compositor, Chromium keyboard input and MCP
  // batching without attaching the tab to the main window.
  const tab=service.get('fixture')
  await tab.view.webContents.executeJavaScript(`document.body.innerHTML=${JSON.stringify('<a href="#detail">经营亮点</a><button id="open" onclick="document.querySelector(\'dialog\').showModal()">打开卡片</button><dialog><button autofocus>第一个</button><button>最后一个</button></dialog><section id="detail">详情</section>')};true`)
  const sdk={tool:(name,description,shape,handler)=>({name,handler}),createSdkMcpServer:value=>value}
  const tools=require('../../desktop/services/claude-tools.cjs').createClaudeTools({sdk,workspace:root,requestApproval:async()=>true,
    builtinTools:{execute:request=>service.execute('fixture',request.args,undefined,'run',{networkAccess:true,workspace:root}),cancel(){}}})
  const browser=tools.tools.find(t=>t.name==='stable_browser')
  const call=async args=>{const result=await browser.handler({tabId:tab.id,...args});assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content.filter(c=>c.type==='text').at(-1).text)}
  let state=await call({action:'read'})
  const documentEpoch=state.documentEpoch
  await call({action:'batch',steps:[{action:'click',label:'经营亮点'},{action:'read'}]})
  state=await call({action:'read'})
  assert.equal(state.documentEpoch,documentEpoch);assert(state.url.endsWith('#detail'))
  const open=state.controls.find(c=>c.label==='打开卡片').ref
  await call({action:'key',ref:open,value:'Space'})
  assert.equal(await tab.view.webContents.executeJavaScript('document.querySelector("dialog").open'),true)
  await call({action:'key',value:'Tab'})
  assert.equal(await tab.view.webContents.executeJavaScript('document.activeElement.textContent'),'最后一个')
  await call({action:'key',value:'Tab'})
  await call({action:'key',value:'Tab'})
  assert.equal(await tab.view.webContents.executeJavaScript('document.activeElement.closest("dialog") !== null'),true)
  await call({action:'key',value:'Escape'})
  assert.equal(await tab.view.webContents.executeJavaScript('document.querySelector("dialog").open'),false)
  assert.equal(await tab.view.webContents.executeJavaScript('document.activeElement.id'),'open')
  assert.equal(window.isVisible(),false);assert.equal(service.shown,null)
  service.control('fixture',tab.id,true)
  await assert.rejects(service.execute('fixture',{action:'key',tabId:tab.id,value:'Enter'}),/接管/)
  service.control('fixture',tab.id,false)
  const aborted=new AbortController();aborted.abort()
  await assert.rejects(service.execute('fixture',{action:'key',tabId:tab.id,value:'Enter'},aborted.signal))
  console.log('BROWSER_NAVIGATION_PASSED')
}
function close(code){service?.dispose();window?.destroy();for(const server of [source,target]){server?.closeAllConnections();server?.close()}app.exit(code)}
main().then(()=>close(0)).catch(error=>{console.error(error.stack);close(1)})
