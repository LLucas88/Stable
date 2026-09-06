'use strict'
const {app,BrowserWindow,nativeTheme}=require('electron'),fs=require('node:fs'),path=require('node:path')
const {createWindowAppearance}=require('../../desktop/services/window-appearance.cjs')
const out=path.resolve(__dirname,'../../qa-artifacts/codex-design');fs.mkdirSync(out,{recursive:true})
app.setPath('userData',fs.mkdtempSync(path.join(out,'native-profile-')))
let win
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,titleBarStyle:'hidden',titleBarOverlay:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
 await win.loadURL('data:text/html,<body style="background:transparent">Native backdrop probe</body>')
 await new Promise(resolve=>setTimeout(resolve,800))
 const controller=createWindowAppearance({app,nativeTheme})
 const result={platform:process.platform,os:require('node:os').release(),gpu:app.getGPUFeatureStatus().gpu_compositing,light:controller.apply(win,'light'),dark:controller.apply(win,'dark'),visible:win.isVisible()}
 fs.writeFileSync(path.join(out,'native-material.json'),JSON.stringify(result,null,2))
 console.log(JSON.stringify(result));win.destroy();app.exit(0)
}).catch(error=>{console.error(error.stack);win?.destroy();app.exit(1)})
