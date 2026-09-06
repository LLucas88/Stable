const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path')
test('rendered card supports choices, custom answer, 20s timeout, interaction cancellation, remount and retry', {skip:process.platform!=='win32',timeout:40000}, async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise(resolve=>{let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/clarification-card-ui.cjs')],{cwd:path.join(__dirname,'..'),windowsHide:true,env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();resolve({code:-1,output})},35000);child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('error',error=>{clearTimeout(timer);resolve({code:-1,output:error.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})})
 assert.equal(result.code,0,result.output);assert.match(result.output,/CLARIFICATION_CARD_UI_PASSED/)
})
