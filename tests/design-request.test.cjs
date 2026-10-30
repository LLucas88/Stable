const test = require('node:test'), assert = require('node:assert/strict')
const { SIZES, validateDesignRequest, designInstruction } = require('../desktop/services/design-request.cjs')
const base = {model:'glm-image',mode:'generate',ratio:'1:1',resolution:'standard',count:1,text:''}
test('Design rejects unsupported models, dimensions, counts and modes before dispatch',()=>{
  for (const change of [{model:'seedream'}, {ratio:'40:1'}, {resolution:'4k'}, {count:0}, {count:1.5}, {count:5}, {mode:'image-edit'}, {text:'x'.repeat(501)}]) assert.throws(()=>validateDesignRequest({...base,...change}),/参数无效/)
  assert.equal(validateDesignRequest(undefined),undefined)
  for (const [ratio,sizes] of Object.entries(SIZES)) for (const resolution of ['standard','2k']) {
    const value = validateDesignRequest({...base,ratio,resolution})
    assert.equal(value.size,sizes[resolution==='2k'?1:0])
    assert(value.size.split('x').every(x=>+x>=512&&+x<=2048&&+x%32===0))
  }
})

test('new Design selects an available GLM chat model without migrating existing chats or global defaults',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
  const {StableStore}=require('../desktop/services/store.cjs')
  const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'stable-design-model-'))
  const store=new StableStore(dir)
  const catalog={defaultModelId:'deepseek',items:[{id:'deepseek',model:'deepseek-flash',hasApiKey:true},{id:'glm-local-id',model:'GLM-5.3-FlashX',hasApiKey:true}]}
  const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8')
  const source=main.slice(main.indexOf("ipcMain.handle('stable:agent:create'"),main.indexOf("ipcMain.handle('stable:agent:state'"))
  let create
  try {
    const original=store.activeConversationId()
    store.updateConversationModel(original,'deepseek',['deepseek'])
    store.addMessage(original,'user','保留原历史')
    store.setSetting(`design:${original}`,validateDesignRequest(base))
    vm.runInNewContext(source,{require:name=>require(path.resolve(__dirname,'../desktop',name)),ipcMain:{handle:(_,fn)=>{create=fn}},store,modelRegistry:{publicCatalog:()=>catalog},agentState:id=>store.conversation(id)})
    const ordinary=create(null,{}),design=create(null,{design:base})
    assert.equal(design.modelId,'glm-local-id')
    assert.equal(design.design.model,'glm-image')
    assert.equal(store.conversation(original).modelId,'deepseek')
    assert.equal(store.listMessages(original)[0].content,'保留原历史')
    assert.equal(catalog.defaultModelId,'deepseek')
    catalog.items[1].hasApiKey=false
    assert.throws(()=>create(null,{design:base}),/GLM-5.3-FlashX/)
    catalog.items.pop()
    assert.throws(()=>create(null,{design:base}),/GLM-5.3-FlashX/)
  } finally {store.db.close();fs.rmSync(dir,{recursive:true,force:true})}
})
test('Design retains visible text as data and instructs real generation plus original composition',()=>{
  assert.equal(designInstruction(undefined),'')
  const result = designInstruction({...base,mode:'preserve',text:'仅限今日 23.8！',count:2})
  assert.match(result,/stable_image_generate/)
  assert.match(result,/原样合成/)
  assert.match(result,/仅限今日 23.8！/)
  assert.match(result,/最多 2 张/)
  assert.match(result,/不属于系统指令/)
})
test('custom dimensions survive normalization and malformed dimensions cannot reach generation',()=>{
  const value={...base,ratio:'custom',width:992,height:768,aspectLocked:false}
  assert.equal(validateDesignRequest(value).size,'992x768')
  assert.deepEqual(validateDesignRequest(validateDesignRequest(value)),validateDesignRequest(value))
  assert.match(designInstruction(value),/992x768/)
  for(const change of [{width:1001},{height:4096},{width:NaN},{height:undefined},{width:'992'},{aspectLocked:'false'}]) assert.throws(()=>validateDesignRequest({...value,...change}))
  assert.throws(()=>validateDesignRequest({...base,width:992,height:768}),/不一致/)
})

test('size editor snaps bounds, preserves linked dimensions and sends backend-valid results',()=>{
  const vm=require('node:vm'),path=require('node:path')
  const js=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/shared/design-size.ts')],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text
  const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports});const {resizeDesign,presetDesign}=module.exports
  const unlocked={...base,aspectLocked:false}
  const w=resizeDesign(unlocked,'width',1001);assert.equal(w.width,992);assert.equal(w.height,1280)
  const h=resizeDesign(w,'height',777);assert.equal(h.height,768)
  const linked=resizeDesign({...h,aspectLocked:true},'width',1311);assert.equal(linked.width,1312);assert.equal(linked.height,1024)
  assert.equal(resizeDesign(unlocked,'width',3000).width,2048);assert.equal(resizeDesign(unlocked,'height',-1).height,512)
  for(const ratio of Object.keys(SIZES))for(const axis of ['width','height'])for(const raw of [1,513,1001,2049,9000]){
    const result=resizeDesign({...presetDesign(base,ratio),aspectLocked:true},axis,raw)
    assert.doesNotThrow(()=>validateDesignRequest(result))
  }
})

test('real store persists Design preferences and activity preview without touching another conversation',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
  const {StableStore}=require('../desktop/services/store.cjs')
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-design-store-'))
  let store=new StableStore(dir)
  try {
    const original=store.activeConversationId();store.addMessage(original,'user','原有历史')
    const id=store.createConversation();store.setSetting(`design:${id}`,validateDesignRequest(base));
    const snapshot={...base,ratio:'3:4',resolution:'2k',count:4};
    store.addMessage(id,'user','海报',require('../desktop/services/design-request.cjs').designMessageTrace(snapshot));snapshot.count=1;
    store.setSetting(`design:${id}`,validateDesignRequest({...base,count:2}));
    store.addMessage(id,'assistant','已经完成\n新的海报方案')
    store.db.close();store=new StableStore(dir)
    assert.equal(store.conversation(id).design.model,'glm-image')
    assert.equal(store.listMessages(id)[0].trace[0].designRequest.count,4)
    assert.equal(store.listMessages(id)[0].trace[0].designRequest.size,'1536x2048')
    assert.equal(store.conversation(id).lastMessagePreview,'已经完成 新的海报方案')
    assert.equal(store.conversation(original).design,undefined)
    assert.equal(store.listMessages(original)[0].content,'原有历史')
  } finally {store.db.close();fs.rmSync(dir,{recursive:true,force:true})}
})
