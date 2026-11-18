'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),path=require('node:path')
test('hidden template gallery previews and selects bundled Frontend Slides styles',{timeout:90000},async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await promisify(execFile)(require('electron'),[path.join(__dirname,'fixtures/template-library-ui.cjs')],{env,windowsHide:true,timeout:80000})
 assert.match(result.stdout,/TEMPLATE_UI_PASS/)
})
