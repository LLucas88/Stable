'use strict'
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..'),catalogPath=path.join(root,'desktop/assets/experts/catalog.json'),entries=JSON.parse(fs.readFileSync(catalogPath)),dir=path.join(root,'public/expert-avatars')
fs.mkdirSync(dir,{recursive:true});let cursor=0,ok=0,failed=0
async function worker(){while(cursor<entries.length){const e=entries[cursor++];try{const url=new URL(e.avatarSource);if(url.protocol!=='https:')throw Error('Non-HTTPS');const r=await fetch(url,{signal:AbortSignal.timeout(12000)});const type=r.headers.get('content-type')?.split(';')[0];const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type];if(!r.ok||!ext)throw Error('Unsupported image');let chunks=[],size=0;for await(const chunk of r.body){size+=chunk.length;if(size>3000000)throw Error('Image too large');chunks.push(chunk)}const file=e.id+'.'+ext;fs.writeFileSync(path.join(dir,file),Buffer.concat(chunks));e.avatar='expert-avatars/'+file;ok++}catch{failed++}}}
Promise.all(Array.from({length:8},worker)).then(()=>{fs.writeFileSync(catalogPath,JSON.stringify(entries,null,2));console.log(JSON.stringify({downloaded:ok,fallback:failed}))})
