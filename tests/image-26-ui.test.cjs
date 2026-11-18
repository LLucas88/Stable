const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
test('Image 2.6 controlled toolbar: hover/click flyouts, keyboard, viewport flipping and parameter persistence',{timeout:90000,skip:process.platform!=='win32'},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    const child=spawn(require('electron'),[path.join(__dirname,'fixtures/image-26-ui.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output=''
    const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out '+output})},80000)
    child.stdout.on('data',v=>output=(output+v).slice(-16000));child.stderr.on('data',v=>output=(output+v).slice(-16000))
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  });assert.equal(result.code,0,result.output);assert.match(result.output,/IMAGE_26_UI_PASSED/)
})
