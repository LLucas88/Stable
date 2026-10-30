'use strict'
// Prepare a gateway source checkout only. Does not build, migrate, deploy, or
// access any account/database. Existing source files receive a rollback copy.
const fs=require('node:fs'),path=require('node:path')
const target=path.resolve(process.argv[2]||'')
if(!process.argv[2]||!fs.existsSync(path.join(target,'lib/server/gateway.ts')))throw Error('Provide a Stable Cloud source directory')
const backup=path.join(target,'.image-source-backup-'+Date.now())
function write(relative,contents){const file=path.join(target,relative);if(fs.existsSync(file)){const old=fs.readFileSync(file);if(old.equals(Buffer.from(contents)))return;fs.mkdirSync(path.dirname(path.join(backup,relative)),{recursive:true});fs.writeFileSync(path.join(backup,relative),old)}fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents)}
function copy(directory,relative=''){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=path.join(relative,entry.name),file=path.join(directory,entry.name);if(entry.isDirectory())copy(file,name);else write(name,fs.readFileSync(file))}}
copy(path.join(__dirname,'overlay'))
const quota='lib/server/quota.ts'
write(quota,require('./quota-patch.cjs').patchImageRecovery(fs.readFileSync(path.join(target,quota),'utf8')))
const gateway='lib/server/gateway.ts',source=fs.readFileSync(path.join(target,gateway),'utf8')
const anchor='  const model = await getModelSnapshot(String(body.model));'
if(!source.includes("'image_requires_image_endpoint'")){if(!source.includes(anchor))throw Error('Gateway anchor changed; review manually');write(gateway,source.replace(anchor,anchor+"\n  if (model.upstreamModel === 'glm-image') throw new AppError(400, 'image_requires_image_endpoint', '请使用图片生成接口。');"))}
const catalog='lib/server/model-catalog.ts',text=fs.readFileSync(path.join(target,catalog),'utf8')
if(!text.includes("m.upstream_model <> 'glm-image'")){const old="WHERE m.status = 'active'\n";const crlf="WHERE m.status = 'active'\r\n";const key=text.includes(crlf)?crlf:old;if(!text.includes(key))throw Error('Catalog anchor changed; review manually');write(catalog,text.replace(key,key.replace("'active'","'active' AND m.upstream_model <> 'glm-image'")))}
console.log(JSON.stringify({target,backup,sourcePrepared:true,databaseChanged:false,deployed:false}))
