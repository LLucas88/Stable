const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path')
test('compact conversation tools preserve menu, chapter and slider interactions',{skip:process.platform!=='win32',timeout:40000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/compact-conversation-controls-ui.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const timer=setTimeout(()=>{child.kill();resolve({code:-1,output})},35000)
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d)
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/CONVERSATION_TOOLS_UI_PASSED/)
})
