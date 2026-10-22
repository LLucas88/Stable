const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
test('hidden Electron verifies composer drafts, approval help and saved answer layout',{skip:process.platform!=='win32',timeout:90000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/composer-refresh-ui.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out: '+output})},85000)
    child.stdout.on('data',x=>output=(output+x).slice(-10000));child.stderr.on('data',x=>output=(output+x).slice(-10000))
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/COMPOSER_REFRESH_UI_PASSED/)
})
