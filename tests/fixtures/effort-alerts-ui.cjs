'use strict'
const {app,BrowserWindow}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict')
app.setPath('userData',path.join(__dirname,'../../qa-artifacts/effort-alerts-profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async()=>{
const win=new BrowserWindow({show:false,width:900,height:600,webPreferences:{sandbox:true}})
await win.loadURL('data:text/html,<div id="root"></div>')
await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../../src/styles/app.css'),'utf8'))
const js=require('esbuild').buildSync({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{EffortSlider}from'./src/EffortSlider';window.changes=[];window.expand=0;createRoot(document.getElementById('root')).render(<div style={{width:360}}><EffortSlider options={[{id:'auto',label:'默认'},{id:'low',label:'低'},{id:'high',label:'高'},{id:'max',label:'最高'}]} value="high" model="GLM-5.3-Flash" onChange={v=>window.changes.push(v)} onModels={()=>window.expand++}/></div>)`,loader:'tsx',resolveDir:path.join(__dirname,'../..')},bundle:true,write:false,platform:'browser',format:'iife'}).outputFiles[0].text
await win.webContents.executeJavaScript(js)
await new Promise(r=>setTimeout(r,200))
const result=await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('input[type=range]');const result={value:input.value,max:input.max,width:input.getBoundingClientRect().width,label:input.getAttribute('aria-valuetext')};document.querySelector('[aria-label="展开模型选择"]').click();document.querySelector('[aria-label="恢复默认思考强度"]').click();return {...result,changes:window.changes,expanded:window.expand}})()`)
assert.equal(result.value,'2');assert.equal(result.max,'3');assert(result.width>100);assert.equal(result.label,'高');assert.deepEqual(result.changes,['auto']);assert.equal(result.expanded,1)
console.log('EFFORT_SLIDER_PASSED');win.destroy();app.quit()
}).catch(e=>{console.error(e);app.exit(1)})
