'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
async function main(){
 const source=path.resolve(process.argv[2]||'.local/ecs-production/source');
 const dir=fs.mkdtempSync(path.resolve('.local/quota-fix-20261104/fixture-')),out=path.join(dir,'gateway.cjs');
 const file=p=>path.join(source,p).replaceAll('\\','/');
 await require('esbuild').build({stdin:{contents:`export {POST} from '${file('app/v1/responses/route.ts')}';export {hashSessionToken} from '${file('lib/server/crypto.ts')}';`,resolveDir:source,loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__quotaFixtureEnv',loader:'js'}));b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}));
 }}]});
 const {SqliteD1}=await import(pathToFileURL(file('runtime/sqlite-d1.mjs'))),db=new SqliteD1(':memory:'),sql=db.database;
 for(const f of fs.readdirSync(file('drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync(file('drizzle/'+f),'utf8'));
 const {D1_INVARIANT_STATEMENTS}=await import(pathToFileURL(file('db/invariants.ts')));for(const statement of D1_INVARIANT_STATEMENTS)sql.exec(statement);
 globalThis.__quotaFixtureEnv={DB:db,SESSION_TOKEN_PEPPER:'fixture-pepper',ALLOWED_UPSTREAM_ORIGINS:'https://api.openai.com',OPENAI_API_KEY:'synthetic-key'};
 const api=require(out),token='synthetic-device-token',hash=await api.hashSessionToken(token,'fixture-pepper');
 const model={id:'gpt-6.1-sol',price:{pricingPolicy:{version:1,kind:'openai-cache',source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol',verifiedAt:'2026-11-04',tiers:[{label:'standard',inputMicrosPerMillion:14400000,cachedInputMicrosPerMillion:720000,outputMicrosPerMillion:72000000,promptLessThan:272001},{label:'long-context',inputMicrosPerMillion:28800000,cachedInputMicrosPerMillion:1440000,outputMicrosPerMillion:108000000}]}}};
 sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('test','fixture','Fixture','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1);
 INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('quota','test','CNY',100000000,45099912,0,0,9999999999999,'active',1,1);`);
 sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('session','test',?,1,'device','Fixture','win32','test',9999999999999,1,1)").run(hash);
 sql.prepare("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES(?,?,'openai',?,'https://api.openai.com/v1','OPENAI_API_KEY',1050000,128000,'active',1,1)").run(model.id,model.id,model.id);
 sql.prepare("INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,pricing_policy_json,effective_at,created_at) VALUES('price',?,'CNY',14400000,72000000,?,0,1)").run(model.id,JSON.stringify(model.price.pricingPolicy));
 sql.prepare("INSERT INTO gateway_requests(id,account_id,quota_bucket_id,model_id,price_version_id,idempotency_key,request_fingerprint,state,reserved_micros,actual_micros,created_at,updated_at) VALUES('prior','test','quota',?,'price','previous-hold','fingerprint','reserved',18246311,0,1,1)").run(model.id);
 const original=globalThis.fetch;let counts=0,generations=0,mode='success',held=[];
 const terminal=()=>new TextEncoder().encode('data: '+JSON.stringify({type:'response.completed',response:{id:'fixture-response',status:'completed',output:[],usage:{input_tokens:20,output_tokens:3,input_tokens_details:{cached_tokens:0,cache_write_tokens:10}}}})+'\n\n');
 globalThis.fetch=async request=>{
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-key');
  if(request.url.endsWith('/responses/input_tokens')){counts++;if(mode==='count-error')return new Response('private',{status:429});if(mode==='count-transient'){mode='success';return new Response('private',{status:503})}return Response.json({object:'response.input_tokens',input_tokens:12000})}
  assert.equal(request.url,'https://api.openai.com/v1/responses');generations++;
  if(mode==='balance')return new Response('',{status:402});
  if(mode==='hold')return new Response(new ReadableStream({start(c){held.push(c)}}),{headers:{'content-type':'text/event-stream'}});
  return new Response(terminal(),{headers:{'content-type':'text/event-stream'}});
 };
 const body={model:model.id,input:[{role:'user',content:'offline fixture'}],max_output_tokens:32768,store:false,stream:true};
 const call=(key,changes={},auth=token)=>api.POST(new Request('https://fixture/v1/responses',{method:'POST',headers:{authorization:'Bearer '+auth,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify({...body,...changes})}));
 try{
  assert.equal((await call('invalid-auth',{},'invalid')).status,401);assert.equal(counts,0);
  assert.equal((await call('spoof-count',{input_tokens:0})).status,400);assert.equal(counts,0);
  assert.equal((await call('bad')).status,400);assert.equal(counts,0);
  mode='count-error';const countFail=await call('count-error');assert.equal(countFail.status,503);assert.equal((await countFail.json()).error.code,'input_token_count_unavailable');assert.equal(generations,0);assert.equal(sql.prepare("SELECT count(*) n FROM gateway_requests WHERE id<>'prior'").get().n,0);
  mode='count-transient';const countsBefore=counts;const response=await call('target-balance');assert.equal(response.status,200,await response.clone().text());await response.text();assert.equal(counts-countsBefore,2);assert.equal(generations,1);
  const row=sql.prepare("SELECT reserved_micros,state FROM gateway_requests WHERE idempotency_key='target-balance'").get();assert.equal(row.reserved_micros,4402944);assert.equal(row.state,'settled');assert.equal(sql.prepare('SELECT reserved_micros FROM quota_buckets').get().reserved_micros,18246311);
  const before=generations;assert.equal((await call('target-balance')).status,409);assert.equal(generations,before);
  sql.exec("UPDATE gateway_requests SET state='released' WHERE id='prior'; UPDATE quota_buckets SET spent_micros=0,limit_micros=5000000 WHERE id='quota'");
  mode='hold';const both=await Promise.all([call('concurrent-a'),call('concurrent-b')]);assert.deepEqual(both.map(r=>r.status).sort(),[200,429]);assert.equal(held.length,1);assert.equal(sql.prepare('SELECT reserved_micros FROM quota_buckets').get().reserved_micros,4402944);
  const text=both.find(r=>r.ok).text();held[0].enqueue(terminal());held[0].close();await text;assert.equal(sql.prepare('SELECT reserved_micros FROM quota_buckets').get().reserved_micros,0);
  mode='balance';assert.equal((await call('provider-balance')).status,402);assert.equal(sql.prepare('SELECT reserved_micros FROM quota_buckets').get().reserved_micros,0);
  const report={passed:true,fixtureAvailableMicros:36653777,newReservationMicros:4402944,concurrency:[200,429],realProviderGenerations:0,counterCalls:counts,mockGenerations:generations};fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence:dir}));
 }finally{globalThis.fetch=original;sql.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
