const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Provide gateway source directory');
const backup=path.join(target,'.egress-ha-backup-'+Date.now()),changes=new Map();
function patch(rel,old,next){let text=changes.get(rel)||fs.readFileSync(path.join(target,rel),'utf8');if(text.includes(next))return;if(!text.includes(old))throw Error('Source anchor changed: '+rel);changes.set(rel,text.replace(old,next));}
patch('lib/server/openai-image-gateway.ts',"import { providerFetch } from './openai-fetch';","import { providerFetch, assertOpenAIEgressReady } from './openai-fetch';");
if(!fs.readFileSync(path.join(target,'lib/server/openai-image-gateway.ts'),'utf8').includes('await assertOpenAIEgressReady();'))patch('lib/server/openai-image-gateway.ts',"  let reservation;","  // Check only NEW requests, after replay lookup and before quota reservation.\n  await assertOpenAIEgressReady();\n  let reservation;");
patch('app/admin/page.tsx',"import { useEffect, useState } from 'react';","import { useEffect, useState } from 'react';\nimport { EgressStatus } from '@/components/admin/egress-status';");
patch('app/admin/page.tsx','      {error ? (','      <EgressStatus />\n      {error ? (');
function collect(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const r=path.join(rel,e.name);if(e.isDirectory())collect(path.join(dir,e.name),r);else changes.set(r,fs.readFileSync(path.join(dir,e.name),'utf8'));}}
collect(path.join(__dirname,'overlay'));
for(const [rel,content] of changes){const dest=path.join(target,rel);if(fs.existsSync(dest)){const old=fs.readFileSync(dest,'utf8');if(old===content)continue;const b=path.join(backup,rel);fs.mkdirSync(path.dirname(b),{recursive:true});fs.writeFileSync(b,old);}fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
console.log(JSON.stringify({applied:true,target,backup,deployed:false}));
