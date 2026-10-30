const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path')
test('Design shows image deliveries without changing normal chat or spreadsheets',async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(require('electron'),[path.join(__dirname,'fixtures/design-delivery-ui.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output=''
  const timer=setTimeout(()=>{child.kill();reject(Error('Skill picker test timeout'))},20000)
  child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v)
  child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
 })
 assert.equal(result.code,0,result.output);assert.match(result.output,/DESIGN_DELIVERY_UI_PASSED/)
})
