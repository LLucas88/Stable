'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
test('responsive viewport and compact snapshots preserve page control and full reads',{timeout:45000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/browser-viewport.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const timer=setTimeout(()=>child.kill(),40000)
    child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c)
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})})
    child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/VIEWPORT_PASSED/)
})
