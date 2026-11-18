'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const { createImageGenerator, validateArgs } = require('./image-generation.cjs')
const { ImageJobStore } = require('./image-job-store.cjs')
const { imageOptions, checkImageSize, OPENAI_IMAGES, imageArguments, outputExtension, FORMATS } = require('./image-models.cjs')
const { finishDesignImage, inspectDesignImage } = require('./design-output.cjs')
const { promptOverrides } = require('./design-prompt.cjs')
const {decodeRaster}=require('./image-artifacts.cjs')
const hash = value => createHash('sha256').update(value).digest('hex')
const key = id => 'image-editor:' + id
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
function blankDraft(model = 'gpt-image-2.6-sunburst', quality = 'medium') {
  return { requestId: randomUUID(), prompt: '', strokes: [], comments: [], removeBackground: false, background:'auto', outputFormat:'png', keepOutside:false, model: OPENAI_IMAGES.includes(model) ? model : OPENAI_IMAGES[0], quality: quality === 'hd' ? 'medium' : quality }
}
function validateDraft(value, size, submitting = true) {
  if (!value || !/^[a-zA-Z0-9_-]{10,80}$/.test(value.requestId || '') || typeof value.prompt !== 'string' || value.prompt.length > 1200) throw Error('编辑草稿无效。')
  if (!Array.isArray(value.strokes) || value.strokes.length > 100 || value.strokes.some(s => !Array.isArray(s.points) || !s.points.length || s.points.length > 1500 || s.points.some(p => !point(p)) || !Number.isFinite(s.width) || s.width < .001 || s.width > .05 || !/^#[0-9a-f]{6}$/i.test(s.color))) throw Error('标注过多或坐标无效。')
  if (!Array.isArray(value.comments) || value.comments.length > 12 || value.comments.some(c => !point(c) || typeof c.text !== 'string' || c.text.length > 180)) throw Error('评论过多或坐标无效。')
  if (typeof value.removeBackground !== 'boolean') throw Error('背景参数无效。')
  const options = imageOptions({...value,background:value.background||(value.removeBackground?'transparent':'auto')})
  if(['svg','gif'].includes(options.outputFormat))throw Error('图片编辑输出支持 PNG、JPEG、WebP；SVG 和 GIF 请在生图区生成。')
  const region=value.region
  if(region&&(!point(region)||!Number.isFinite(region.width)||!Number.isFinite(region.height)||region.width<=0||region.height<=0||region.x+region.width>1.000001||region.y+region.height>1.000001))throw Error('修改选区无效，请重新框选。')
  if(value.keepOutside!==undefined&&typeof value.keepOutside!=='boolean')throw Error('像素保留选项无效。')
  if(submitting&&value.keepOutside&&(!region||value.resize||(options.outputFormat||'png')!=='png'))throw Error('保留选区外像素需要先框选区域、保持原尺寸，并使用无损 PNG。')
  if (!OPENAI_IMAGES.includes(options.model)) throw Error('图片编辑需要支持参考图的 GPT Image 模型。')
  const r = value.resize
  if (r) {
    if (!['scale', 'crop', 'pad'].includes(r.mode) || !integer(r.width, submitting?1:0, 8192) || !integer(r.height, submitting?1:0, 8192) || r.width * r.height > 32000000 || !point(r) || !['white', 'transparent'].includes(r.background)) throw Error('目标尺寸须为 1–8192 像素，总像素不超过 3200 万。')
    if (submitting && r.mode === 'scale' && Math.abs(r.height - Math.round(r.width * size.height / size.width)) > 0) throw Error('等比例缩放的宽高比例必须与原图一致。')
    if (submitting && r.mode === 'crop' && (r.width > size.width || r.height > size.height)) throw Error('裁剪尺寸不能大于原图。')
    if (submitting && r.mode === 'pad' && (r.width < size.width || r.height < size.height)) throw Error('补边尺寸不能小于原图。')
  }
  return { requestId: value.requestId, prompt: value.prompt.trim(), strokes: value.strokes.map(s => ({ color: s.color, width: s.width, points: s.points.map(p => ({ x:p.x,y:p.y })) })), comments: value.comments.map(c => ({ x:c.x,y:c.y,text:c.text.trim() })), removeBackground: value.removeBackground, ...(r ? { resize: { mode:r.mode,width:r.width,height:r.height,x:r.x,y:r.y,background:r.background } } : {}), ...options,...(region?{region:{x:region.x,y:region.y,width:region.width,height:region.height}}:{}),keepOutside:!!value.keepOutside }
}
function localResize(image, resize, nativeImage) {
  if (!resize) return image
  const { width, height, mode, x, y } = resize, size = image.getSize()
  if (mode === 'scale') return image.resize({ width, height, quality:'best' })
  if (mode === 'crop') return image.crop({ x:Math.round((size.width-width)*x), y:Math.round((size.height-height)*y), width, height })
  const pixels = image.toBitmap({scaleFactor:1}), output = Buffer.alloc(width*height*4, resize.background === 'white' ? 255 : 0)
  const left = Math.round((width-size.width)*x), top = Math.round((height-size.height)*y)
  for (let row=0;row<size.height;row++) pixels.copy(output,((top+row)*width+left)*4,row*size.width*4,(row+1)*size.width*4)
  return nativeImage.createFromBitmap(output,{width,height,scaleFactor:1})
}
// Closest supported canvas; the result is fitted without removing image content.
function generationSize(size) {
  const ratio = size.width / size.height
  if (ratio < 1/3 || ratio > 3) throw Error('当前图片比例超出编辑接口的 1:3–3:1 范围。请先用本地裁剪或补边生成合适比例的版本。尚未调用接口。')
  const scale = Math.min(1, 2048 / Math.max(size.width,size.height)) * Math.max(1, Math.sqrt(1100000/(size.width*size.height)))
  const width = Math.round(size.width*scale/16)*16, height = Math.round(size.height*scale/16)*16
  const result = `${width}x${height}`; checkImageSize(OPENAI_IMAGES[0],result); return result
}
function editPrompt(draft, size) {
  const comments = draft.comments.map((c,i)=>`${i+1} (${Math.round(c.x*size.width)},${Math.round(c.y*size.height)}): ${c.text}`).join('\n')
  const text = '编辑第一张原图，保留未指定修改的内容、文字和布局。'
    + (draft.strokes.length || draft.comments.length ? (draft.region?'第二张仅为定位示意，':'透明标注图仅为定位说明，')+'笔迹及编号不能出现在成品中。坐标基于原图像素。' : '')
    + (draft.removeBackground ? '移除背景，保留主体，输出真实透明背景。' : '')
    + (draft.region?'仅修改蒙版透明选区内的内容。':'')
    + '\n' + draft.prompt + (comments ? '\n位置评论：\n'+comments : '')
  if ([...text].length > 1000) throw Error('修改描述与评论合计过长，请缩短后提交（接口最多 1000 字）。')
  return text
}
function editParameters(draft, version) {
  const patch=promptOverrides(draft.prompt,{...draft,width:version.width,height:version.height,resolution:'standard'})
  if(patch.count && patch.count!==1)throw Error('图片编辑每次生成一个新版本，请一次提交一张。')
  const background=patch.background || (draft.removeBackground?'transparent':draft.background||'auto')
  const options=imageOptions({...draft,...patch,background})
  if(!OPENAI_IMAGES.includes(options.model))throw Error('提示词指定的模型不支持参考图编辑，尚未调用接口。')
  const dimensions=patch.width && patch.height ? {width:patch.width,height:patch.height} : {width:version.width,height:version.height}
  const size=patch.width ? `${patch.width}x${patch.height}` : generationSize(version)
  checkImageSize(options.model,size)
  if(draft.keepOutside&&(patch.width||patch.height||(options.outputFormat||'png')!=='png'))throw Error('保留选区外像素时不能通过提示词更改画布或输出有损格式。')
  if(['svg','gif'].includes(options.outputFormat))throw Error('当前编辑不支持 SVG 或 GIF 输出。')
  return { ...options,dimensions,size,resize:patch.width?undefined:draft.resize,prompt:editPrompt({...draft,removeBackground:background==='transparent'},version) }
}
class ImageEditor {
  constructor(deps) { this.deps=deps; this.running=new Map() }
  load(id) {
    if (!/^[a-f0-9]{64}$/.test(id || '')) throw Error('编辑记录无效。')
    const session=this.deps.store.getSetting(key(id))
    if (!session || !this.deps.store.conversation(session.conversationId)) throw Error('找不到图片编辑记录。')
    return structuredClone(session)
  }
  directory(session) {
    const workspace=this.deps.getPaths(session.conversationId,true).workspace
    let directory=workspace
    for (const part of ['.stable','image-edits',session.id]) {
      directory=path.join(directory,part)
      if (!fs.existsSync(directory)) fs.mkdirSync(directory)
      resolveWorkspaceEntry(directory,workspace)
    }
    return directory
  }
  async read(session, versionId) {
    const version=session.versions.find(v=>v.id===versionId)
    if (!version) throw Error('图片版本不存在。')
    resolveWorkspaceEntry(version.path,this.directory(session),{fileOnly:true})
    if(fs.statSync(version.path).size>20*1024*1024)throw Error('图片版本超过 20 MB，无法编辑。')
    const bytes=fs.readFileSync(version.path)
    if(hash(bytes)!==version.hash) throw Error('图片版本已被外部修改，请重新打开原图。')
    return {version,bytes,image:await decodeRaster(bytes,this.deps.nativeImage)}
  }
  async view(session,versionId) {
    const {bytes}=await this.read(session,versionId)
    return { id:session.id,conversationId:session.conversationId,versionId,connections:(this.deps.imageConnections?.()||[]).filter(c=>c.hasApiKey&&c.providerId!=='stable-cloud'&&c.providerId!=='chatgpt').map(c=>({id:c.id,displayName:c.displayName})),versions:session.versions.map(({hash,...v})=>v),previewUrl:'data:'+FORMATS[session.versions.find(v=>v.id===versionId)?.outputFormat||'png'].mimeType+';base64,'+bytes.toString('base64'),draft:session.drafts[versionId] || blankDraft(session.model,session.quality) }
  }
  async open(conversationId,file) {
    const {store,nativeImage}=this.deps, conversation=store.conversation(conversationId)
    if (!conversation || typeof file !== 'string') throw Error('找不到对话或图片。')
    const workspace=this.deps.getPaths(conversationId,true)
    const real=resolveWorkspaceEntry(file,this.deps.roots(conversationId,file,workspace.readableRoots),{fileOnly:true})
    // Authorization is checked again before reusing a session or its snapshot.
    const authorizedPath=real.path
    if (!/\.(png|jpe?g|webp)$/i.test(authorizedPath) || fs.statSync(authorizedPath).size>20*1024*1024) throw Error('编辑支持 20 MB 以内的 PNG、JPEG、WebP 图片。')
    const bytes=fs.readFileSync(authorizedPath), image=await decodeRaster(bytes,nativeImage), size=image.getSize()
    if(image.isEmpty() || !size.width || !size.height || Math.max(size.width,size.height)>8192 || size.width*size.height>32000000) throw Error('图片无法解码或尺寸过大。')
    const identity=hash(JSON.stringify([conversationId,path.resolve(file),hash(bytes)]))
    const alias=store.getSetting('image-editor-version:'+identity)
    if(alias) return this.view(this.load(alias.id),alias.versionId)
    const id=identity, existing=store.getSetting(key(id))
    if(existing) return this.view(existing,existing.selected || 'original')
    const design=conversation.design || {}, session={id,conversationId,versions:[],drafts:{},requests:{},selected:'original',model:design.model,quality:design.quality,connectionId:design.connectionId,upstreamModel:design.upstreamModel,editTransport:design.editTransport}
    const target=path.join(this.directory(session),'original.png'), png=image.toPNG()
    if(png.length>20*1024*1024)throw Error('图片解码后的 PNG 超过 20 MB，请先缩小图片。')
    if(fs.existsSync(target)) { resolveWorkspaceEntry(target,this.directory(session),{fileOnly:true});if(hash(fs.readFileSync(target))!==hash(png)) throw Error('原图快照冲突。') }
    else fs.writeFileSync(target,png,{flag:'wx'})
    session.versions.push({id:'original',label:'原图',path:target,...size,hash:hash(png)})
    session.drafts.original={...blankDraft(session.model,session.quality),connectionId:session.connectionId,upstreamModel:session.upstreamModel,editTransport:session.editTransport}
    store.setSetting(key(id),session); return this.view(session,'original')
  }
  async select(id,versionId) { let s=this.load(id);await this.read(s,versionId);s=this.load(id);s.selected=versionId;this.deps.store.setSetting(key(id),s);return this.view(s,versionId) }
  save(id,versionId,value) {
    const s=this.load(id),version=s.versions.find(v=>v.id===versionId)
    if(!version)throw Error('图片版本不存在。')
    // Draft autosave needs only immutable version metadata. Pixel integrity is
    // checked when reading/submitting, not on every keystroke.
    s.drafts[versionId]=validateDraft(value,version,false);this.deps.store.setSetting(key(id),s)
  }
  cancel(id) { this.running.get(id)?.abort() }
  async submit(id,versionId,value,guide) {
    const {store,nativeImage,controls,makeGenerator=createImageGenerator}=this.deps
    let s=this.load(id)
    if(this.running.has(id)||controls.has(s.conversationId)||this.deps.isLocked?.(s.conversationId)) throw Error('当前对话已有任务正在执行，请稍后提交。')
    const {version,bytes,image}=await this.read(s,versionId),draft=validateDraft(value,version)
    const signature=hash(JSON.stringify([versionId,draft,guide ? hash(guide) : ''])), previous=s.requests[draft.requestId]
    if(previous && previous.signature!==signature) throw Error('此提交编号已使用，请重新修改草稿后提交。')
    if(previous?.versionId) return this.view(s,previous.versionId)
    const remote=Boolean(draft.prompt || draft.removeBackground || draft.background && draft.background!=='auto' || draft.comments.some(c=>c.text))
    if(!remote&&!draft.resize&&(draft.outputFormat||'png')===(version.outputFormat||'png')) throw Error('请填写修改要求、添加评论、选择去背景或调整大小。标注本身不会改变原图。')
    if(draft.comments.some(c=>!c.text)) throw Error('请填写评论内容，或删除空白评论。')
    let parameters=remote?editParameters(draft,version):undefined
    const format=parameters?.outputFormat||draft.outputFormat||'png', extension=outputExtension({outputFormat:format})
    const dir=this.directory(s), output=path.join(dir,draft.requestId+'.'+extension), generated=path.join(dir,draft.requestId+'.generated.'+extension)
    let references=[],route,args,markup,mask
    if(remote) {
      if(store.conversation(s.conversationId).networkAccess===false) throw Error('当前对话未允许网络访问。')
      references=[{id:hash(bytes),bytes,mimeType:FORMATS[version.outputFormat||'png'].mimeType}]
      if(draft.strokes.length||draft.comments.length) {
        if(typeof guide!=='string'||guide.length>14*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(guide)) throw Error('标注定位图缺失或过大。')
        const annotated=Buffer.from(guide.split(',')[1],'base64'), decoded=nativeImage.createFromBuffer(annotated), dimensions=decoded.getSize()
        if(decoded.isEmpty()||dimensions.width!==version.width||dimensions.height!==version.height) throw Error('标注定位图尺寸与原图不一致。')
        const layer={id:hash(annotated),bytes:annotated,mimeType:'image/png'}
        if(draft.region)references.push(layer);else markup=layer
      }
      if(references.some(r=>r.bytes.length>10*1024*1024)) throw Error('编辑接口的单张参考图上限为 10 MB，请先本地缩小图片。')
      if(draft.region){const layer=regionMask(version,draft.region,nativeImage);mask={id:hash(layer),bytes:layer,mimeType:'image/png'}}
      args=validateArgs({...imageArguments(parameters),prompt:parameters.prompt,output:generated})
    }
    // Preflight above makes no paid calls. Persist the same output/id for recovery.
    if(this.running.has(id)||controls.has(s.conversationId)) throw Error('当前对话已有任务正在执行。')
    const abort=new AbortController(),control={kind:'image-edit',phase:'running',runner:{cancel:()=>abort.abort()},reviewers:new Set(),cancelled:false}
    this.running.set(id,abort);controls.set(s.conversationId,control)
    try {
      s.drafts[versionId]=draft;s.requests[draft.requestId]={signature};store.setSetting(key(id),s)
      let result=image
      if(remote) {
        route=await this.deps.resolveImageRoute(s.conversationId,parameters)
        abort.signal.throwIfAborted()
        if(!route?.apiKey||!route.editEndpoint) throw Error('请配置支持图片编辑的服务连接，或登录 Stable Cloud。')
        const jobs=new ImageJobStore(path.join(this.deps.userData,'image-edit-jobs',hash(s.conversationId)))
        const generate=makeGenerator({references,markup,mask,resolveRoute:()=>route,jobStore:jobs,nativeImage})
        const generatedResult=await generate({workspace:this.deps.getPaths(s.conversationId,true).workspace,args,signal:abort.signal})
        abort.signal.throwIfAborted()
        const raw=fs.readFileSync(generatedResult.path)
        const decoded=await decodeRaster(raw,nativeImage)
        inspectDesignImage(decoded,{...decoded.getSize(),maxBytes:20*1024*1024,background:parameters.background},raw)
        const [requestedWidth,requestedHeight]=parameters.size.split('x').map(Number),actual=decoded.getSize()
        if(Math.abs(actual.width/actual.height-requestedWidth/requestedHeight)>Math.max(1/actual.height,1/requestedHeight)*2) throw Error('接口返回的图片比例与请求不一致，已保留生成文件并停止，不会把方图当作指定比例的成品或自动重新生成。')
        const fitted=finishDesignImage(decoded,nativeImage,{size:`${parameters.dimensions.width}x${parameters.dimensions.height}`,fit:'contain',background:parameters.background})
        result=nativeImage.createFromBuffer(fitted.png)
      }
      abort.signal.throwIfAborted()
      if(draft.keepOutside)result=preserveOutside(image,result,draft.region,nativeImage)
      result=localResize(result,parameters?parameters.resize:draft.resize,nativeImage)
      const png=await require('./image-artifacts.cjs').encodeRaster(result,format),dimensions=result.getSize()
      abort.signal.throwIfAborted()
      inspectDesignImage(result,{...dimensions,maxBytes:20*1024*1024,background:parameters?.background || 'auto'},png)
      if(fs.existsSync(output)) { resolveWorkspaceEntry(output,dir,{fileOnly:true});if(hash(fs.readFileSync(output))!==hash(png)) throw Error('已有版本文件不同，拒绝覆盖。') }
      else fs.writeFileSync(output,png,{flag:'wx'})
      s=this.load(id)
      const next={id:draft.requestId,parentId:versionId,label:`版本 ${s.versions.length}`,path:output,outputFormat:format,...dimensions,hash:hash(png)}
      s.versions.push(next);s.requests[draft.requestId]={signature,versionId:next.id};s.selected=next.id;s.drafts[next.id]={...blankDraft(draft.model,draft.quality),connectionId:draft.connectionId,upstreamModel:draft.upstreamModel,editTransport:draft.editTransport}
      store.db.exec('BEGIN IMMEDIATE')
      try {
        store.setSetting(key(id),s)
        store.setSetting('image-editor-version:'+hash(JSON.stringify([s.conversationId,path.resolve(output),hash(png)])),{id,versionId:next.id})
        store.db.exec('COMMIT')
      } catch(error) { store.db.exec('ROLLBACK');throw error }
      return this.view(s,next.id)
    } finally { this.running.delete(id);if(controls.get(s.conversationId)===control)controls.delete(s.conversationId) }
  }
  async accept(id,versionId) {
    let s=this.load(id);await this.read(s,versionId);s=this.load(id);const version=s.versions.find(v=>v.id===versionId)
    if(version.id==='original'||version.accepted)return
    const {store}=this.deps
    store.db.exec('BEGIN IMMEDIATE')
    try {
      store.addMessage(s.conversationId,'assistant',`已保存图片编辑${version.label}（${version.width} × ${version.height}）。原图保留。\n\n[${version.label}](<${version.path}>)`)
      version.accepted=true;store.setSetting(key(id),s);store.db.exec('COMMIT')
    }catch(e){store.db.exec('ROLLBACK');throw e}
    this.deps.publishState(s.conversationId)
  }
}
function pixelRegion(size,region){const left=Math.floor(region.x*size.width),top=Math.floor(region.y*size.height);return {left,top,right:Math.min(size.width,Math.ceil((region.x+region.width)*size.width)),bottom:Math.min(size.height,Math.ceil((region.y+region.height)*size.height))}}
function regionMask(size,region,nativeImage){const area=pixelRegion(size,region),pixels=Buffer.alloc(size.width*size.height*4,255);for(let y=area.top;y<area.bottom;y++)for(let x=area.left;x<area.right;x++)pixels[(y*size.width+x)*4+3]=0;return nativeImage.createFromBitmap(pixels,{...size,scaleFactor:1}).toPNG()}
function preserveOutside(original,edited,region,nativeImage){const size=original.getSize();if(JSON.stringify(size)!==JSON.stringify(edited.getSize()))throw Error('像素合成需要相同画布尺寸。');const output=original.toBitmap({scaleFactor:1}),input=edited.toBitmap({scaleFactor:1}),area=pixelRegion(size,region);for(let y=area.top;y<area.bottom;y++)input.copy(output,(y*size.width+area.left)*4,(y*size.width+area.left)*4,(y*size.width+area.right)*4);return nativeImage.createFromBitmap(output,{...size,scaleFactor:1})}
function registerImageEditorIpc(ipcMain,editor,isTrusted) {
  for(const method of ['open','select','save','submit','cancel','accept']) ipcMain.handle('stable:imageEditor:'+method,(event,payload)=>{
    if(!isTrusted(event))throw Error('此页面无权编辑图片。')
    if(!Array.isArray(payload)||payload.length>4)throw Error('编辑参数无效。')
    return editor[method](...payload)
  })
}
module.exports={ImageEditor,registerImageEditorIpc,blankDraft,validateDraft,localResize,generationSize,editPrompt,editParameters,regionMask,preserveOutside}
