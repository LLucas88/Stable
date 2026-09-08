'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path')
test('effort slider renders official levels, resets and expands model selection',{timeout:40000},async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise(resolve=>{
  const child=spawn(require('electron'),[path.join(__dirname,'fixtures/effort-alerts-ui.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let output=''
  const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out\n'+output})},35000)
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-12000)})
  child.on('error',error=>{clearTimeout(timer);resolve({code:-1,output:error.message})})
  child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
 })
 assert.equal(result.code,0,result.output);assert.match(result.output,/EFFORT_SLIDER_PASSED/)
})
