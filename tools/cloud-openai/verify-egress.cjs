const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const source=path.resolve('.local/ecs-production/source/lib/server/openai-fetch.ts');
 const fixture=path.resolve('.local/image503-20261105/egress-fixture.cjs');
 await require('esbuild').build({entryPoints:[source],outfile:fixture,platform:'node',format:'cjs',bundle:true,plugins:[{name:'mock-egress',setup(b){
  b.onResolve({filter:/^undici$/},()=>({path:'undici',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/env$/},()=>({path:'env',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='env'?'export function getRuntimeEnv(){return globalThis.__egress.env}':'export class ProxyAgent{constructor(url){globalThis.__egress.agents.push(url)}}; export async function fetch(url,options){globalThis.__egress.calls.push({url,options});return new Response("ok")}'}));
 }}]});
 try{
 for(const proxy of ['http://127.0.0.1:10808','http://127.0.0.1:10818','http://127.0.0.1:10819','http://0.0.0.0:10818','https://untrusted.invalid','http://user:password@127.0.0.1:10818',{}]){
  globalThis.__egress={env:{OPENAI_HTTPS_PROXY:proxy},agents:[],calls:[]};delete require.cache[fixture];
  const {providerFetch}=require(fixture),request=new Request('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer fixture'},body:'{}'});
  if(['http://127.0.0.1:10808','http://127.0.0.1:10818','http://127.0.0.1:10819'].includes(proxy)){
   assert.equal((await providerFetch(request)).status,200);assert.deepEqual(globalThis.__egress.agents,[proxy]);assert.equal(globalThis.__egress.calls.length,1);assert.equal(globalThis.__egress.calls[0].options.headers.authorization,'Bearer fixture');
  }else{await assert.rejects(providerFetch(request),/not allowed/);assert.equal(globalThis.__egress.calls.length,0)}
 }
 console.log('PASS: explicit loopback endpoints accepted; arbitrary hosts, credentials and values rejected before network calls');
 }finally{delete globalThis.__egress}
})().catch(e=>{console.error(e);process.exitCode=1});
