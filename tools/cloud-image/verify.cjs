'use strict'
// Local-only acceptance: real gateway/auth/quota code and SQLite triggers,
// synthetic users and a mock provider. No production DB or network access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
const root=path.resolve(__dirname,'../..'),source=path.resolve(process.argv[2]||path.join(root,'.local/ecs-production/source'))
const overlay=path.join(__dirname,'overlay'),out=path.join(root,'.local/cloud-image-verification')
async function main(){
 fs.mkdirSync(out,{recursive:true})
 const entry=`export { POST } from '${path.join(overlay,'app/v1/images/generations/route.ts').replace(/\\/g,'/')}';export {hashSessionToken} from '${path.join(source,'lib/server/crypto.ts').replace(/\\/g,'/')}';`
 await require('esbuild').build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:path.join(out,'gateway.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture-env',setup(build){
  build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'fixture',namespace:'env'}))
  build.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env = globalThis.__imageFixtureEnv',loader:'js'}))
  build.onResolve({filter:/^@\//},args=>{const candidate=path.join(overlay,args.path.slice(2))+'.ts';return {path:fs.existsSync(candidate)?candidate:path.join(source,args.path.slice(2))+'.ts'}})
  build.onResolve({filter:/^\.\.?\//},args=>{if(!args.resolveDir.startsWith(overlay))return;const base=path.resolve(args.resolveDir,args.path);for(const ext of ['', '.ts', '.js']){if(fs.existsSync(base+ext))return {path:base+ext};const fallback=path.join(source,path.relative(overlay,base))+ext;if(fs.existsSync(fallback))return {path:fallback}}})
 }}]})
 const {SqliteD1}=await import(pathToFileURL(path.join(source,'runtime/sqlite-d1.mjs')))
 const db=new SqliteD1(':memory:');const sql=db.database
 for(const file of fs.readdirSync(path.join(source,'drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)&&f!=='0010_image_gateway.sql').sort())sql.exec(fs.readFileSync(path.join(source,'drizzle',file),'utf8'))
 sql.exec(fs.readFileSync(path.join(overlay,'drizzle/0010_image_gateway.sql'),'utf8'))
 globalThis.__imageFixtureEnv={DB:db,SESSION_TOKEN_PEPPER:'synthetic-test-pepper',ALLOWED_UPSTREAM_ORIGINS:'https://open.bigmodel.cn',GLM_IMAGE_API_KEY:'synthetic-provider-key'}
 const {POST,hashSessionToken}=require(path.join(out,'gateway.cjs'))
 const token='synthetic-device-token-for-image-verification',hash=await hashSessionToken(token,'synthetic-test-pepper')
 sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('test','tester','Tester','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1);
 INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('quota','test','CNY',100,0,0,0,9999999999999,'active',1,1);
 INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES('glm-image','GLM-image','zhipu','glm-image','https://open.bigmodel.cn/api/paas/v4','GLM_IMAGE_API_KEY',1000,1,'active',1,1);
 INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,effective_at,created_at) VALUES('image-price','glm-image','CNY',0,0,0,1);`)
 sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('session','test',?,1,'device','Fixture','win32','test',9999999999999,1,1)").run(hash)
 let calls=0, mode='success',gate
 const originalFetch=globalThis.fetch
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://open.bigmodel.cn/api/paas/v4/images/generations');assert.equal(options.headers.authorization,'Bearer synthetic-provider-key');assert.equal(JSON.parse(options.body).model,'glm-image');if(mode==='balance')return new Response('private',{status:402});if(mode==='network')throw Error('unknown');if(mode==='wait')await new Promise(r=>gate=r);return Response.json({data:[{url:'https://cdn.example/generated.png'}]})}
 const call=async(key,prompt='fixture',authorization=token)=>{const r=await POST(new Request('https://gateway.test/v1/images/generations',{method:'POST',headers:{authorization:'Bearer '+authorization,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify({model:'glm-image',prompt,size:'512x512',quality:'hd'})}));return {status:r.status,body:await r.json()}}
 const checks=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name)}
 try{
 check('invalid login rejected before provider',(await call('image-auth-invalid','fixture','invalid')).status===401&&calls===0)
 check('missing image price fails closed',(await call('image-price-missing')).status===503&&calls===0)
 sql.exec("INSERT INTO image_prices VALUES('image-price',10)")
 const first=await call('image-success-001');check('successful image and real quota settlement',first.status===200&&calls===1&&sql.prepare("SELECT spent_micros FROM quota_buckets").get().spent_micros===10)
 assert.throws(()=>sql.exec("UPDATE image_prices SET image_micros=20 WHERE price_version_id='image-price'"),/image_price_version_in_use/);assert.throws(()=>sql.exec("DELETE FROM image_prices WHERE price_version_id='image-price'"),/image_price_version_in_use/);check('used image price cannot be rewritten or deleted',sql.prepare('SELECT image_micros FROM image_prices').get().image_micros===10)
 const replay=await call('image-success-001');check('replay returns original URL without provider or duplicate charge',replay.status===200&&calls===1&&JSON.stringify(replay.body)===JSON.stringify(first.body)&&sql.prepare("SELECT spent_micros FROM quota_buckets").get().spent_micros===10)
 check('same key different content rejected',(await call('image-success-001','different')).status===409&&calls===1)
 mode='wait';const pending=call('image-concurrent-01');while(!gate)await new Promise(r=>setImmediate(r));const duplicate=await call('image-concurrent-01');check('inflight duplicate cannot submit again',duplicate.status===409&&calls===2);gate();check('original concurrent request completes',(await pending).status===200)
 mode='balance';const balance=await call('image-balance-001');check('provider 402 releases quota and retains real classification',balance.status===402&&balance.body.error.code==='upstream_insufficient_balance'&&sql.prepare("SELECT reserved_micros FROM quota_buckets").get().reserved_micros===0)
 mode='network';const unknown=await call('image-network-001');const before=calls;check('unknown result never silently replays',unknown.status===502&&(await call('image-network-001')).status===409&&calls===before)
 sql.exec('UPDATE quota_buckets SET limit_micros=spent_micros+reserved_micros');mode='success';check('Stable quota shortage rejects before provider',(await call('image-quota-001')).status===429&&calls===before)
 sql.exec("UPDATE accounts SET status='disabled' WHERE id='test'");check('disabled account cannot retrieve old result',(await call('image-success-001')).status===403)
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,providerCalls:calls,paidCalls:0},null,2));console.log(JSON.stringify({checks,providerCalls:calls,paidCalls:0},null,2))
 } finally {globalThis.fetch=originalFetch;db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
