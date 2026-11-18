'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {HtmlVisualEditors}=require('../desktop/services/html-visual-editor.cjs')
const {HtmlDocument,compile}=require('../desktop/services/html-source-patch.cjs')
const {prepareEditorQuit}=require('../desktop/services/editor-quit.cjs')
function fixture(t,{dirty=false,dead=false,changed=false,missingRuntime=false,conflict=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-editor-quit-')),file=path.join(root,'report.html')
  fs.writeFileSync(file,'<!doctype html><h1>原始报告</h1>')
  fs.mkdirSync(path.join(root,'.stable','html-editor'),{recursive:true})
  const document=new HtmlDocument(file,[root]),changes=dirty?[{id:document.nodes.find(n=>n.tag==='h1').id,text:'保留我的编辑'}]:[]
  const s={id:'fixture',conversationId:'c',workspace:root,roots:[root],document,changes,revision:dirty?1:0,savedRevision:0,busy:false,url:'file:///report.html',chain:Promise.resolve(),images:{},error:'',recovery:path.join(root,'.stable','html-editor','fixture.json'),
    contents:{isDestroyed:()=>dead,getURL:()=>changed?'about:blank':'file:///report.html',executeJavaScriptInIsolatedWorld:async(_world,[{code}])=>code.includes('?.status')?true:missingRuntime?undefined:{revision:dirty?1:0,changes,busy:false,events:[]}}}
  if(conflict)fs.appendFileSync(file,'<!-- external -->')
  const original=fs.readFileSync(file,'utf8'),editors=new HtmlVisualEditors({});editors.sessions.set(s.id,s)
  t.after(()=>{clearInterval(s.timer);fs.rmSync(root,{recursive:true,force:true})})
  return {root,file,s,editors,original}
}
test('already-saved stale editors do not block quitting or invent a recovery file',async t=>{
  for(const variant of [{dead:true},{changed:true},{missingRuntime:true}]){
    const x=fixture(t,variant)
    await assert.rejects(x.editors.flush(x.s),{code:'EDITOR_PAGE_UNAVAILABLE'})
    assert.equal(await prepareEditorQuit({editors:x.editors,dialog:{showMessageBox:()=>assert.fail('clean stale editor prompted')}}),true)
    assert.equal(fs.readFileSync(x.file,'utf8'),x.original)
    assert(!fs.existsSync(x.s.recovery))
  }
})
test('dirty unavailable editors can quit only after user choice and a verified snapshot; no original is overwritten',async t=>{
  for(const variant of [{dead:true},{changed:true},{missingRuntime:true}]){
    const x=fixture(t,{dirty:true,...variant});let prompts=0
    assert.equal(await prepareEditorQuit({editors:x.editors,dialog:{showMessageBox:async()=>{prompts++;return {response:0}}}}),false)
    assert.equal(await prepareEditorQuit({editors:x.editors,dialog:{showMessageBox:async()=>{prompts++;return {response:1}}}}),true)
    const draft=JSON.parse(fs.readFileSync(x.s.recovery,'utf8'))
    assert.match(compile(draft.base,x.s.document.nodes,draft.changes),/保留我的编辑/)
    assert.equal(fs.readFileSync(x.file,'utf8'),x.original);assert.equal(prompts,2)
  }
})
test('live source conflicts preserve both versions, while normal pending edits still save before quit',async t=>{
  const conflict=fixture(t,{dirty:true,conflict:true})
  assert.equal(await prepareEditorQuit({editors:conflict.editors,dialog:{showMessageBox:async()=>({response:1})}}),true)
  assert.equal(fs.readFileSync(conflict.file,'utf8'),conflict.original)
  assert.match(fs.readFileSync(conflict.s.recovery,'utf8'),/保留我的编辑/)
  const normal=fixture(t,{dirty:true})
  assert.equal(await prepareEditorQuit({editors:normal.editors,dialog:{showMessageBox:()=>assert.fail('normal save prompted')}}),true)
  assert.match(fs.readFileSync(normal.file,'utf8'),/保留我的编辑/);assert(!fs.existsSync(normal.s.recovery))
})
test('failed snapshot writes and uncaptured collection errors never permit quit',async t=>{
  const x=fixture(t,{dirty:true,changed:true});fs.mkdirSync(x.s.recovery)
  let prompts=0
  assert.equal(await prepareEditorQuit({editors:x.editors,dialog:{showMessageBox:async()=>{prompts++;return {response:1}}}}),false)
  assert.equal(prompts,2);assert.equal(fs.readFileSync(x.file,'utf8'),x.original)
  const invalid=fixture(t,{dirty:true});invalid.s.contents.executeJavaScriptInIsolatedWorld=async()=>{throw Error('renderer unavailable before collection')}
  assert.equal(await prepareEditorQuit({editors:invalid.editors,dialog:{showMessageBox:async()=>({response:1})}}),false)
  assert(!fs.existsSync(invalid.s.recovery));assert.equal(fs.readFileSync(invalid.file,'utf8'),invalid.original)
})
