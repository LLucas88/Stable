const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path')
test('imported skill categories, counts, and Feishu activation restrictions render in the real market', {skip:process.platform!=='win32',timeout:30000},async()=>{
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const result=await new Promise(resolve=>{let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/ops-skill-market-ui.cjs')],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();resolve({code:-1,output})},25000);child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})})
assert.equal(result.code,0,result.output);assert.match(result.output,/OPS_SKILL_UI_PASSED/)
})
