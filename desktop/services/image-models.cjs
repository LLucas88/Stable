'use strict'
const OPENAI_IMAGES=['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2.6-sunburst','gpt-image-2.6-flare']
const QUALITIES=['low','medium','high','xhigh','max','auto']
const FORMATS={png:{extension:'png',mimeType:'image/png'},jpeg:{extension:'jpg',mimeType:'image/jpeg'},webp:{extension:'webp',mimeType:'image/webp'},svg:{extension:'svg',mimeType:'image/svg+xml'},gif:{extension:'gif',mimeType:'image/gif'}}
function imageOptions(value={}) {
 const model=value.model||'glm-image'
 if(model!=='glm-image'&&!OPENAI_IMAGES.includes(model))throw Error('不支持此图片模型。')
 const quality=value.quality||(model==='glm-image'?'hd':'medium')
 if(model==='glm-image'?quality!=='hd':!QUALITIES.includes(quality))throw Error('图片质量参数无效。')
 const background=value.background||'opaque'
 if(!['opaque','transparent','auto'].includes(background)||model==='glm-image'&&background!=='opaque')throw Error('该模型不支持此背景参数。')
 if(value.editTransport!==undefined&&!['json','multipart'].includes(value.editTransport))throw Error('图片编辑传输格式无效。')
 if(value.upstreamModel!==undefined&&(typeof value.upstreamModel!=='string'||!value.upstreamModel||value.upstreamModel.length>160||!/^[a-zA-Z0-9_.:/-]+$/.test(value.upstreamModel)))throw Error('上游模型名称无效。')
 const outputFormat=value.outputFormat||'png',complexity=value.complexity
 if(!Object.hasOwn(FORMATS,outputFormat)||model==='glm-image'&&outputFormat!=='png')throw Error('该模型不支持此输出格式。')
 if(complexity!==undefined&&(!model.startsWith('gpt-image-2.6-')||!['low','medium','high'].includes(complexity)))throw Error('构图复杂度仅支持 Image 2.6 的低、中、高选项。')
 if(['svg','gif'].includes(outputFormat)&&!model.startsWith('gpt-image-2.6-'))throw Error('SVG 和 GIF 输出需要 Image 2.6。')
 if(background==='transparent'&&!['png','webp'].includes(outputFormat))throw Error('透明背景请使用 PNG 或 WebP。')
 if(value.connectionId!==undefined&&(typeof value.connectionId!=='string'||!value.connectionId||value.connectionId.length>160))throw Error('图片服务连接无效。')
 if(outputFormat!=='gif'&&(value.frameCount!==undefined||value.frameDurationMs!==undefined))throw Error('帧参数仅用于 GIF。')
 const frames=outputFormat==='gif'?{frameCount:value.frameCount??9,frameDurationMs:value.frameDurationMs??200}:{}
 if(outputFormat==='gif'&&(!Number.isInteger(frames.frameCount)||frames.frameCount<2||frames.frameCount>16||!Number.isInteger(frames.frameDurationMs)||frames.frameDurationMs<20||frames.frameDurationMs>655350))throw Error('GIF 需要 2–16 帧，每帧时长 20–655350 ms。')
 // Omit new defaults so historical contracts and receipts remain compatible.
 return {model,quality,background,...(value.outputFormat?{outputFormat}:{}),...(complexity?{complexity}:{}),...frames,...(value.connectionId?{connectionId:value.connectionId}:{}),...(value.upstreamModel?{upstreamModel:value.upstreamModel}:{}),...(value.editTransport?{editTransport:value.editTransport}:{})}
}
function imageArguments(value){return Object.fromEntries(['model','quality','background','size','outputFormat','complexity','frameCount','frameDurationMs','connectionId','upstreamModel','editTransport'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))}
function outputExtension(value){return FORMATS[value.outputFormat||'png'].extension}
function checkImageSize(model,size){
 if(OPENAI_IMAGES.includes(model)&&size==='auto')return
 if(typeof size!=='string'||!/^\d{3,4}x\d{3,4}$/.test(size))throw Error('图片尺寸须为宽x高，例如 1024x1536。')
 const [w,h]=size.split('x').map(Number)
 if(!OPENAI_IMAGES.includes(model)) {
  if(w<512||h<512||w>2048||h>2048||w%32||h%32)throw Error('GLM 图片宽高须为 512–2048 且为 32 的整数倍。')
  return
 }
 if(w*h<655360||w*h>8294400||w/h>3||h/w>3||w>3840||h>3840||w%16||h%16)throw Error('GPT Image 尺寸须为16的倍数，比例介于1:3和3:1，总像素655360–8294400，单边不超过3840。')
}
module.exports={OPENAI_IMAGES,QUALITIES,FORMATS,imageOptions,checkImageSize,imageArguments,outputExtension}
