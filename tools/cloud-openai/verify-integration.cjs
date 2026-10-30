'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
async function main(){
 const source=path.resolve(process.argv[2]||'.local/ecs-production/source'),out=path.resolve('.local/openai-key-setup/fixture.cjs')
 const file=p=>path.join(source,p).replaceAll('\\','/')
 await require('esbuild').build({stdin:{contents:`export {POST as chat} from '${file('app/v1/responses/route.ts')}';export {POST as image} from '${file('app/v1/images/generations/route.ts')}';export {hashSessionToken} from '${file('lib/server/crypto.ts')}';`,resolveDir:source,loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__openaiFixtureEnv',loader:'js'}));b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}))
 }}]})
 const {SqliteD1}=await import(pathToFileURL(file('runtime/sqlite-d1.mjs')))
 const db=new SqliteD1(':memory:'),sql=db.database
 for(const f of fs.readdirSync(file('drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync(file('drizzle/'+f),'utf8'))
 globalThis.__openaiFixtureEnv={DB:db,SESSION_TOKEN_PEPPER:'fixture-pepper',ALLOWED_UPSTREAM_ORIGINS:'https://api.openai.com',OPENAI_API_KEY:'synthetic-key'}
 const api=require(out),token='synthetic-device-token';const hash=await api.hashSessionToken(token,'fixture-pepper')
 sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('test','tester','Tester','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1);
 INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('quota','test','CNY',1000000000,0,0,0,9999999999999,'active',1,1);`)
 sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('session','test',?,1,'device','Fixture','win32','test',9999999999999,1,1)").run(hash)
 for(const id of ['gpt-6.1-sol','gpt-image-2.5-sunburst','gpt-image-2.5-flare']){
 sql.prepare("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES(?,?,'openai',?,'https://api.openai.com/v1','OPENAI_API_KEY',1050000,128000,'active',1,1)").run(id,id,id)
 const policy={version:1,kind:'openai-cache',source:'https://openai.com',verifiedAt:'2026-10-29',tiers:[{label:'fixture',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:5000000}]}
 sql.prepare("INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,pricing_policy_json,effective_at,created_at) VALUES(?,?,'CNY',1000000,5000000,?,0,1)").run(id+'-price',id,JSON.stringify(policy))
 }
 const original=globalThis.fetch;let calls=0,mode='success'
 globalThis.fetch=async request=>{calls++;const b=await request.json();assert.equal(request.headers.get('authorization'),'Bearer synthetic-key');if(mode==='balance')return new Response('',{status:402});if(mode==='network')throw Error('fixture outage');
 if(request.url.endsWith('/responses')){assert.equal(b.store,false);return new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'response_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'fixture reply'}]}],usage:{input_tokens:20,output_tokens:3,input_tokens_details:{cached_tokens:0,cache_write_tokens:10}}}})+'\n\n',{headers:{'content-type':'text/event-stream'}})}
 assert.equal(b.n,1);assert.equal(b.output_format,'png');return Response.json({data:[{b64_json:Buffer.from('fixture image').toString('base64')}],usage:{input_tokens:10,output_tokens:20,input_tokens_details:{text_tokens:10,image_tokens:0}}})}
 const call=(kind,key,body,auth=token)=>api[kind](new Request('https://fixture/v1/'+kind,{method:'POST',headers:{authorization:'Bearer '+auth,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(body)}))
 const image={model:'gpt-image-2.5-sunburst',prompt:'coffee',size:'1024x1024',quality:'low',background:'opaque'}
 try{
 assert.equal((await call('image','auth-failed-001',image,'invalid')).status,401);assert.equal(calls,0)
 const a=await call('image','image-good-001',image);assert.equal(a.status,200,await a.clone().text());assert.ok((await a.json()).data[0].b64_json);assert.equal(sql.prepare('SELECT spent_micros FROM quota_buckets').get().spent_micros,110)
 assert.equal((await call('image','image-good-001',image)).status,200);assert.equal(calls,1)
 assert.equal((await call('image','image-good-001',{...image,quality:'high'})).status,409);assert.equal(calls,1)
 const c=await call('chat','chat-good-001',{model:'gpt-6.1-sol',input:[{role:'user',content:'hi'}],max_output_tokens:32,store:false,stream:true});assert.equal(c.status,200,await c.clone().text());await c.text();assert.equal(sql.prepare('SELECT spent_micros FROM quota_buckets').get().spent_micros,148)
 mode='balance';assert.equal((await call('image','image-balance-001',image)).status,402);assert.equal(sql.prepare("SELECT state FROM gateway_requests WHERE idempotency_key='image-balance-001'").get().state,'released')
 mode='network';assert.equal((await call('image','image-unknown-001',image)).status,502);const before=calls;assert.equal((await call('image','image-unknown-001',image)).status,409);assert.equal(calls,before)
 console.log('PASS: real auth/quota/SQLite + mock OpenAI; Responses settlement includes cache writes; image token settlement, replay, conflict, balance and uncertain-result protections')
 }finally{globalThis.fetch=original;sql.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
