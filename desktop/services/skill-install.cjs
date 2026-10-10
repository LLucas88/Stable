'use strict'
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),JSZip=require('jszip')
const {inspectSkillFolder,importSkillFolder}=require('./importers.cjs')
const {resolveWorkspaceEntry}=require('./preview.cjs')
const LIMIT=100*1024*1024
async function installWorkspaceSkill({source,workspace,userData,store,signal}){
 signal?.throwIfAborted()
 const entry=resolveWorkspaceEntry(source,workspace)
 const staging=path.join(userData,'skill-import-staging');fs.mkdirSync(staging,{recursive:true})
 const temp=fs.mkdtempSync(path.join(staging,'import-'))
 let installed
 try{
  let folder=entry.path
  if(fs.statSync(folder).isFile()){
   if(path.extname(folder).toLowerCase()!=='.zip')throw Error('请选择 Skill 文件夹或 ZIP 压缩包。')
   if(fs.statSync(folder).size>LIMIT)throw Error('Skill ZIP 不能超过 100 MB。')
   const zip=await JSZip.loadAsync(fs.readFileSync(folder));const entries=Object.values(zip.files)
   if(entries.length>4000 || entries.filter(e=>!e.dir).length>2000)throw Error('Skill ZIP 文件数量过多。')
   let bytes=0;const names=new Set()
   for(const e of entries){
    const name=e.unsafeOriginalName||e.name,parts=name.replace(/\\/g,'/').split('/').filter(Boolean)
    if(!parts.length||/^[\\/]/.test(name)||parts.some(p=>p==='..'||p==='.'||/[:<>"|?*]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Skill ZIP 包含不安全的路径。')
    if((Number(e.unixPermissions)&0o170000)===0o120000)throw Error('Skill ZIP 不能包含符号链接。')
    const key=parts.join('/').toLowerCase();if(names.has(key))throw Error('Skill ZIP 存在重复路径。');names.add(key)
    bytes+=Number(e._data?.uncompressedSize)||0;if(bytes>LIMIT)throw Error('Skill ZIP 解压后不能超过 100 MB。')
   }
   let actual=0
   for(const e of entries){
    signal?.throwIfAborted()
    const target=path.join(temp,...e.name.replace(/\\/g,'/').split('/'))
    if(e.dir){fs.mkdirSync(target,{recursive:true});continue}
    const data=await e.async('nodebuffer');actual+=data.length;if(actual>LIMIT)throw Error('Skill ZIP 解压后不能超过 100 MB。')
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'})
   }
   const roots=[]
   const scan=d=>{if(fs.existsSync(path.join(d,'SKILL.md'))){roots.push(d);return}for(const e of fs.readdirSync(d,{withFileTypes:true}))if(e.isDirectory()&&e.name!=='__MACOSX')scan(path.join(d,e.name))}
   scan(temp);if(roots.length!==1)throw Error('ZIP 必须包含唯一的 Skill 根目录及 SKILL.md，请分别安装多个 Skill。')
   folder=roots[0]
  }
  signal?.throwIfAborted()
  inspectSkillFolder(folder)
  const hash=createHash('sha256')
  const digest=(d,rel='')=>{for(const name of fs.readdirSync(d).sort()){const f=path.join(d,name),r=rel+'/'+name;if(fs.statSync(f).isDirectory())digest(f,r);else{hash.update(r);hash.update(fs.readFileSync(f))}}}
  digest(folder);const signature=hash.digest('hex'),setting='installed-skill:'+signature
  const prior=store.listSkills().find(s=>s.id===store.getSetting(setting))
  if(prior&&fs.existsSync(prior.path))return {installed:true,alreadyInstalled:true,id:prior.id,name:prior.name,path:prior.path}
  installed=importSkillFolder(folder,path.join(userData,'skills'))
  try{store.db.exec('BEGIN');store.upsertSkill(installed);store.setSetting(setting,installed.id);store.db.exec('COMMIT')}
  catch(error){try{store.db.exec('ROLLBACK')}catch{};fs.rmSync(installed.path,{recursive:true,force:true});throw error}
  return {installed:true,id:installed.id,name:installed.name,path:installed.path,message:'已安装到当前 Stable 技能库。请手动选择后调用；安装不会执行 Skill。'}
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
module.exports={installWorkspaceSkill}
