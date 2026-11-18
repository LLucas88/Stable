'use strict'
const { FORMATS } = require('./image-models.cjs')
const LIMIT = 20 * 1024 * 1024
function dimensions(width,height) {
  if (![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=8192)||width*height>32000000) throw Error('图片尺寸无效或过大。')
  return {width,height}
}
function inspectSVG(bytes) {
  const text=bytes.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|\u0000/i.test(text)) throw Error('SVG 包含不允许的外部定义。')
  const {DOMParser}=require('@xmldom/xmldom')
  const fail=()=>{throw Error('SVG XML 格式无效。')}
  const doc=new DOMParser({errorHandler:{warning:fail,error:fail,fatalError:fail}}).parseFromString(text,'image/svg+xml'),root=doc.documentElement
  if(root?.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('返回内容不是有效 SVG。')
  const tags=new Set('svg g defs title desc path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop pattern clipPath mask filter feGaussianBlur feOffset feBlend feColorMatrix feComponentTransfer feFuncR feFuncG feFuncB feFuncA feMerge feMergeNode feFlood feComposite feDropShadow symbol use style'.split(' '))
  const safeCSS=value=>{if(/[\\@]|expression\s*\(|javascript:|data:|https?:|\/\//i.test(value)||[...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(m=>!/^\s*['"]?#[\w:.-]+['"]?\s*$/.test(m[1])))throw Error('SVG 包含外部资源或不安全样式。')}
  const visit=node=>{
    if(node.nodeType===7||node.nodeType===10)throw Error('SVG 包含不允许的指令。')
    if(node.nodeType===1){
      if(!tags.has(node.localName)||node.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('SVG 含脚本、嵌入页面或不支持的元素。')
      for(let i=0;i<node.attributes.length;i++){
        const a=node.attributes[i];if(/^on/i.test(a.name)||['src','base'].includes(a.localName))throw Error('SVG 包含不安全属性。')
        if(a.localName==='href'&&!/^#[\w:.-]+$/.test(a.value))throw Error('SVG 不允许外部资源链接。')
        if(!/^xmlns(?::|$)/.test(a.name))safeCSS(a.value)
      }
      if(node.localName==='style')safeCSS(node.textContent)
    }
    for(let c=node.firstChild;c;c=c.nextSibling)visit(c)
  };visit(root)
  const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number)
  const number=v=>/^\d+(?:\.\d+)?(?:px)?$/.test(v)?parseFloat(v):NaN
  return dimensions(number(root.getAttribute('width'))||(box.length===4?box[2]:NaN),number(root.getAttribute('height'))||(box.length===4?box[3]:NaN))
}
function inspectGIF(bytes) {
  if(!/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))||bytes.length<14)throw Error('返回内容不是有效 GIF。')
  const size=dimensions(bytes.readUInt16LE(6),bytes.readUInt16LE(8));let p=13,frames=0,delay=0;const durations=[]
  const need=n=>{if(p+n>bytes.length)throw Error('GIF 数据不完整。')}
  if(bytes[10]&128)p+=3*(2**((bytes[10]&7)+1))
  const blocks=()=>{for(;;){need(1);const n=bytes[p++];if(!n)break;need(n);p+=n}}
  let ended=false
  while(p<bytes.length){const type=bytes[p++]
    if(type===0x3b){ended=true;break}
    if(type===0x21){need(1);const kind=bytes[p++];if(kind===0xf9){need(6);if(bytes[p]!==4||bytes[p+5]!==0)throw Error('GIF 控制块无效。');delay=bytes.readUInt16LE(p+2)*10;p+=6}else blocks()}
    else if(type===0x2c){need(9);const x=bytes.readUInt16LE(p),y=bytes.readUInt16LE(p+2),w=bytes.readUInt16LE(p+4),h=bytes.readUInt16LE(p+6),packed=bytes[p+8];if(!w||!h||x+w>size.width||y+h>size.height)throw Error('GIF 帧超出画布。');p+=9;if(packed&128)p+=3*(2**((packed&7)+1));need(1);const code=bytes[p++];if(code<2||code>8)throw Error('GIF 编码无效。');blocks();frames++;durations.push(delay);delay=0;if(frames>16)throw Error('GIF 超过 16 帧。')}
    else throw Error('GIF 数据块无效。')
  }
  if(!ended||p!==bytes.length||frames<2)throw Error('GIF 必须为完整的多帧动画。')
  return {...size,frameCount:frames,frameDurationsMs:durations,durationMs:durations.reduce((a,b)=>a+b,0)}
}
function inspectArtifact(bytes,format='png',nativeImage,policy) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>LIMIT||!FORMATS[format])throw Error('图片为空、格式无效或超过 20 MB。')
  let measured
  if(format==='svg')measured=inspectSVG(bytes)
  else if(format==='gif')measured=inspectGIF(bytes)
  else {
    const signature=format==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):format==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
    if(!signature)throw Error('返回图片的实际格式与请求不一致。')
    const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('返回图片无法解码。')
    measured=dimensions(image.getSize().width,image.getSize().height)
    if(policy)require('./design-output.cjs').inspectDesignImage(image,require('./design-output.cjs').deliverySpec(policy),bytes)
  }
  if(policy&&['svg','gif'].includes(format)){
    const spec=require('./design-output.cjs').deliverySpec(policy)
    if(!spec.autoSize&&(measured.width!==spec.width||measured.height!==spec.height))throw Error('实际输出尺寸与请求不一致，已保留原产物。')
    if(bytes.length>=spec.maxBytes)throw Error('交付文件大小超过上限。')
    if(format==='gif'&&(policy.frameCount&&measured.frameCount!==policy.frameCount||policy.frameDurationMs&&measured.frameDurationsMs.some(ms=>Math.abs(ms-policy.frameDurationMs)>10)))throw Error('实际 GIF 帧数或帧时长与请求不一致，已保留原产物。')
  }
  return {...measured,bytes:bytes.length,outputFormat:format,mimeType:FORMATS[format].mimeType}
}
async function canvasTranscode(source,mimeType) {
  const {BrowserWindow}=require('electron')
  const window=new BrowserWindow({show:false,width:1,height:1,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,partition:'image-codec-'+require('node:crypto').randomUUID()}})
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','file://*/*']},(_,done)=>done({cancel:true}))
  let timer
  try {
    const task=(async()=>{
      await window.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; img-src data:">')
      const result=await window.webContents.executeJavaScript('(async()=>{const i=new Image();i.src='+JSON.stringify(source)+';await i.decode();if(i.naturalWidth>8192||i.naturalHeight>8192||i.naturalWidth*i.naturalHeight>32000000)throw Error("Image too large");const c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext("2d").drawImage(i,0,0);return c.toDataURL('+JSON.stringify(mimeType)+',0.95)})()')
      if(!result.startsWith('data:'+mimeType+';base64,'))throw Error('当前环境无法处理该图片格式。')
      return Buffer.from(result.split(',')[1],'base64')
    })()
    return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('图片本地编解码超时。')),30000)})])
  }finally{clearTimeout(timer);if(!window.isDestroyed())window.destroy()}
}
async function decodeRaster(bytes,nativeImage){
  let image=nativeImage.createFromBuffer(bytes)
  if(image.isEmpty()&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')image=nativeImage.createFromBuffer(await canvasTranscode('data:image/webp;base64,'+bytes.toString('base64'),'image/png'))
  if(image.isEmpty())throw Error('返回图片无法解码。')
  dimensions(image.getSize().width,image.getSize().height);return image
}
async function inspectArtifactAsync(bytes,format,nativeImage,policy){
  if(format!=='webp')return inspectArtifact(bytes,format,nativeImage,policy)
  const decoded=await decodeRaster(bytes,nativeImage)
  return inspectArtifact(bytes,format,{createFromBuffer:()=>decoded},policy)
}
async function encodeRaster(image,format='png') {
  if(format==='png')return image.toPNG()
  if(format==='jpeg')return image.toJPEG(95)
  if(format!=='webp')throw Error('本地像素编辑仅支持 PNG、JPEG、WebP。')
  return canvasTranscode(image.toDataURL(),'image/webp')
}
module.exports={inspectArtifact,inspectArtifactAsync,inspectSVG,inspectGIF,encodeRaster,decodeRaster}
