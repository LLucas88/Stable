'use strict'
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{fileURLToPath}=require('node:url')
const {resolveWorkspaceEntry}=require('./preview.cjs')
function imageType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png'
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg'
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'webp'
  if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))return 'gif'
  if(/^(?:\s*<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString('utf8').trim()))return 'svg'
  throw Error('请选择 PNG、JPEG、WebP、GIF 或 SVG 图片。')
}
class EditorImages {
  constructor(electron,file,roots){this.electron=electron;this.file=file;this.roots=roots;this.folder=path.basename(file,path.extname(file))+'.assets';this.base=path.join(path.dirname(file),this.folder);this.directory=path.join(this.base,'images')}
  ensure() {
    resolveWorkspaceEntry(this.file,this.roots,{fileOnly:true})
    for(const dir of [this.base,this.directory]){if(!fs.existsSync(dir))fs.mkdirSync(dir);resolveWorkspaceEntry(dir,this.roots);if(fs.realpathSync(dir)!==dir)throw Error('图片资源目录不能是链接。')}
  }
  manifest(){this.ensure();const file=path.join(this.base,'images.json');if(!fs.existsSync(file))return {};resolveWorkspaceEntry(file,this.roots,{fileOnly:true});return JSON.parse(fs.readFileSync(file,'utf8'))}
  persist(bytes,original) {
    if(bytes.length>10*1024*1024)throw Error('图片不能超过 10 MB。')
    const ext=imageType(bytes);this.ensure();const name=randomUUID()+'.'+ext,relative='./'+encodeURIComponent(this.folder)+'/images/'+name
    fs.writeFileSync(path.join(this.directory,name),bytes,{flag:'wx'})
    const manifest=this.manifest();manifest[relative]=original||relative
    const target=path.join(this.base,'images.json'),temp=path.join(this.base,randomUUID()+'.tmp')
    fs.writeFileSync(temp,JSON.stringify(manifest,null,2),{flag:'wx'});fs.renameSync(temp,target)
    return relative
  }
  async importFile(file){const info=fs.statSync(file);if(!info.isFile()||info.size>10*1024*1024)throw Error('图片不能超过 10 MB。');const bytes=fs.readFileSync(file);await this.process(bytes);return this.persist(bytes)}
  read(src) {
    if(typeof src!=='string'||src.length>15*1024*1024)throw Error('图片地址无效。')
    if(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(src)) {const data=Buffer.from(src.split(',')[1],'base64');if(data.length>10*1024*1024)throw Error('图片不能超过 10 MB。');imageType(data);return data}
    let file
    if(src.startsWith('file:'))file=fileURLToPath(src)
    else {if(/^[a-z][a-z\d+.-]*:|^\/\//i.test(src))throw Error('请先替换为本地图片，再进行裁剪。');file=path.resolve(path.dirname(this.file),decodeURIComponent(src.split(/[?#]/)[0]))}
    const entry=resolveWorkspaceEntry(file,this.roots,{fileOnly:true});if(entry.size>10*1024*1024)throw Error('图片不能超过 10 MB。');return fs.readFileSync(entry.path)
  }
  async original(src) {const manifest=this.manifest(),original=manifest[src]||src,bytes=this.read(original);const info=await this.process(bytes);return {...info,original,format:imageType(bytes)}}
  async crop(src,rect) {
    const manifest=this.manifest();let original=manifest[src]||src;let bytes=this.read(original)
    if(!manifest[src])original=this.persist(bytes)
    const result=await this.process(bytes,rect)
    return this.persist(Buffer.from(result.base64,'base64'),original)
  }
  async process(bytes,rect) {
    const ext=imageType(bytes)
    const win=new this.electron.BrowserWindow({show:false,width:1,height:1,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}})
    try {
      await win.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; img-src data: blob:">')
      return await win.webContents.executeJavaScript(`(${async function(base64,type,crop){
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type})
        let bitmap
        if(type==='image/svg+xml'){const img=new Image();const url=URL.createObjectURL(blob);try{img.src=url;await img.decode();bitmap=await createImageBitmap(img)}finally{URL.revokeObjectURL(url)}}else bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'})
        try {
          const w=bitmap.width,h=bitmap.height;if(!w||!h||w*h>40000000)throw Error('图片像素超过 4000 万限制。')
          let r=crop||{x:0,y:0,width:w,height:h}
          if(!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>w||r.y+r.height>h)throw Error('裁剪范围无效。')
          const canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;canvas.getContext('2d').drawImage(bitmap,r.x,r.y,r.width,r.height,0,0,r.width,r.height)
          return {width:r.width,height:r.height,base64:canvas.toDataURL('image/png').split(',')[1]}
        }finally{bitmap.close()}
      }.toString()})(${JSON.stringify(bytes.toString('base64'))},${JSON.stringify('image/'+(ext==='jpg'?'jpeg':ext==='svg'?'svg+xml':ext))},${JSON.stringify(rect||null)})`)
    }finally{win.destroy()}
  }
}
module.exports={EditorImages,imageType}
