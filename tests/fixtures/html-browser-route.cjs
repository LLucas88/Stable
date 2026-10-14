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
  const audit=JSON.parse((await call({action:'audit',tabId:opened.tabId})).content[0].text)
  assert.equal(audit.untrustedContent,true)
  assert(audit.viewport.width>=1000)
  if(file!==fixture)fs.writeFileSync(path.join(output,'audit-report.json'),JSON.stringify(audit,null,2))
  if(file===fixture){await call({action:'click',tabId:opened.tabId,ref:enabled.controls.find(c=>c.label==='检查交互').ref})}
  const screenshot=await call({action:'screenshot',tabId:opened.tabId})
  const image=screenshot.content.find(c=>c.type==='image');assert(image,'MCP screenshot image missing')
  const pixels=nativeImage.createFromBuffer(Buffer.from(image.data,'base64'));assert(!pixels.isEmpty());assert(pixels.getSize().width>=1000)
  assert.equal(win.isVisible(),false)
  assert.equal(BrowserWindow.getAllWindows().length,1,'Temporary capture host leaked')
  assert(!service.get('preview-test',opened.tabId).view.webContents.isDestroyed())
  fs.writeFileSync(path.join(output,file===fixture?'fixture.png':'report.png'),pixels.toPNG())
  assert.deepEqual(fs.readFileSync(file),original)
  if(file===fixture){
    const bad=path.join(output,'layout-broken.html'), good=path.join(output,'layout-fixed.html')
    fs.writeFileSync(bad,`<!doctype html><meta charset="utf-8"><style>
      .tt{opacity:0;position:absolute} .zoomed{position:fixed;left:50%;width:880px;height:400px;top:10px;transform:translateX(0)}
      canvas{width:0;height:0}</style><nav><a href="#report"><div class="tt">章节标题</div></a></nav><h2 class="tt">报告标题</h2><div class="zoomed" role="dialog">放大内容</div><canvas></canvas>`)
    await call({action:'open',tabId:opened.tabId,url:bad})
    const broken=JSON.parse((await call({action:'audit',tabId:opened.tabId})).content[0].text)
    assert(broken.hiddenHeadings.some(h=>h.label==='报告标题'&&h.hiddenBy.opacity==='0'))
    assert(broken.hiddenText.some(h=>h.label==='章节标题'&&h.hiddenBy.opacity==='0'))
    assert(broken.overlays.some(o=>o.classes==='zoomed'&&o.outsideViewport&&o.rect.right>broken.viewport.width))
    assert(broken.charts.some(c=>c.zeroSize))
    fs.writeFileSync(path.join(output,'audit-broken.json'),JSON.stringify(broken,null,2))
    fs.writeFileSync(good,`<!doctype html><meta charset="utf-8"><style>
      dialog{box-sizing:border-box;width:min(880px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}
      canvas{width:100%;height:150px}</style><nav><h2 class="report-toc-title">章节标题</h2></nav>
      <button onclick="document.querySelector('dialog').showModal()">打开卡片</button>
      <dialog><h2>放大内容</h2><canvas></canvas><button onclick="this.closest('dialog').close()">关闭卡片</button></dialog>`)
    for(const width of [1280,375]){
      service.get('preview-test',opened.tabId).view.setBounds({x:0,y:0,width,height:900})
      const page=JSON.parse((await call({action:'open',tabId:opened.tabId,url:good})).content[0].text)
      await call({action:'click',tabId:opened.tabId,ref:page.controls.find(c=>c.label==='打开卡片').ref})
      const fixed=JSON.parse((await call({action:'audit',tabId:opened.tabId})).content[0].text)
      assert.equal(fixed.viewport.width,width)
      assert.equal(fixed.hiddenHeadings.length,0)
      assert.equal(fixed.horizontalOverflow.length,0)
      assert(fixed.overlays.some(o=>o.tag==='dialog'))
      assert(fixed.overlays.every(o=>!o.outsideViewport))
      assert(fixed.charts.every(c=>!c.zeroSize))
      fs.writeFileSync(path.join(output,`audit-fixed-${width}.json`),JSON.stringify(fixed,null,2))
      const current=JSON.parse((await call({action:'read',tabId:opened.tabId})).content[0].text)
      await call({action:'click',tabId:opened.tabId,ref:current.controls.find(c=>c.label==='关闭卡片').ref})
      const closed=JSON.parse((await call({action:'audit',tabId:opened.tabId})).content[0].text)
      assert.equal(closed.overlays.length,0)
    }
    // The non-shared fallback uses the same isolated audit without console permission.
    const {BrowserTool}=require('../../desktop/services/browser-tool.cjs')
    const fallback=new BrowserTool({electron:require('electron')})
    try{
      await fallback.execute({action:'open',url:service.get('preview-test',opened.tabId).view.webContents.getURL()})
      const result=await fallback.execute({action:'audit'})
      assert(result.viewport.width>0)
      assert.equal(result.overlays.length,0)
    }finally{fallback.dispose()}
  }
  service.control('preview-test',opened.tabId,true)
  assert.equal((await tool.handler({action:'screenshot',tabId:opened.tabId})).isError,true)
  assert.equal((await tool.handler({action:'audit',tabId:opened.tabId})).isError,true,'Audit must respect user takeover')
  console.log('HTML_BROWSER_ROUTE_PASSED '+JSON.stringify({originalUnchanged:true,readCharacters:read.text.length,imageSize:pixels.getSize()}))
}
main().then(()=>{builtins?.dispose();service?.dispose();win?.destroy();app.exit(0)}).catch(e=>{console.error(e);builtins?.dispose();service?.dispose();win?.destroy();app.exit(1)})
