const test = require('node:test'), assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
test('hidden full App verifies activity, Design references, parameters, queue isolation and workspace navigation', {skip:process.platform!=='win32',timeout:120000}, async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    const child=spawn(require('electron'),[path.join(__dirname,'fixtures/design-activity-ui.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    let output='';const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out '+output})},110000)
    child.stdout.on('data',chunk=>{output=(output+chunk).slice(-9000)});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-9000)})
    child.on('error',error=>{clearTimeout(timer);resolve({code:-1,output:error.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/DESIGN_ACTIVITY_UI_PASSED/)
})
