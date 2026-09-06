'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const JSZip=require('jszip')
const catalog=require('../desktop/skills/tencenthub/catalog.json')
const {adapt}=require('./tencenthub-adapters.cjs')
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
function within(root, relative, existing=false) {
  if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')||relative.includes(':')||path.isAbsolute(relative))throw Error('无效资源路径：'+relative)
  const target=path.resolve(root,relative),realRoot=fs.realpathSync(root)
  if(existing){const rel=path.relative(realRoot,fs.realpathSync(target));if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('资源链接越界：'+relative)}
  return target
}
async function prepare({output,cache}={}) {
  output=path.resolve(output||path.join(__dirname,'../.local/tencenthub/20260906'))
  if(fs.existsSync(output))throw Error('输出目录已存在；保留旧版本并指定新的 --output。')
  const pending=output+'.preparing-'+crypto.randomUUID()
  fs.mkdirSync(pending,{recursive:true})
  const skills=[],files=[]
  try{
    for(const item of catalog.items.filter(x=>x.decision==='migrate')) {
      const source=path.join(pending,'sources',item.slug),destination=path.join(pending,'skills',item.slug)
      fs.mkdirSync(source,{recursive:true});fs.mkdirSync(destination,{recursive:true})
      let zip
      if(!cache){
        const response=await fetch(item.downloadURL,{signal:AbortSignal.timeout(45000)})
        if(!response.ok)throw Error(item.slug+': HTTP '+response.status)
        const chunks=[];let total=0
        for await(const chunk of response.body){total+=chunk.length;if(total>16*1024*1024)throw Error('技能压缩包过大');chunks.push(chunk)}
        const bytes=Buffer.concat(chunks)
        if(hash(bytes)!==item.packageSha256)throw Error(item.slug+': 压缩包与审查版本不一致')
        zip=await JSZip.loadAsync(bytes)
        const expected=new Set(item.sourceFiles.map(f=>f.path))
        for(const entry of Object.values(zip.files))if(!entry.dir){
          const original=entry.unsafeOriginalName||entry.name
          within(source,original)
          if(!expected.has(original)||((Number(entry.unixPermissions)||0)&0o170000)===0o120000)throw Error('未审查的压缩包条目：'+original)
        }
      }
      let expanded=0
      for(const file of item.sourceFiles){
        const raw=cache?fs.readFileSync(within(path.resolve(cache,item.slug),file.path,true)):await zip.file(file.path)?.async('nodebuffer')
        if(!raw||hash(raw)!==file.sha256)throw Error(item.slug+': 原件校验失败 '+file.path)
        expanded+=raw.length;if(expanded>64*1024*1024)throw Error('技能解压体积过大')
        for(const directory of [source,destination]){const target=within(directory,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,raw,{flag:'wx'})}
      }
      const original=fs.readFileSync(path.join(source,'SKILL.md'),'utf8')
      fs.writeFileSync(path.join(destination,'SKILL.md'),adapt(item.slug,original))
      if(item.slug==='ppt')fs.copyFileSync(path.join(__dirname,'tencenthub-overrides/ppt-template.html'),path.join(destination,'assets/template.html'))
      if(item.slug==='ui-ux-pro-max')fs.copyFileSync(path.join(__dirname,'tencenthub-overrides/ui-run.py'),path.join(destination,'scripts/stable_ui.py'))
      const scan=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())scan(file);else files.push({path:path.relative(pending,file).split(path.sep).join('/'),sha256:hash(fs.readFileSync(file))})}}
      scan(destination)
      skills.push({slug:item.slug,directory:'skills/'+item.slug,entry:'skills/'+item.slug+'/SKILL.md'})
    }
    files.sort((a,b)=>a.path.localeCompare(b.path,'en'))
    const manifest={schemaVersion:1,bundle:catalog.bundle,skills,files}
    fs.writeFileSync(path.join(pending,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.renameSync(pending,output)
    return {output,skills:skills.length,files:files.length}
  }catch(error){throw Error(error.message+'；未激活任何技能，审查中间目录保留于 '+pending)}
}
if(require.main===module){const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};prepare({output:option('--output'),cache:option('--cache')}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1})}
module.exports={prepare,within,hash}
