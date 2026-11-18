const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname,'../..'), output = path.join(root,'qa-artifacts/sdk-task')
fs.mkdirSync(output,{recursive:true}); app.setPath('userData',fs.mkdtempSync(path.join(output,'profile-'))); app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
  win = new BrowserWindow({show:false,width:900,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}})
  const bundle = (await build({stdin:{contents:`
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {SdkTask} from './src/SdkTask';
    window.calls=[];window.fail=false;window.stable={agent:{taskAction:async(...args)=>{window.calls.push(args);if(window.fail)throw Error('任务已结束');return true}}};
    function Test(){const [item,setItem]=useState({id:'sdk-task:a',runId:'r',conversationId:'c',taskId:'a',taskType:'local_agent',taskToolUseId:'tool',title:'分析数据',status:'running',taskBackground:false,taskUsage:{duration_ms:12000,tool_uses:3,total_tokens:100},detail:'已读取数据'});window.update=patch=>setItem(old=>({...old,...patch}));return <SdkTask item={item} status="running"/>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
  const html=path.join(output,'index.html'); fs.writeFileSync(html,'<html lang="zh"><meta charset="utf-8"><div id="root"></div><script>'+bundle.replace(/<\/script/gi,'<\\/script')+'</script></html>')
  await win.loadFile(html)
  const run=code=>win.webContents.executeJavaScript(code), settle=()=>new Promise(r=>setTimeout(r,80))
  await settle(); assert.match(await run('document.body.innerText'),/已运行 12 秒 · 3 次工具调用/)
  await run('document.querySelector("button").click()'); await settle()
  assert.deepEqual(await run('window.calls[0]'),['c','r','a','background'])
  await run('window.update({taskBackground:true})'); await settle()
  assert.equal(await run('document.querySelectorAll("button").length'),1)
  await run('document.querySelector("button").click()'); await settle()
  assert.deepEqual(await run('window.calls[1]'),['c','r','a','stop'])
  await run('window.fail=true;document.querySelector("button").click()'); await settle()
  assert.match(await run('document.querySelector("[role=alert]").textContent'),/任务已结束/)
  await run('window.update({status:"cancelled",detail:"用户停止了此任务；其他任务继续"})'); await settle()
  assert.equal(await run('document.querySelectorAll("button").length'),0)
  assert.match(await run('document.body.innerText'),/已停止/)
  await run('window.update({status:"completed",detail:"结果已保存：output.txt"})'); await settle()
  assert.match(await run('document.body.innerText'),/已完成/)
  console.log('SDK_TASK_UI_PASSED'); win.destroy(); app.quit()
}
main().catch(error=>{console.error(error);app.exit(1)})
