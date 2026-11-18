'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Provide the gateway source directory');
const rel='lib/server/openai-image-gateway.ts',file=path.join(target,rel),overlay=path.join(__dirname,'overlay');
const old=fs.readFileSync(file),desired=fs.readFileSync(path.join(overlay,rel));
if(!old.equals(desired)&&crypto.createHash('sha256').update(old).digest('hex')!=='16645e35fc742f94f86e4434115d2710678d73221bfc401a9c51d60cd2c2d09e')throw Error('Gateway source changed; review before applying');
const backup=path.join(target,'.image-recovery-backup-'+Date.now());
const glm='lib/server/image-gateway.ts',glmOld=fs.readFileSync(path.join(target,glm)),glmNew=fs.readFileSync(path.join(overlay,glm));
if(!glmOld.equals(glmNew)&&crypto.createHash('sha256').update(glmOld).digest('hex')!=='4b3cf4aa0b6e9b15027a91d79484dc9226c92b435ad2e044ca76bcbf51f849d4')throw Error('GLM gateway source changed; review before applying');
function copy(dir,rel=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(rel,entry.name),source=path.join(dir,entry.name);if(entry.isDirectory()){copy(source,name);continue}const dest=path.join(target,name),content=fs.readFileSync(source);if(fs.existsSync(dest)){if(fs.readFileSync(dest).equals(content))continue;fs.mkdirSync(path.dirname(path.join(backup,name)),{recursive:true});fs.copyFileSync(dest,path.join(backup,name));}fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content)}}
copy(overlay);console.log(JSON.stringify({applied:true,target,backup,deployed:false}));
