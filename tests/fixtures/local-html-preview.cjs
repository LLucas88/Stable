const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path')
const {BuiltinTools}=require('../../desktop/services/builtin-tools.cjs')
const root=path.resolve(__dirname,'../../qa-artifacts/local-html-preview');fs.mkdirSync(root,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(root,'profile-')));app.disableHardwareAcceleration()
let win,tools
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}})
 const file=path.join(root,'test.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><h1>本地 HTML 验证</h1><button onclick="this.textContent=\'已点击\'">测试交互</button>')
 tools=new BuiltinTools({workspace:root,electron:require('electron'),conversationId:'fixture',browserSession:{execute:async(_id,args)=>{await win.loadURL(args.url);return {url:args.url}}}})
 await tools.execute({requestId:'test',name:'stable_browser',args:{action:'open',url:file},approved:true},'workspace-write')
 const result=await win.webContents.executeJavaScript("document.querySelector('button').click();document.body.innerText")
 if(!result.includes('已点击'))throw Error('Local interaction failed')
 fs.writeFileSync(path.join(root,'preview.png'),(await win.webContents.capturePage()).toPNG())
 console.log('LOCAL_HTML_PREVIEW_PASSED');tools.dispose();win.destroy();app.exit(0)
}).catch(e=>{console.error(e);tools?.dispose();win?.destroy();app.exit(1)})
