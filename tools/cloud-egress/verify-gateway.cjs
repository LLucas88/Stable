const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const source=path.resolve('.local/ecs-production/source'),out=path.resolve('.local/egress-ha-20261105/gateway-fixture.cjs'),file=p=>path.join(source,p).replaceAll('\\','/');
 await require('esbuild').build({stdin:{contents:`export {POST as image} from '${file('app/v1/images/generations/route.ts')}';export {GET as status} from '${file('app/api/admin/egress/route.ts')}';export {hashSessionToken} from '${file('lib/server/crypto.ts')}';`,loader:'ts',resolveDir:source},bundle:true,platform:'node',format:'cjs',outfile:out,plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^undici$/},()=>({path:'undici',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='env'?'export const env=globalThis.__ha.env':`export class ProxyAgent{close(){return Promise.resolve()}};export function fetch(url,options){return globalThis.__ha.fetch(url,options)}`}));
  b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}));
 }}]});
 const {SqliteD1}=await import(pathToFileURL(file('runtime/sqlite-d1.mjs'))),db=new SqliteD1(':memory:'),sql=db.database;
 for(const f of fs.readdirSync(file('drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync(file('drizzle/'+f),'utf8'));
 let healthy=false,paidCalls=0,failAfterDispatch=false;
 globalThis.__ha={env:{DB:db,SESSION_TOKEN_PEPPER:'fixture-pepper',OPENAI_API_KEY:'fixture-key',OPENAI_HTTPS_PROXY:'http://127.0.0.1:10819',ALLOWED_UPSTREAM_ORIGINS:'https://api.openai.com'},fetch:async(url,options)=>{
  if(url==='http://127.0.0.1:10819/health')return Response.json({version:1,status:healthy?'healthy':'unavailable',active:healthy?'primary':null,checkedAt:Date.now(),nodes:['primary','backup'].map(id=>({id,healthy,checkedAt:Date.now()}))});
  assert.equal(url,'https://api.openai.com/v1/images/generations');paidCalls++;if(failAfterDispatch)throw Error('network lost after submit');
  return Response.json({data:[{b64_json:Buffer.from('fixture png').toString('base64')}],usage:{input_tokens:10,output_tokens:20,input_tokens_details:{text_tokens:10,image_tokens:0}}});
 }};
 const api=require(out),token='fixture-device-token',hash=await api.hashSessionToken(token,'fixture-pepper');
 sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('a','tester','Tester','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1); INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('q','a','CNY',1000000000,0,0,0,9999999999999,'active',1,1); INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES('gpt-image-2.5-sunburst','Sunburst','openai','gpt-image-2.5-sunburst','https://api.openai.com/v1','OPENAI_API_KEY',1000,100,'active',1,1); INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,effective_at,created_at) VALUES('p','gpt-image-2.5-sunburst','CNY',1000000,5000000,0,1);`);
 sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('s','a',?,1,'d','fixture','win32','test',9999999999999,1,1)").run(hash);
 const body={model:'gpt-image-2.5-sunburst',prompt:'circle',size:'1024x1024',quality:'low',background:'opaque'};
 const call=key=>api.image(new Request('https://fixture/v1/images/generations',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)}));
 try{
  const unavailable=await call('ha-outage-001');assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error.code,'openai_egress_unavailable');assert.equal(paidCalls,0);assert.equal(sql.prepare('SELECT count(*) n FROM gateway_requests').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM quota_ledger').get().n,0);
  healthy=true;assert.equal((await call('ha-outage-001')).status,200);assert.equal(paidCalls,1);const settled=sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get();assert.equal(settled.reserved_micros,0);
  healthy=false;assert.equal((await call('ha-outage-001')).status,200);assert.equal(paidCalls,1);assert.deepEqual(sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get(),settled);
  healthy=true;failAfterDispatch=true;assert.equal((await call('ha-uncertain-001')).status,502);assert.equal(paidCalls,2);const unknown=sql.prepare("SELECT state,actual_micros,reserved_micros FROM gateway_requests WHERE idempotency_key='ha-uncertain-001'").get();assert.equal(unknown.state,'uncertain');assert.equal(unknown.actual_micros,unknown.reserved_micros);assert(unknown.actual_micros>0);const quotaAfterUnknown=sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get();
  healthy=false;assert.equal((await call('ha-uncertain-001')).status,409);assert.equal(paidCalls,2);assert.deepEqual(sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get(),quotaAfterUnknown);
  assert.equal((await api.status(new Request('https://fixture/api/admin/egress'))).status,401);
  const req=()=>new Request('https://fixture/api/admin/egress',{headers:{authorization:'Bearer '+token}});
  assert.equal((await api.status(req())).status,403);sql.exec("UPDATE accounts SET role='admin'");const admin=await api.status(req());assert.equal(admin.status,200);const data=await admin.json();assert.equal(data.status,'unavailable');assert(!JSON.stringify(data).includes('127.0.0.1'));assert(!JSON.stringify(data).includes('fixture-key'));
  console.log('PASS: real routes + SQLite: outage creates no reservation; original key can resume; saved images remain recoverable; uncertain submission never replays; admin endpoint rejects anonymous/member and redacts configuration');
 }finally{sql.close();delete globalThis.__ha;}
})().catch(e=>{console.error(e);process.exitCode=1});
