const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {safeImageDiagnostic}=require('../desktop/services/image-diagnostic.cjs')
const {createCloudFetch,cloudResponseError}=require('../desktop/services/cloud-transport.cjs')
const {HealthPool}=require('../tools/cloud-egress/router.cjs')
test('cloud business diagnostics persist only allowed fields, never provider text',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-p0-')),logPath=path.join(root,'network.jsonl')
 try{
  const diagnostic={version:1,phase:'dns',networkCode:'ENOTFOUND',observedNode:'primary',at:Date.now(),upstreamRequestId:'req_abcdefgh',prompt:'secret-prompt',url:'secret-url'}
  const response=Response.json({error:{code:'image_result_unknown',request_state:'unknown',diagnostic,message:'Safe user-facing message'}},{status:502})
  const fetch=createCloudFetch({session:{fetch:async()=>response},logPath,appVersion:'test'})
  const result=await fetch('https://example.test/v1/images/generations',{method:'POST'}),error=cloudResponseError(result,await result.json())
  assert.equal(error.requestState,'unknown');assert.equal(error.imageDiagnostic.phase,'dns')
  const text=fs.readFileSync(logPath,'utf8');assert(!text.includes('secret'));assert(text.includes('image_failure'))
  assert.equal(safeImageDiagnostic({...diagnostic,phase:'secret'}),null)
  assert.equal(safeImageDiagnostic({...diagnostic,networkCode:'secret',observedNode:'secret'}).networkCode,null)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('repeated health failures count state changes only; warning expires after five minutes',()=>{
 let now=1000;const pool=new HealthPool([{id:'primary',port:10818},{id:'backup',port:10828}],{now:()=>now})
 pool.record('primary',true);pool.record('backup',true)
 for(let round=0;round<2;round++){pool.record('primary',false);pool.record('primary',false);for(let i=0;i<3;i++)pool.record('primary',true);now+=1000}
 assert.equal(pool.snapshot().nodes[0].unstable,true);assert.equal(pool.snapshot().status,'healthy')
 now+=300001;pool.record('primary',true);pool.record('backup',true);assert.equal(pool.snapshot().nodes[0].unstable,false)
 const another=new HealthPool([{id:'primary',port:10818}],{now:()=>now});for(let i=0;i<100;i++)another.record('primary',false);assert.equal(another.snapshot().nodes[0].unstable,false)
})
test('account display separates confirmed and pending, old gateway is not called confirmed',async()=>{
 const root=path.resolve(__dirname,'../.local/p0-20261109'),outfile=path.join(root,'account-ui.cjs'),source=path.resolve(__dirname,'../src/settings/SettingsWorkspace.tsx')
 await require('esbuild').build({entryPoints:[source],outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom','lucide-react'],loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'},plugins:[{name:'test-export',setup(b){b.onLoad({filter:/SettingsWorkspace\.tsx$/},()=>({contents:fs.readFileSync(source,'utf8')+'\nexport {CloudAccountModule};',loader:'tsx',resolveDir:path.dirname(source)}))}}]})
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{CloudAccountModule}=require(outfile)
 const quota={id:'cny',limitMicros:100000000,spentMicros:20000000,reservedMicros:0,remainingMicros:80000000,currency:'CNY',periodEnd:'2026-12-01T00:00:00Z'}
 const render=(totals,quotas,byCurrency)=>renderToStaticMarkup(React.createElement(CloudAccountModule,{state:{cloud:{status:'authenticated',account:{displayName:'Fixture',username:'fixture',role:'member'},quota,quotas,usage:{totals,byCurrency}}},replaceState(){},action(){},onOpenUpdates(){}}))
 const current=render({actual_micros:20000000,confirmed_micros:5000000,uncertain_micros:15000000});assert.match(current,/已确认消费/);assert.match(current,/待核对额度/);assert.match(current,/5\.00/);assert.match(current,/15\.00/)
 const legacy=render({actual_micros:20000000});assert(!legacy.includes('已确认消费'));assert.match(legacy,/账面用量（含待核对）/);assert.match(legacy,/旧网关暂未提供/)
 const dual=render({request_count:27,confirmed_micros:99000000},[quota,{...quota,id:'usd',currency:'USD',limitMicros:50000000,spentMicros:12000000,reservedMicros:2000000,remainingMicros:36000000}],[
  {currency:'CNY',confirmed_micros:5000000,uncertain_micros:15000000},{currency:'USD',confirmed_micros:7000000,uncertain_micros:3000000},
 ])
 assert.match(dual,/人民币本期额度使用比例.*aria-valuenow="20"/)
 assert.match(dual,/美元本期额度使用比例.*aria-valuenow="28"/)
 assert.match(dual,/模型请求<\/span><strong>27<\/strong>/)
 assert.match(dual,/人民币 已确认消费<\/span><strong>¥5\.00<\/strong>/)
 assert.match(dual,/美元 已确认消费<\/span><strong>US\$7\.00<\/strong>/)
 assert.match(dual,/美元 待核对额度<\/span><strong>US\$3\.00<\/strong>/)
 assert.doesNotMatch(dual,/99\.00/)
})
