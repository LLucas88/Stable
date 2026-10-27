'use strict'
// Synthetic account, in-memory SQLite, real auth/quota/route code; all paid endpoints mocked.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../..'), source = path.resolve(process.argv[2] || path.join(root, '.local/ecs-production/source'))
const overlay = path.join(__dirname, 'overlay'), out = path.join(root, '.local/deepseek-web-verification')
async function main() {
  fs.mkdirSync(out, { recursive:true })
  const entry = `export {handleWebTool} from '${path.join(overlay,'lib/server/web-tools.ts').replace(/\\/g,'/')}';export {hashSessionToken} from '${path.join(source,'lib/server/crypto.ts').replace(/\\/g,'/')}';export {openAiError} from '${path.join(source,'lib/server/http.ts').replace(/\\/g,'/')}';`
  await require('esbuild').build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:path.join(out,'gateway.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture-env',setup(build){
    build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'fixture',namespace:'env'}))
    build.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env = globalThis.__webFixtureEnv',loader:'js'}))
    build.onResolve({filter:/^@\//},args=>{const candidate=path.join(overlay,args.path.slice(2))+'.ts';return {path:fs.existsSync(candidate)?candidate:path.join(source,args.path.slice(2))+'.ts'}})
    build.onResolve({filter:/^\.\.?\//},args=>{if(!args.resolveDir.startsWith(overlay))return;const base=path.resolve(args.resolveDir,args.path);for(const ext of ['', '.ts', '.js']){if(fs.existsSync(base+ext))return {path:base+ext};const fallback=path.join(source,path.relative(overlay,base))+ext;if(fs.existsSync(fallback))return {path:fallback}}})
  }}]})
  const {SqliteD1} = await import(pathToFileURL(path.join(source,'runtime/sqlite-d1.mjs')))
  const db = new SqliteD1(':memory:'), sql = db.database
  for(const file of fs.readdirSync(path.join(source,'drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)&&f!=='0011_web_tools.sql').sort())sql.exec(fs.readFileSync(path.join(source,'drizzle',file),'utf8'))
  sql.exec(fs.readFileSync(path.join(overlay,'drizzle/0011_web_tools.sql'),'utf8'))
  globalThis.__webFixtureEnv = { DB:db,SESSION_TOKEN_PEPPER:'synthetic-pepper',ALLOWED_UPSTREAM_ORIGINS:'https://api.deepseek.com',DEEPSEEK_WEB_API_KEY:'synthetic-provider-key' }
  const {handleWebTool,hashSessionToken,openAiError} = require(path.join(out,'gateway.cjs'))
  const token = 'synthetic-device-token', hash = await hashSessionToken(token,'synthetic-pepper')
  sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('test','tester','Tester','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1);
    INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('quota','test','CNY',1000,0,0,0,9999999999999,'active',1,1);`)
  for (const op of ['search','fetch']) {
    sql.prepare("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES(?,?,'deepseek',?,'https://api.deepseek.com','DEEPSEEK_WEB_API_KEY',1000,1,'active',1,1)").run('deepseek-'+op,'DeepSeek '+op,'deepseek-'+op)
    sql.prepare("INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,effective_at,created_at) VALUES(?,?,'CNY',0,0,0,1)").run(op+'-price','deepseek-'+op)
  }
  sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('session','test',?,1,'device','Fixture','win32','test',9999999999999,1,1)").run(hash)
  let calls = 0, mode = 'success', gate
  const originalFetch = globalThis.fetch, checks = [], bodies = []
  const check = (name, ok) => { assert.ok(ok,name); checks.push(name) }
  const totals = () => sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get()
  const fixtureResult = {title:'Official fixture',url:'https://example.org/source',summary:'Evidence',snippet:'short',content:'',date:null}
  globalThis.fetch = async(url, options) => {
    calls++; assert.match(String(url), /^https:\/\/api\.deepseek\.com\/v1\/tools\/(search|fetch)$/); assert.equal(options.headers.authorization,'Bearer synthetic-provider-key')
    bodies.push(JSON.parse(options.body)); assert.equal('model' in bodies.at(-1),false)
    if(mode==='network')throw Error('private network failure')
    if(mode==='wait')await new Promise(resolve=>gate=resolve)
    if(typeof mode==='number')return new Response('PRIVATE_RAW_RESPONSE',{status:mode})
    if(mode==='malformed')return Response.json({choices:[]})
    return Response.json(String(url).endsWith('/search') ? {results:mode==='empty'?[]:[fixtureResult]} : {title:'Page',content:mode==='empty'?'':'# Markdown evidence'})
  }
  const route = async(request,op) => { try {return await handleWebTool(request,op)} catch(e){return openAiError(e)} }
  const call = async(key,op='search',body,authorization=token) => {
    const response=await route(new Request('https://gateway.test/v1/tools/'+op,{method:'POST',headers:{authorization:'Bearer '+authorization,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(body||(op==='search'?{query:'fixture',count:2,need_content:false}:{url:'https://example.org/article'}))}),op)
    return {status:response.status,body:await response.json()}
  }
  try {
    check('unauthorized request rejected',(await call('web-invalid-auth','search',undefined,'invalid')).status===401&&calls===0)
    check('invalid query rejected',(await call('web-invalid-query','search',{query:'x'.repeat(129)})).status===400&&calls===0)
    for(const url of ['http://localhost','http://127.0.0.1','http://[::ffff:127.0.0.1]','https://u:p@example.org','file:///secret'])assert.equal((await call('web-private-url','fetch',{url})).status,400)
    check('private URLs rejected before supplier',calls===0)
    check('missing price fails closed',(await call('web-missing-price')).status===503&&calls===0)
    sql.exec("INSERT INTO web_tool_prices VALUES('search-price',10),('fetch-price',20)")
    const first=await call('web-search-ok');check('search result settles per request',first.status===200&&totals().spent_micros===10&&calls===1)
    const replay=await call('web-search-ok');check('idempotent replay does not charge or request again',replay.status===200&&JSON.stringify(first.body)===JSON.stringify(replay.body)&&totals().spent_micros===10&&calls===1)
    check('conflicting key rejected',(await call('web-search-ok','search',{query:'different'})).status===409&&calls===1)
    check('cross-operation key rejected',(await call('web-search-ok','fetch')).status===409&&calls===1)
    assert.throws(()=>sql.exec("UPDATE web_tool_prices SET request_micros=30 WHERE price_version_id='search-price'"),/web_price_version_in_use/)
    check('used prices immutable',sql.prepare("SELECT request_micros FROM web_tool_prices WHERE price_version_id='search-price'").get().request_micros===10)
    check('fetch returns Markdown and uses own price',(await call('web-fetch-ok','fetch')).body.content==='# Markdown evidence'&&totals().spent_micros===30)
    mode='empty';const beforeEmpty=totals().spent_micros
    check('empty search is successful and free',(await call('web-empty-search')).status===200&&totals().spent_micros===beforeEmpty)
    check('empty fetch is free',(await call('web-empty-fetch','fetch')).status===200&&totals().spent_micros===beforeEmpty)
    mode='wait';const pending=call('web-concurrent');while(!gate)await new Promise(r=>setImmediate(r));const beforeDuplicate=calls
    check('concurrent duplicate cannot reach supplier',(await call('web-concurrent')).status===409&&calls===beforeDuplicate);gate();assert.equal((await pending).status,200)
    for(const status of [401,402,403,404,429,500,504]) {
      mode=status;const before=totals().spent_micros;const failed=await call('web-error-'+status,status===404?'fetch':'search')
      assert.equal(failed.status,status===401?502:status);assert.equal(totals().spent_micros,before);assert.equal(totals().reserved_micros,0);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_RAW_RESPONSE|synthetic-provider-key/)
      if(status===402)assert.equal(failed.body.error.code,'upstream_insufficient_balance')
    }
    check('all documented failure statuses release quota and preserve safe errors',true)
    mode='network';assert.equal((await call('web-unknown')).status,502);const beforeUnknown=calls
    check('unknown submission is not automatically retried',(await call('web-unknown')).status===409&&calls===beforeUnknown)
    mode='malformed';check('invalid success body is recorded as uncertain',(await call('web-malformed')).body.error.code==='web_invalid_response')
    mode='success'
    // Full desktop provider -> authenticated loopback -> server route -> mock supplier chain.
    const {CloudGatewayProxy}=require(path.join(root,'desktop/services/cloud-gateway-proxy.cjs'))
    const {ClaudeMessagesBridge}=require(path.join(root,'desktop/services/claude-messages-bridge.cjs'))
    const proxy=new CloudGatewayProxy({account:{baseURL:'https://gateway.test',token:()=>token},fetchImpl:async(url,options)=>route(new Request(url,options),url.endsWith('/search')?'search':'fetch')})
    await proxy.start()
    try {
      const bridge=new ClaudeMessagesBridge({model:{id:'glm-chat',providerId:'stable-cloud',model:'glm-5.3-flashx',baseURL:proxy.baseURL},apiKey:proxy.secret,fetchImpl:originalFetch})
      const before=calls,spent=totals().spent_micros
      const search=await bridge.runSearch({query:'site:example.org evidence',maxResults:2}),page=await bridge.runFetch({url:search.sources[0].url})
      check('GLM session searches then fetches through full cloud chain',page.content==='# Markdown evidence'&&search.untrustedContent&&calls===before+2&&totals().spent_micros===spent+30)
    } finally {await proxy.stop()}
    const beforeQuota=calls;sql.exec('UPDATE quota_buckets SET limit_micros=spent_micros+reserved_micros')
    check('Stable quota shortage fails before supplier',(await call('web-no-quota')).body.error.code==='insufficient_quota'&&calls===beforeQuota)
    sql.exec("UPDATE accounts SET status='disabled' WHERE id='test'")
    check('disabled account cannot replay results',(await call('web-search-ok')).status===403)
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,providerCalls:calls,paidCalls:0},null,2));console.log(JSON.stringify({checks,providerCalls:calls,paidCalls:0},null,2))
  } finally {globalThis.fetch=originalFetch;db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
