'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
test('collapsed browser exposes rendered filter controls and preserves ref safety', {skip:process.platform!=='win32',timeout:45000},async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise(resolve=>{
  let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/browser-filter-refs.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out\n'+output})},40000)
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16000)})
  child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
 });assert.equal(result.code,0,result.output);assert.match(result.output,/FILTER_REFS_PASSED/)
})
