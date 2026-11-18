'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
test('image editor: real pixels, durable versions, mocked image API, trusted IPC and hidden UI', {timeout:120000,skip:process.platform!=='win32'}, async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    const child=spawn(require('electron'),[path.join(__dirname,'fixtures/image-editor.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    let output='';const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out '+output})},110000)
    child.stdout.on('data',c=>output=(output+c).slice(-14000));child.stderr.on('data',c=>output=(output+c).slice(-14000))
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/IMAGE_EDITOR_PASSED/)
})
