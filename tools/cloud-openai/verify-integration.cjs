'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
async function main(){
 const image26=process.argv.includes('--image26-overlays'),source=path.resolve(process.argv.slice(2).find(a=>!a.startsWith('--'))||'.local/ecs-production/source'),out=path.resolve('.local/openai-key-setup/'+(image26?'image26-fixture.cjs':'fixture.cjs'))
 const file=p=>path.join(source,p).replaceAll('\\','/')
 const overrides=new Map(image26?[
  [path.resolve(source,'lib/core/openai-images.ts'),path.resolve(__dirname,'overlay/lib/core/openai-images.ts')],
  [path.resolve(source,'lib/server/openai-image-gateway.ts'),path.resolve(__dirname,'../cloud-image-recovery/overlay/lib/server/openai-image-gateway.ts')],
 ]:[])
 await require('esbuild').build({stdin:{contents:`export {POST as chat} from '${file('app/v1/responses/route.ts')}';export {POST as image} from '${file('app/v1/images/generations/route.ts')}';export {POST as edit} from '${file('app/v1/images/edits/route.ts')}';export {hashSessionToken} from '${file('lib/server/crypto.ts')}';`,resolveDir:source,loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__openaiFixtureEnv',loader:'js'}));b.onResolve({filter:/^@\//},a=>({path:path.join(source,a.path.slice(2))+'.ts'}))
 if(image26){
  b.onLoad({filter:/\.ts$/},a=>{const override=overrides.get(path.resolve(a.path));if(override)return {contents:fs.readFileSync(override,'utf8'),loader:'ts',resolveDir:path.dirname(a.path)}})
  b.onResolve({filter:/^\.\/openai-fetch$/},()=>({path:'egress',namespace:'image26-egress'}))
  b.onLoad({filter:/.*/,namespace:'image26-egress'},()=>({contents:`import {AppError} from ${JSON.stringify(file('lib/server/http.ts'))};export async function providerFetch(request){return globalThis.fetch(request)};export async function assertOpenAIEgressReady(){globalThis.__image26EgressChecks++;if(globalThis.__image26EgressDown)throw new AppError(503,'openai_egress_unavailable','Fixture egress unavailable')}`,loader:'js',resolveDir:source}))
 }
 }}]})
 const {SqliteD1}=await import(pathToFileURL(file('runtime/sqlite-d1.mjs')))
 const db=new SqliteD1(':memory:'),sql=db.database
 for(const f of fs.readdirSync(file('drizzle')).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync(file('drizzle/'+f),'utf8'))
 globalThis.__openaiFixtureEnv={DB:db,SESSION_TOKEN_PEPPER:'fixture-pepper',ALLOWED_UPSTREAM_ORIGINS:'https://api.openai.com,https://open.bigmodel.cn,https://proxy.fixture.invalid',OPENAI_API_KEY:'synthetic-key',ZHIPU_API_KEY:'synthetic-key'}
 globalThis.__image26EgressDown=false;globalThis.__image26EgressChecks=0
 const api=require(out),token='synthetic-device-token';const hash=await api.hashSessionToken(token,'fixture-pepper')
 sql.exec(`INSERT INTO accounts(id,username,display_name,role,status,password_algorithm,password_hash,password_salt,password_iterations,must_change_password,auth_version,created_at,updated_at) VALUES('test','tester','Tester','member','active','pbkdf2-sha256','hash','salt',100000,0,1,1,1);
 INSERT INTO quota_buckets(id,account_id,currency,limit_micros,spent_micros,reserved_micros,period_start,period_end,status,created_at,updated_at) VALUES('quota','test','CNY',1000000000,0,0,0,9999999999999,'active',1,1);`)
 sql.prepare("INSERT INTO sessions(id,account_id,token_hash,auth_version,device_id,device_name,platform,app_version,expires_at,last_seen_at,created_at) VALUES('session','test',?,1,'device','Fixture','win32','test',9999999999999,1,1)").run(hash)
 for(const id of ['gpt-6.1-sol','gpt-image-2.5-sunburst','gpt-image-2.5-flare',...(image26?['gpt-image-2.6-sunburst','gpt-image-2.6-flare']:[])]){
 sql.prepare("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES(?,?,'openai',?,'https://api.openai.com/v1','OPENAI_API_KEY',1050000,128000,'active',1,1)").run(id,id,id)
 const policy={version:1,kind:'openai-cache',source:'https://openai.com',verifiedAt:'2026-10-29',tiers:[{label:'fixture',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:5000000}]}
 if(id.startsWith('gpt-image-'))policy.imageInput={inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:500000};
 if(id.startsWith('gpt-image-2.6-')){policy.imageOutputFormats=['svg','gif'];policy.svgAuthor={model:'fixture-svg-author',inputMicrosPerMillion:3000000,outputMicrosPerMillion:4000000,maxInputTokens:20,maxOutputTokens:30};}
 sql.prepare("INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,pricing_policy_json,effective_at,created_at) VALUES(?,?,'CNY',1000000,5000000,?,0,1)").run(id+'-price',id,JSON.stringify(policy))
 }
 const inputImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
 const reference={id:require('node:crypto').createHash('sha256').update(inputImage).digest('hex'),mimeType:'image/png',data:inputImage.toString('base64')};
 sql.exec("INSERT INTO models(id,display_name,provider,upstream_model,upstream_base_url,secret_name,context_window,max_output_tokens,status,created_at,updated_at) VALUES('glm-image','GLM Image','z.ai','glm-image','https://open.bigmodel.cn/api/paas/v4','ZHIPU_API_KEY',1000,100,'active',1,1); INSERT INTO model_prices(id,model_id,currency,input_micros_per_million,output_micros_per_million,effective_at,created_at) VALUES('glm-image-price','glm-image','CNY',0,0,0,1); INSERT INTO image_prices(price_version_id,image_micros) VALUES('glm-image-price',100000);");
 const original=globalThis.fetch;let calls=0,mode='success', finishHeld,lastUpstream
 globalThis.fetch=async (request,init)=>{request=request instanceof Request?request:new Request(request,init);if(request.url.endsWith('/responses/input_tokens')){assert.equal(request.headers.get('authorization'),'Bearer synthetic-key');return Response.json({object:'response.input_tokens',input_tokens:20})}calls++;const editing=request.url.endsWith('/edits');let b;
 if(editing&&request.headers.get('content-type')?.startsWith('multipart/form-data')){const form=await request.formData();b=Object.fromEntries(form);const files=form.getAll('image[]');assert.equal(files.length,1);assert.deepEqual(Buffer.from(await files[0].arrayBuffer()),inputImage);assert.equal(files[0].type,'image/png');b.n=Number(b.n);}
 else {b=await request.json();if(editing){assert(image26);assert.deepEqual(b.images,[{image_url:'data:image/png;base64,'+reference.data}]);assert.equal(b.references,undefined);for(const name of ['mask','markup'])if(b[name])assert.deepEqual(b[name],{image_url:'data:image/png;base64,'+reference.data});}}
 lastUpstream={body:b,contentType:request.headers.get('content-type'),url:request.url};assert.equal(request.headers.get('authorization'),'Bearer synthetic-key');if(mode==='balance')return new Response('',{status:402});if(mode==='network')throw Error('fixture outage');
 if(mode==='moderation')return Response.json({error:{code:'moderation_blocked',param:'prompt',message:'PRIVATE_PROMPT_AND_SECRET',moderation_details:{moderation_stage:'output',internal:'PRIVATE'}}},{status:400,headers:{'x-request-id':'req_fixture123456'}})
 if(mode==='timeout')return new Response('',{status:408})
 if(mode==='hold')await new Promise(resolve=>{finishHeld=resolve})
 if(b.model==='glm-image')return Response.json({data:[{url:'https://cdn.example/fixture.png'}]})
 if(request.url.endsWith('/responses')){assert.equal(b.store,false);return new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'response_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'fixture reply'}]}],usage:{input_tokens:20,output_tokens:3,input_tokens_details:{cached_tokens:0,cache_write_tokens:10}}}})+'\n\n',{headers:{'content-type':'text/event-stream'}})}
 assert.equal(b.n,1);assert(['png',...(image26?['svg','gif']:[])].includes(b.output_format));return Response.json({data:[{b64_json:Buffer.from('fixture image').toString('base64')}],...(image26?{output_format:b.output_format}:{}),usage:{input_tokens:editing?30:10,output_tokens:20,input_tokens_details:{text_tokens:10,image_tokens:editing?20:0}},...(b.output_format==='svg'&&mode!=='svg-missing-usage'?{svg_usage:{model:'fixture-svg-author',input_tokens:2,output_tokens:3,total_tokens:5}}:{})})}
 const call=(kind,key,body,auth=token)=>api[kind](new Request('https://fixture/v1/'+kind,{method:'POST',headers:{authorization:'Bearer '+auth,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(body)}))
 const image={model:'gpt-image-2.5-sunburst',prompt:'coffee',size:'1024x1024',quality:'low',background:'opaque'}
 try{
 assert.equal((await call('image','auth-failed-001',image,'invalid')).status,401);assert.equal(calls,0)
 const a=await call('image','image-good-001',image);assert.equal(a.status,200,await a.clone().text());assert.ok((await a.json()).data[0].b64_json);assert.equal(sql.prepare('SELECT spent_micros FROM quota_buckets').get().spent_micros,110)
 assert.equal((await call('image','image-good-001',image)).status,200);assert.equal(calls,1)
 assert.equal((await call('image','image-good-001',{...image,quality:'high'})).status,409);assert.equal(calls,1)
 const edit={...image,references:[reference]};
 assert.equal((await call('edit','edit-auth-fail',edit,'invalid')).status,401);
 assert.equal((await call('edit','edit-bad-sha',{...edit,references:[{...reference,id:'a'.repeat(64)}]})).status,400);assert.equal(calls,1);
 const edited=await call('edit','edit-good-001',edit);assert.equal(edited.status,200,await edited.clone().text());assert.equal(calls,2);assert.equal(sql.prepare('SELECT spent_micros FROM quota_buckets').get().spent_micros,260);
 const billing=JSON.parse(sql.prepare("SELECT billing_snapshot_json FROM gateway_requests WHERE idempotency_key='edit-good-001'").get().billing_snapshot_json);assert.equal(billing.imageTokens,20);assert.equal(billing.actualMicros,150);
 const priceRow=sql.prepare("SELECT pricing_policy_json FROM model_prices WHERE id='gpt-image-2.5-sunburst-price'").get();
 const noImagePrice=JSON.parse(priceRow.pricing_policy_json);delete noImagePrice.imageInput;
 sql.prepare("UPDATE model_prices SET pricing_policy_json=? WHERE id='gpt-image-2.5-sunburst-price'").run(JSON.stringify(noImagePrice));
 assert.equal((await call('edit','edit-missing-price',edit)).status,503);assert.equal(calls,2);
 sql.prepare("UPDATE model_prices SET pricing_policy_json=? WHERE id='gpt-image-2.5-sunburst-price'").run(priceRow.pricing_policy_json);
 assert.equal((await call('edit','edit-good-001',edit)).status,200);assert.equal(calls,2);
 assert.equal((await call('edit','edit-good-001',{...edit,prompt:'changed'})).status,409);assert.equal(calls,2);
 const c=await call('chat','chat-good-001',{model:'gpt-6.1-sol',input:[{role:'user',content:'hi'}],max_output_tokens:32,store:false,stream:true});assert.equal(c.status,200,await c.clone().text());await c.text();assert.equal(sql.prepare('SELECT spent_micros FROM quota_buckets').get().spent_micros,298)
 mode='balance';assert.equal((await call('image','image-balance-001',image)).status,402);assert.equal(sql.prepare("SELECT state FROM gateway_requests WHERE idempotency_key='image-balance-001'").get().state,'released')
 mode='network';assert.equal((await call('image','image-unknown-001',image)).status,502);const before=calls;assert.equal((await call('image','image-unknown-001',image)).status,409);assert.equal(calls,before)
 const uncertain=await call('edit','edit-unknown-001',edit);assert.equal(uncertain.status,502);const editCalls=calls;
 assert.equal((await call('edit','edit-unknown-001',edit)).status,409);assert.equal(calls,editCalls);
 mode='moderation';const blocked=await call('image','image-rejected-400',image);assert.equal(blocked.status,422);
 const failure=await blocked.json();assert.equal(failure.error.code,'image_generation_failed');assert.equal(failure.error.reason,'moderation_blocked');assert.match(failure.error.message,/生成结果.*审核/);assert(!JSON.stringify(failure).includes('PRIVATE'));
 assert.match(blocked.headers.get('x-stable-request-id'),/^req_/);
 const stored=sql.prepare("SELECT r.id,r.state,r.actual_micros,f.failure_json FROM gateway_requests r JOIN gateway_image_failures f ON f.request_id=r.id WHERE r.idempotency_key='image-rejected-400'").get();assert.equal(stored.state,'released');assert.equal(stored.actual_micros,0);assert(!stored.failure_json.includes('PRIVATE'));
 const rejectedCalls=calls;const repeated=await call('image','image-rejected-400',image);assert.equal(repeated.status,422);assert.deepEqual(await repeated.json(),failure);assert.equal(calls,rejectedCalls);
 sql.prepare('DELETE FROM gateway_image_failures WHERE request_id=?').run(stored.id);
 const legacy=await call('image','image-rejected-400',image);assert.equal(legacy.status,422);assert.equal((await legacy.json()).error.code,'image_generation_failed');assert.equal(calls,rejectedCalls);
 for(const code of ['upstream_408','upstream_409','upstream_500','unknown_legacy_release']){sql.prepare('UPDATE gateway_requests SET failure_code=? WHERE id=?').run(code,stored.id);const unknown=await call('image','image-rejected-400',image);assert.equal(unknown.status,409);assert.equal((await unknown.json()).error.code,'image_result_unknown');assert.equal(calls,rejectedCalls);}
 sql.prepare("UPDATE gateway_requests SET failure_code='upstream_400' WHERE id=?").run(stored.id);
 assert.equal((await call('image','image-rejected-400',{...image,prompt:'changed'})).status,409);
 mode='timeout';assert.equal((await call('image','image-408-unknown',image)).status,502);const timeoutCalls=calls;
 assert.equal(sql.prepare("SELECT state FROM gateway_requests WHERE idempotency_key='image-408-unknown'").get().state,'uncertain');assert.equal((await call('image','image-408-unknown',image)).status,409);assert.equal(calls,timeoutCalls);
 mode='hold';const holdCalls=calls;const first=call('image','image-concurrent-001',image),second=call('image','image-concurrent-001',image);
 const processing=await Promise.race([first,second]);assert.equal(processing.status,202);assert.equal((await processing.json()).task_status,'PROCESSING');
 while(!finishHeld)await new Promise(resolve=>setImmediate(resolve));finishHeld();
 const pair=await Promise.all([first,second]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,202]);assert.equal(calls,holdCalls+1);assert.equal((await call('image','image-concurrent-001',image)).status,200);assert.equal(calls,holdCalls+1);
 mode='success';assert.equal((await call('image','user-new-attempt-001',{...image,prompt:'user corrected request'})).status,200);
 const glm={model:'glm-image',prompt:'fixture',size:'1024x1024',quality:'hd'};
 mode='moderation';assert.equal((await call('image','glm-rejected-400',glm)).status,422);const glmCalls=calls;const glmReplay=await call('image','glm-rejected-400',glm);assert.equal(glmReplay.status,422);assert.equal((await glmReplay.json()).error.code,'image_generation_failed');assert.equal(calls,glmCalls);
 if(image26){
  mode='success';const image26Body={...image,model:'gpt-image-2.6-sunburst',complexity:'low'};
  const row=key=>sql.prepare('SELECT * FROM gateway_requests WHERE idempotency_key=?').get(key);
  const generated=await call('image','image26-static',image26Body);assert.equal(generated.status,200,await generated.clone().text());assert.equal(row('image26-static').actual_micros,110);assert.equal(lastUpstream.body.complexity,'low');
  for(const layer of ['mask','markup']){
   const body={...image26Body,references:[reference],[layer]:reference},key='image26-edit-'+layer;
   const response=await call('edit',key,body);assert.equal(response.status,200,await response.clone().text());assert.match(lastUpstream.contentType,/application\/json/);assert.equal(lastUpstream.body[layer].image_url,'data:image/png;base64,'+reference.data);assert.equal(row(key).actual_micros,150);
   const billed=JSON.parse(row(key).billing_snapshot_json);assert.equal(billed.imageTokens,20);assert.equal(billed.svgCost,0);
  }
  const priorCalls=calls;assert.equal((await call('edit','image26-layers-conflict',{...image26Body,references:[reference],mask:reference,markup:reference})).status,400);assert.equal(calls,priorCalls);assert.equal(row('image26-layers-conflict'),undefined);
  const svgBody={...image26Body,output_format:'svg'};const svg=await call('image','image26-svg',svgBody);assert.equal(svg.status,200,await svg.clone().text());assert.equal((await svg.json()).svg_usage.model,'fixture-svg-author');
  const svgBill=JSON.parse(row('image26-svg').billing_snapshot_json);assert.equal(svgBill.imageCost,110);assert.equal(svgBill.svgCost,18);assert.equal(svgBill.actualMicros,128);assert.equal(row('image26-svg').actual_micros,128);
  mode='svg-missing-usage';const svgMissing=await call('image','image26-svg-unknown',svgBody);assert.equal(svgMissing.status,502);assert.equal(row('image26-svg-unknown').state,'uncertain');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM gateway_image_results WHERE request_id=?').get(row('image26-svg-unknown').id).n,0);const svgCalls=calls;assert.equal((await call('image','image26-svg-unknown',svgBody)).status,409);assert.equal(calls,svgCalls);
  mode='success';const gifBody={...image26Body,output_format:'gif',frame_count:2,frame_duration_ms:100};const gif=await call('image','image26-gif',gifBody);assert.equal(gif.status,200,await gif.clone().text());assert.equal((await gif.json()).output_format,'gif');assert.equal(lastUpstream.body.frame_count,2);assert.equal(lastUpstream.body.frame_duration_ms,100);assert.equal(row('image26-gif').actual_micros,110);
  const gifEdit=await call('edit','image26-gif-reference',{...gifBody,references:[reference]});assert.equal(gifEdit.status,200,await gifEdit.clone().text());assert.equal(row('image26-gif-reference').actual_micros,150);
  const failedFormatCalls=calls;assert.equal((await call('image','image26-gif-frame-invalid',{...gifBody,frame_count:17})).status,400);assert.equal(calls,failedFormatCalls);
  const policy26Row=sql.prepare("SELECT pricing_policy_json FROM model_prices WHERE id='gpt-image-2.6-sunburst-price'").get();const disabled=JSON.parse(policy26Row.pricing_policy_json);delete disabled.svgAuthor;sql.prepare("UPDATE model_prices SET pricing_policy_json=? WHERE id='gpt-image-2.6-sunburst-price'").run(JSON.stringify(disabled));
  const quotaBeforeFormats=sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get();
  const noSvgPrice=await call('image','image26-svg-unconfigured',svgBody);assert.equal(noSvgPrice.status,400);assert.equal((await noSvgPrice.json()).error.code,'image_format_not_configured');assert.equal(calls,failedFormatCalls);assert.equal(row('image26-svg-unconfigured'),undefined);
  disabled.imageOutputFormats=[];sql.prepare("UPDATE model_prices SET pricing_policy_json=? WHERE id='gpt-image-2.6-sunburst-price'").run(JSON.stringify(disabled));
  for(const format of ['svg','gif']){const key='image26-disabled-'+format,response=await call('image',key,{...image26Body,output_format:format});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'image_format_not_enabled');assert.equal(row(key),undefined);}
  assert.equal(calls,failedFormatCalls);assert.deepEqual(sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get(),quotaBeforeFormats);
  const afterDisabled=await call('image','image26-png-after-disabled',image26Body);assert.equal(afterDisabled.status,200,await afterDisabled.clone().text());assert.equal(row('image26-png-after-disabled').state,'settled');
  sql.prepare("UPDATE model_prices SET pricing_policy_json=? WHERE id='gpt-image-2.6-sunburst-price'").run(policy26Row.pricing_policy_json);
  assert.equal((await call('edit','image25-multipart-preserved',edit)).status,200);assert.match(lastUpstream.contentType,/multipart\/form-data/);
  globalThis.__image26EgressDown=true;const outageCalls=calls,checks=globalThis.__image26EgressChecks,quotaBefore=sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get();
  const unavailable=await call('image','image26-egress-down',image26Body);assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error.code,'openai_egress_unavailable');assert.equal(row('image26-egress-down'),undefined);assert.deepEqual(sql.prepare('SELECT spent_micros,reserved_micros FROM quota_buckets').get(),quotaBefore);assert.equal(calls,outageCalls);assert.equal(globalThis.__image26EgressChecks,checks+1);
  assert.equal((await call('image','image26-static',image26Body)).status,200);assert.equal(globalThis.__image26EgressChecks,checks+1);assert.equal(calls,outageCalls);
  sql.prepare("UPDATE models SET upstream_base_url='https://proxy.fixture.invalid/v1',upstream_model='proxy-image26-alias' WHERE id='gpt-image-2.6-sunburst'").run();
  const proxy=await call('image','image26-proxy-egress',image26Body);assert.equal(proxy.status,200,await proxy.clone().text());assert.equal(globalThis.__image26EgressChecks,checks+1);assert.equal(lastUpstream.url,'https://proxy.fixture.invalid/v1/images/generations');assert.equal(lastUpstream.body.model,'proxy-image26-alias');
  sql.prepare("UPDATE models SET upstream_base_url='https://api.openai.com/v1',upstream_model=id WHERE id='gpt-image-2.6-sunburst'").run();globalThis.__image26EgressDown=false;
  console.log('PASS Image 2.6 overlays: real handlers + in-memory SQLite; JSON mask/markup edits, SVG double billing and missing-usage uncertainty, GIF frames/reference, legacy multipart, official egress pre-reservation, replay during outage, proxy origin/alias; synthetic upstream only')
 }
 console.log('PASS: multipart reference pixels, image-input billing, real auth/quota/SQLite + mock OpenAI; Responses settlement includes cache writes; image token settlement, replay, conflict, balance and uncertain-result protections')
 }finally{globalThis.fetch=original;delete globalThis.__image26EgressDown;delete globalThis.__image26EgressChecks;sql.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
