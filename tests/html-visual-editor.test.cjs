const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
async function runFixture(name,marker){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise(resolve=>{let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures',name)],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill();resolve({code:-1,output})},80000);for(const stream of [child.stdout,child.stderr])stream.on('data',value=>output=(output+value).slice(-15000));child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})})
 assert.equal(result.code,0,result.output);assert.ok(result.output.includes(marker),result.output)
}
test('hidden Electron editor saves text, images, crop pixels, history, AI context and conflicts',{timeout:90000},()=>runFixture('html-visual-editor.cjs','HTML_VISUAL_EDITOR_PASSED'))
test('actual main process saves via authenticated IPC and retains editor across native view detach',{timeout:90000},()=>runFixture('html-editor-app.cjs','HTML_EDITOR_APP_PASSED'))

test('rendered nested and generated text survives reload, rerender and subsequent edits',{timeout:90000},()=>runFixture('html-editor-compat.cjs','HTML_EDITOR_COMPAT_PASSED'))

test('blank region AI drafts retain coordinates, context, screenshot and ordinary multi-selection',{timeout:90000},()=>runFixture('html-editor-region.cjs','HTML_EDITOR_REGION_PASSED'))
