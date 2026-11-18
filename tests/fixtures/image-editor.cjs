'use strict'
const {app,BrowserWindow,ipcMain,nativeImage,session}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{build,transformSync}=require('esbuild')
const {StableStore}=require('../../desktop/services/store.cjs')
const {ImageEditor,registerImageEditorIpc,blankDraft,validateDraft,editParameters}=require('../../desktop/services/image-editor.cjs')
const root=path.resolve(__dirname,'../..'),artifacts=path.join(root,'qa-artifacts/image-editor')
fs.mkdirSync(artifacts,{recursive:true})
const profile=fs.mkdtempSync(path.join(artifacts,'profile-'));app.setPath('userData',profile)
app.on('window-all-closed',()=>{})
let win,store
const digest=b=>createHash('sha256').update(b).digest('hex')
function png(width,height,transparent=false) {
  const b=Buffer.alloc(width*height*4)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;b[i]=x>width/2?220:40;b[i+1]=120;b[i+2]=x>width/2?40:220;b[i+3]=transparent&&x<width/8?0:255}
  return nativeImage.createFromBitmap(b,{width,height,scaleFactor:1}).toPNG()
}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function main() {
  await app.whenReady()
  // No external HTTP is permitted in this fixture. The provider is a local stub.
  session.defaultSession.webRequest.onBeforeRequest((details,cb)=>cb({cancel:/^https?:/.test(details.url)}))
  const workspace=path.join(profile,'workspace');fs.mkdirSync(workspace)
  store=new StableStore(path.join(profile,'db'));const id=store.createConversation(),other=store.createConversation()
  const source=path.join(workspace,'poster.png'),bytes=png(200,100);fs.writeFileSync(source,bytes)
  const calls=[],controls=new Map();let responseMode='success',entered
  const deps={store,nativeImage,userData:profile,controls,getPaths:()=>({workspace,readableRoots:[workspace]}),roots:(_id,_file,roots)=>roots,publishState(){},resolveImageRoute:()=>({apiKey:'test-only',scope:'fixture',replay:true,endpoint:'https://mock.invalid/generations',editEndpoint:'https://mock.invalid/edits',fetch:async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url,body,key:init.headers['Idempotency-Key']});entered?.()
    if(responseMode==='wait')await new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))
    const [w,h]=responseMode==='wrong-ratio'?[1024,1024]:body.size.split('x').map(Number)
    const pixels=responseMode==='solid'?nativeImage.createFromBitmap(Buffer.alloc(w*h*4,255),{width:w,height:h,scaleFactor:1}):nativeImage.createFromBuffer(png(w,h,responseMode!=='opaque'&&body.background==='transparent'))
    const encoded=await require('../../desktop/services/image-artifacts.cjs').encodeRaster(pixels,body.output_format||'png')
    return Response.json({data:[{b64_json:encoded.toString('base64')}],output_format:body.output_format||'png'})
  }})}
  const editor=new ImageEditor(deps)
  let initial=await editor.open(id,source)
  assert.equal(initial.versionId,'original');assert.equal(calls.length,0)
  const outside=path.join(profile,'outside.png');fs.writeFileSync(outside,bytes)
  await assert.rejects(()=>editor.open(id,outside),/工作区/)
  const draft={...initial.draft,strokes:[{color:'#ff0000',width:.01,points:[{x:.1,y:.2},{x:.8,y:.2}]}],comments:[{x:.4,y:.5,text:'换成白色'}]}
  editor.save(initial.id,'original',draft)
  assert.deepEqual((await new ImageEditor(deps).open(id,source)).draft.comments,draft.comments)
  assert.equal((await editor.open(other,source)).draft.comments.length,0);assert.equal(calls.length,0)
  const local=async resize=>editor.submit(initial.id,'original',{...blankDraft(),resize})
  const scaled=await local({mode:'scale',width:100,height:50,x:.5,y:.5,background:'transparent'})
  assert.deepEqual(nativeImage.createFromPath(scaled.versions.at(-1).path).getSize(),{width:100,height:50})
  assert.equal(calls.length,0)
  const cropped=await local({mode:'crop',width:20,height:20,x:1,y:1,background:'transparent'})
  const croppedPixels=nativeImage.createFromPath(cropped.versions.at(-1).path).toBitmap()
  assert.equal(croppedPixels[0],220);assert.equal(croppedPixels[2],40)
  const padded=await local({mode:'pad',width:240,height:140,x:.5,y:.5,background:'transparent'})
  const padImage=nativeImage.createFromPath(padded.versions.at(-1).path),padPixels=padImage.toBitmap()
  assert.equal(padPixels[3],0);assert.equal(padPixels[((20*240)+20)*4+3],255)
  assert.equal(digest(fs.readFileSync(source)),digest(bytes));assert.equal(calls.length,0)
  await editor.accept(padded.id,padded.versionId);await editor.accept(padded.id,padded.versionId)
  assert.equal(store.listMessages(id).length,1)
  assert.equal((await editor.open(id,padded.versions.at(-1).path)).id,initial.id)
  assert.equal((await editor.select(initial.id,'original')).draft.resize.mode,'pad')
  assert.equal((await editor.select(initial.id,padded.versionId)).draft.comments.length,0)
  assert.throws(()=>validateDraft({...blankDraft(),resize:{mode:'crop',width:201,height:50,x:.5,y:.5,background:'white'}},{width:200,height:100}),/裁剪/)
  assert.throws(()=>validateDraft({...blankDraft(),resize:{mode:'pad',width:100,height:50,x:.5,y:.5,background:'white'}},{width:200,height:100}),/补边/)
  assert.throws(()=>validateDraft({...blankDraft(),resize:{mode:'scale',width:100,height:100,x:.5,y:.5,background:'white'}},{width:200,height:100}),/比例/)
  const guide='data:image/png;base64,'+png(200,100,true).toString('base64')
  const remote={...draft,requestId:randomUUID(),prompt:'保持排版，只更换指定颜色',removeBackground:true}
  const edited=await editor.submit(initial.id,'original',remote,guide)
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://mock.invalid/edits');assert.equal(calls[0].body.references.length,1)
  assert.equal(calls[0].body.markup.data,guide.split(',')[1]);assert.equal(calls[0].body.mask,undefined)
  assert.equal(calls[0].body.background,'transparent');assert.match(calls[0].body.prompt,/1 \(80,50\): 换成白色/)
  assert.equal(calls[0].body.references[0].id,digest(nativeImage.createFromBuffer(bytes).toPNG()))
  assert.equal(edited.versions.at(-1).width,200);assert.equal(edited.versions.at(-1).height,100)
  const again=await new ImageEditor(deps).submit(initial.id,'original',remote,guide)
  assert.equal(again.versionId,edited.versionId);assert.equal(calls.length,1)
  await assert.rejects(()=>editor.submit(initial.id,'original',remote,'data:image/png;base64,'+bytes.toString('base64')),/编号/)
  await assert.rejects(()=>editor.submit(initial.id,'original',{...blankDraft(),prompt:'尺寸 2048×4436'}),/尺寸/);assert.equal(calls.length,1)
  const params=editParameters({...blankDraft(),prompt:'尺寸 1024×1536，背景不透明',removeBackground:true},{width:200,height:100})
  assert.equal(params.size,'1024x1536');assert.equal(params.background,'opaque');assert.doesNotMatch(params.prompt,/输出真实透明背景/)
  const explicit=await editor.submit(initial.id,'original',{...blankDraft(),prompt:'尺寸 1024×1536，按原图风格重排'})
  assert.deepEqual(nativeImage.createFromPath(explicit.versions.at(-1).path).getSize(),{width:1024,height:1536})
  responseMode='opaque'
  const noAlpha={...blankDraft(),removeBackground:true}
  await assert.rejects(()=>editor.submit(initial.id,'original',noAlpha),/透明像素/)
  const callCount=calls.length
  await assert.rejects(()=>editor.submit(initial.id,'original',noAlpha),/透明像素/);assert.equal(calls.length,callCount)
  responseMode='wait'
  const cancelled={...blankDraft(),prompt:'修改杯子颜色'}
  const started=new Promise(resolve=>entered=resolve),pending=editor.submit(initial.id,'original',cancelled)
  await started;editor.cancel(initial.id);await assert.rejects(()=>pending,/中断|aborted/);assert.equal(controls.size,0)
  const cancelledKey=calls.at(-1).key
  assert.equal((await editor.select(initial.id,'original')).draft.requestId,cancelled.requestId)
  responseMode='success';entered=undefined
  await new ImageEditor(deps).submit(initial.id,'original',cancelled)
  assert.equal(calls.at(-1).key,cancelledKey)
  responseMode='wrong-ratio'
  const wrongRatio={...blankDraft(),prompt:'尺寸 1024×1536，保持品牌风格'}
  await assert.rejects(()=>editor.submit(initial.id,'original',wrongRatio),/比例与请求不一致/)
  const wrongCount=calls.length
  await assert.rejects(()=>new ImageEditor(deps).submit(initial.id,'original',wrongRatio),/比例与请求不一致/)
  assert.equal(calls.length,wrongCount)
  responseMode='success'
  const incomplete={...blankDraft(),resize:{mode:'scale',width:0,height:1,x:.5,y:.5,background:'transparent'}}
  editor.save(initial.id,'original',incomplete)
  assert.equal((await editor.select(initial.id,'original')).draft.resize.width,0)
  await assert.rejects(()=>editor.submit(initial.id,'original',incomplete),/目标尺寸/)
  responseMode='solid'
  const regionDraft={...blankDraft(),prompt:'选区改成白色',region:{x:.25,y:.25,width:.5,height:.5},keepOutside:true,complexity:'low'}
  const regionResult=await editor.submit(initial.id,'original',regionDraft)
  const originalPixels=nativeImage.createFromBuffer(bytes).toBitmap(),regionPixels=nativeImage.createFromPath(regionResult.versions.at(-1).path).toBitmap()
  for(let y=0;y<100;y++)for(let x=0;x<200;x++)if(x<50||x>=150||y<25||y>=75)assert(originalPixels.subarray((y*200+x)*4,(y*200+x+1)*4).equals(regionPixels.subarray((y*200+x)*4,(y*200+x+1)*4)),'Outside region changed')
  assert.equal(regionPixels[(50*200+100)*4],255);assert(calls.at(-1).body.mask);assert.equal(calls.at(-1).body.markup,undefined);assert.equal(calls.at(-1).body.complexity,'low')
  await assert.rejects(()=>editor.submit(initial.id,'original',{...regionDraft,requestId:randomUUID(),outputFormat:'jpeg'}),/无损 PNG/)
  responseMode='success'
  for(const outputFormat of ['jpeg','webp']){const v=await editor.submit(initial.id,'original',{...blankDraft(),prompt:'调整颜色',outputFormat});const file=v.versions.at(-1).path,b=fs.readFileSync(file);assert(file.endsWith(outputFormat==='jpeg'?'.jpg':'.webp'));assert.equal((await require('../../desktop/services/image-artifacts.cjs').inspectArtifactAsync(b,outputFormat,nativeImage)).width,200);assert(v.previewUrl.startsWith('data:image/'+outputFormat+';base64,'))}
  const beforeUi=calls.length
  const geometry={exports:{}}
  new Function('module','exports',transformSync(fs.readFileSync(path.join(root,'src/shared/image-edit-geometry.ts'),'utf8'),{loader:'ts',format:'cjs'}).code)(geometry,geometry.exports)
  const {imagePoint,strokeHit}=geometry.exports
  assert.deepEqual(imagePoint(150,120,{left:100,top:70,width:200,height:100}),{x:.25,y:.5})
  assert.deepEqual(imagePoint(200,170,{left:100,top:70,width:400,height:200}),{x:.25,y:.5})
  assert(strokeHit(draft.strokes[0],{x:.4,y:.2},200,100,2));assert(!strokeHit(draft.strokes[0],{x:.4,y:.7},200,100,2))
  const handlers={};registerImageEditorIpc({handle:(name,fn)=>handlers[name]=fn},editor,()=>false)
  assert.throws(()=>handlers['stable:imageEditor:open']({},[id,source]),/无权/)
  console.log('IMAGE_EDITOR_SERVICE_PASSED')

  // Exercise the actual renderer and preload against the same real local service.
  const uiId=store.createConversation(),uiSource=path.join(workspace,'ui-poster.png');fs.writeFileSync(uiSource,png(1000,700))
  win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false,preload:path.join(root,'desktop/preload.cjs')}})
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error(message)})
  const trusted=e=>e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame
  registerImageEditorIpc(ipcMain,editor,trusted)
  ipcMain.handle('stable:agent:imagePreview',(_e,p)=>'data:image/png;base64,'+fs.readFileSync(p.path).toString('base64'))
  ipcMain.handle('stable:agent:saveImageAs',()=>({canceled:true}))
  const bundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ImageEditor} from './src/ImageEditor';const root=createRoot(document.getElementById('root'));window.mount=()=>root.render(<ImageEditor conversationId=${JSON.stringify(uiId)} path=${JSON.stringify(uiSource)} onClose={()=>{window.editorClosed=true;root.render(null)}}/>);window.mount();`,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
  const html=path.join(profile,'editor.html');fs.writeFileSync(html,'<html lang="zh-CN"><body style="margin:0"><div id="root"></div></body></html>')
  await win.loadFile(html)
  await require('../helpers/visual-fixture.cjs')(win)
  await win.webContents.insertCSS(':root{--z-toast:1000}*{box-sizing:border-box}body{font-family:Arial,sans-serif}'+fs.readFileSync(path.join(root,'src/styles/image-editor.css'),'utf8')+fs.readFileSync(path.join(root,'src/styles/image-parameters.css'),'utf8'))
  const run=code=>win.webContents.executeJavaScript(`(async()=>{try{return await(async()=>{${code}})()}catch(e){console.error(e.stack);throw e}})()`,true)
  await run(bundle);await delay(500)
  await run(`window.expect=(v,m)=>{if(!v)throw Error(m)};window.click=t=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t||e.getAttribute('aria-label')===t);expect(e,'Missing button '+t);e.click()};window.tick=()=>new Promise(r=>setTimeout(r,100));window.input=(selector,value)=>{const e=document.querySelector(selector);expect(e,'Missing '+selector);Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};expect(document.querySelectorAll('[role=toolbar] button').length===7,'Toolbar entries: '+document.querySelectorAll('[role=toolbar] button').length);click('标注')`)
  const mouse=async(x,y,type='mouseDown')=>{win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),button:'left',modifiers:type==='mouseMove'?['leftButtonDown']:[],clickCount:1});await delay(30)}
  let rect=await run(`return (()=>{const r=document.querySelector('.image-edit-overlay').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`)
  await mouse(rect.x+rect.w*.2,rect.y+rect.h*.25);await mouse(rect.x+rect.w*.65,rect.y+rect.h*.25,'mouseMove');await mouse(rect.x+rect.w*.65,rect.y+rect.h*.25,'mouseUp');await delay(400)
  assert.equal((await editor.open(uiId,uiSource)).draft.strokes.length,1)
  await run(`click('缩小视图');click('添加评论')`);await delay(100)
  rect=await run(`return (()=>{const r=document.querySelector('.image-edit-overlay').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`)
  await mouse(rect.x+rect.w*.5,rect.y+rect.h*.5);await mouse(rect.x+rect.w*.5,rect.y+rect.h*.5,'mouseUp')
  await run(`input('[aria-label="评论 1"]','这里换成白色');await tick();click('移除背景');await tick()`);await delay(400)
  let ui=await editor.open(uiId,uiSource);assert(Math.abs(ui.draft.comments[0].x-.5)<.01);assert(Math.abs(ui.draft.comments[0].y-.5)<.01)
  assert.equal(calls.length,beforeUi)
  await run(`click('擦除');await tick()`)
  await mouse(rect.x+rect.w*.4,rect.y+rect.h*.25);await mouse(rect.x+rect.w*.4,rect.y+rect.h*.25,'mouseUp');await delay(400)
  ui=await editor.open(uiId,uiSource);assert.equal(ui.draft.strokes.length,0);assert.equal(ui.draft.comments.length,1)
  await run(`click('撤销');await tick();expect(document.querySelector('.image-edit-overlay polyline'),'Undo eraser');click('重做');await tick();expect(!document.querySelector('.image-edit-overlay polyline'),'Redo eraser');const handle=document.querySelector('[aria-label="移动工具栏"]');for(let i=0;i<200;i++)handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await tick();const toolbar=document.querySelector('[role=toolbar]').getBoundingClientRect();expect(toolbar.left>=0,'Toolbar escaped screen')`)
  await run(`click('关闭图片编辑');await tick();expect(window.editorClosed,'Close did not complete');window.mount();await tick();expect(document.querySelector('[aria-label="评论 1"]').value==='这里换成白色','Draft restore')`)
  await run(`click('删除评论 1');await tick();click('移除背景');await tick();click('调整大小');await tick();input('[aria-label="尺寸处理方式"]','scale');await tick();input('[aria-label="目标宽度"]','500');await tick();expect(document.querySelector('[aria-label="目标高度"]').value==='350','Aspect lock');click('提交修改');await tick();await tick();expect(document.querySelector('[aria-label="图片版本"]').value!=='original','No new version');click('保存到对话');await tick();click('对比原图');await tick();expect(document.querySelector('img').alt==='原图对比','Compare');click('查看编辑结果');await tick()`)
  assert.equal(store.listMessages(uiId).length,1);assert.equal(calls.length,beforeUi)
  fs.writeFileSync(path.join(artifacts,'editor-version.png'),(await win.webContents.capturePage()).toPNG())
  await run(`input('[aria-label="图片版本"]','original');await tick();click('添加评论')`)
  rect=await run(`return (()=>{const r=document.querySelector('.image-edit-overlay').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`)
  await mouse(rect.x+rect.w*.3,rect.y+rect.h*.3);await mouse(rect.x+rect.w*.3,rect.y+rect.h*.3,'mouseUp')
  await run(`input('[aria-label="评论 1"]','让这部分更明亮');await tick();click('移除背景');await tick()`)
  fs.writeFileSync(path.join(artifacts,'editor-draft.png'),(await win.webContents.capturePage()).toPNG())
  await run(`click('提交修改');await tick();await tick()`);await delay(300)
  assert.equal(calls.length,beforeUi+1);assert.equal(calls.at(-1).body.references.length,1)
  await run(`expect(!document.querySelector('[role=alert]'),'UI submit failed');expect(document.querySelector('[aria-label="图片版本"]').value!=='original','Remote version not shown')`)
  win.destroy();store.close();console.log('IMAGE_EDITOR_PASSED');app.exit(0)
}
main().catch(error=>{console.error('IMAGE_EDITOR_FAILED',error.stack);win?.destroy();store?.close();app.exit(1)})




