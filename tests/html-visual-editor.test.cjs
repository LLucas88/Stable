const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process')
async function runFixture(name,marker,{args=[],onMessage}={}){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const result=await new Promise(resolve=>{
  let output=''
  const child=spawn(require('electron'),[path.join(__dirname,'fixtures',name),...args],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe',...(onMessage?['ipc']:[])]})
  const timer=setTimeout(()=>{child.kill();resolve({code:-1,output})},80000)
  for(const stream of [child.stdout,child.stderr])stream.on('data',value=>output=(output+value).slice(-15000))
  if(onMessage)child.on('message',message=>onMessage(child,message))
  child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})})
  child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
 })
 assert.equal(result.code,0,result.output);assert.ok(result.output.includes(marker),result.output)
}
test('hidden Electron editor saves text, images, crop pixels, history, AI context and conflicts',{timeout:90000},()=>runFixture('html-visual-editor.cjs','HTML_VISUAL_EDITOR_PASSED'))
test('actual main process saves via authenticated IPC and retains editor across native view detach',{timeout:90000},()=>runFixture('html-editor-app.cjs','HTML_EDITOR_APP_PASSED'))

for(const conflict of [false,true])test(conflict?'actual development restart can cancel a conflict and retry without overwriting it':'actual development restart saves active HTML text before exiting',{timeout:90000},async t=>{
 const fs=require('node:fs'),os=require('node:os')
 const temp=fs.realpathSync(os.tmpdir())
 const root=fs.mkdtempSync(path.join(temp,'stable-html-editor-restart-'))
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(temp));fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})})
 const revision=7
 let confirmations=0,waiting=0
 await runFixture('html-editor-restart.cjs','HTML_EDITOR_RESTART_QUIT_CHECKED',{
  args:[root,...(conflict?['conflict']:[])],
  onMessage:(child,message)=>{
   if(message.type==='stable:dev:ready')child.send({type:'stable:dev:change',id:revision,action:'restart'})
   if(message.type==='stable:dev:restart-request'&&message.id===revision){
    confirmations++
    child.send({type:'stable:dev:restart-confirmed',id:revision})
   }
   if(message.type==='stable:dev:waiting'&&message.id===revision)waiting++
  },
 })
 assert.equal(confirmations,conflict?2:1)
 assert.equal(waiting,conflict?1:0)
 const html=fs.readFileSync(path.join(root,'profile','workspace','restart-preview.html'),'utf8')
 if(conflict){
  assert.match(html,/<!-- external edit -->$/)
  assert.doesNotMatch(html,/HTML_PENDING_TEXT_RESTART/)
 }else assert.match(html,/HTML_PENDING_TEXT_RESTART/)
})

test('rendered nested and generated text survives reload, rerender and subsequent edits',{timeout:90000},()=>runFixture('html-editor-compat.cjs','HTML_EDITOR_COMPAT_PASSED'))

test('blank region AI drafts retain coordinates, context, screenshot and ordinary multi-selection',{timeout:90000},()=>runFixture('html-editor-region.cjs','HTML_EDITOR_REGION_PASSED'))
