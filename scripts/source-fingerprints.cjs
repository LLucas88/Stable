'use strict'
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const accepted=file=>/\.(cjs|js|json|ps1|md|html|css|txt)$/i.test(file)
const ignored=file=>file.split(/[\\/]/).some(part=>['node_modules','.git','.venv','__pycache__','.cache'].includes(part))
function createFingerprints(root){
 const hashes=new Map()
 const hash=file=>{try{return createHash('sha256').update(fs.readFileSync(file)).digest('hex')}catch(e){if(e.code==='ENOENT')return null;throw e}}
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(ignored(path.relative(root,file)))continue;if(item.isDirectory())walk(file);else if(item.isFile()&&accepted(file))hashes.set(file,hash(file))}}
 walk(root)
 return {changed(file){if(ignored(path.relative(root,file))||!accepted(file))return false;const next=hash(file),previous=hashes.get(file)??null;if(previous===next)return false;if(next===null)hashes.delete(file);else hashes.set(file,next);return true}}
}
module.exports={createFingerprints}
