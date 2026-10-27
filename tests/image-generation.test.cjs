'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createImageGenerator, ENDPOINT, downloadImage, publicAddress, allowedImageAddress } = require('../desktop/services/image-generation.cjs')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
const { BuiltinTools } = require('../desktop/services/builtin-tools.cjs')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
const { ImageJobStore } = require('../desktop/services/image-job-store.cjs')
const nativeImage = { createFromBuffer: bytes => ({ isEmpty: () => !bytes.equals(png), getSize: () => ({ width: 1, height: 1 }), toPNG: () => png }) }
function fixture(t, options = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-image-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const calls = [], downloads = []
  const generate = createImageGenerator({ resolveApiKey: () => 'fixture-secret', nativeImage,
    fetchImpl: async (url, options) => { calls.push({url, options}); return Response.json({ data: [{ url: 'https://cdn.bigmodel.cn/test.png' }] }) },
    download: async url => { downloads.push(url); return png }, ...options })
  const args = { prompt: '蓝色小鸟插画', output: 'bird.png' }
  return { workspace, args, calls, downloads, invoke: (args, signal) => generate({workspace,args,signal}) }
}

test('Design selected dimensions reach provider and count cap also applies to parallel calls', async t => {
  const { validateDesignRequest } = require('../desktop/services/design-request.cjs')
  const policy = validateDesignRequest({model:'glm-image',mode:'generate',ratio:'9:16',resolution:'2k',count:2,text:''})
  const x = fixture(t,{policy})
  const results = await Promise.allSettled([1,2,3].map(i=>x.invoke({...x.args,output:`option-${i}.png`,size:'1280x1280'})))
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2)
  assert.equal(x.calls.length,2)
  assert(x.calls.every(call=>JSON.parse(call.options.body).size==='1152x2048'))
  assert.equal((await x.invoke({...x.args,output:'option-1.png'})).reused,true)
  assert.equal(x.calls.length,2)
})
test('custom Design size reaches the actual image request instead of the model supplied size', async t => {
  const policy=require('../desktop/services/design-request.cjs').validateDesignRequest({model:'glm-image',mode:'generate',ratio:'custom',resolution:'standard',width:992,height:768,count:1,text:''})
  const x=fixture(t,{policy});await x.invoke({...x.args,size:'1280x1280'})
  assert.equal(JSON.parse(x.calls[0].options.body).size,'992x768')
})

test('official credential selection prefers current profile, then default, and excludes proxy/Coding Plan', () => {
  const profile = (id, baseURL = 'https://open.bigmodel.cn/api/paas/v4') => ({ id, baseURL })
  const catalog = { defaultModelId: 'b', legacyModelId: 'old', items: [profile('proxy','https://proxy.test/glm'),profile('plan','https://open.bigmodel.cn/api/coding/paas/v4'),profile('a'),profile('b'),profile('old')] }
  const keys = { 'model:proxy:apiKey':'wrong', 'model:plan:apiKey':'wrong', 'model:a:apiKey':'a-key', 'model:b:apiKey':'b-key', apiKey:'legacy' }
  const registry = new ModelRegistry({modelCatalog:()=>catalog}, {get:key=>keys[key]})
  assert.equal(registry.resolveImageApiKey('a'),'a-key')
  assert.equal(registry.resolveImageApiKey('deepseek'),'b-key')
  delete keys['model:b:apiKey']; delete keys['model:a:apiKey']
  assert.equal(registry.resolveImageApiKey(), 'legacy')
  delete keys.apiKey
  assert.throws(()=>registry.resolveImageApiKey(),/智谱标准/)
})
test('generates once, saves PNG, returns compact metadata and reuses the same result', async t => {
  const x = fixture(t)
  const result = await x.invoke(x.args)
  assert.equal(x.calls[0].url,ENDPOINT)
  assert.equal(x.calls[0].options.headers.Authorization,'Bearer fixture-secret')
  assert.deepEqual(JSON.parse(x.calls[0].options.body),{model:'glm-image',prompt:x.args.prompt,size:'1280x1280',quality:'hd'})
  assert.equal(x.calls[0].options.redirect,'error')
  assert.deepEqual(fs.readFileSync(result.path),png)
  assert.equal((await x.invoke(x.args)).reused,true)
  assert.equal(x.calls.length,1)
  assert(!JSON.stringify(result).includes('fixture-secret'))
  assert(!JSON.stringify(result).includes('https:'))
})
test('download retry reuses paid generation and concurrent duplicates share one result', async t => {
  let downloads=0
  const x = fixture(t,{download:async()=>{if(++downloads===1)throw Error('connection failed');return png}})
  await assert.rejects(x.invoke(x.args),/只重试下载/)
  const [a,b] = await Promise.all([x.invoke(x.args),x.invoke(x.args)])
  assert.equal(a.path,b.path); assert.equal(x.calls.length,1); assert.equal(downloads,2)
})
test('simultaneous first calls share one paid request', async t => {
  const x=fixture(t)
  const [a,b]=await Promise.all([x.invoke(x.args),x.invoke(x.args)])
  assert.equal(a.path,b.path);assert.equal(x.calls.length,1);assert.equal(x.downloads.length,1)
})
test('invalid dimensions, prompts, path escape and existing output fail before paid request', async t => {
  const x=fixture(t)
  fs.writeFileSync(path.join(x.workspace,'old.png'),'original')
  for (const args of [{...x.args,size:'500x512'},{...x.args,size:'1025x1024'},{...x.args,prompt:'x'.repeat(1001)},
    {...x.args,output:'../escape.png'},{...x.args,output:'old.png'},{...x.args,output:'no-parent/bird.png'},{...x.args,apiKey:'injected'}]) {
    await assert.rejects(x.invoke(args))
  }
  assert.equal(x.calls.length,0)
  assert.equal(fs.readFileSync(path.join(x.workspace,'old.png'),'utf8'),'original')
})
test('missing credential, cancellation and corrupted images never create an artifact', async t => {
  const noKey=fixture(t,{resolveApiKey:()=>''})
  await assert.rejects(noKey.invoke(noKey.args),/API Key/); assert.equal(noKey.calls.length,0)
  const bad=fixture(t,{download:async()=>Buffer.from('<html>not an image</html>')})
  await assert.rejects(bad.invoke(bad.args),/无法解码/)
  assert(!fs.existsSync(path.join(bad.workspace,'bird.png')))
  const abort=new AbortController();abort.abort()
  const x=fixture(t);await assert.rejects(x.invoke(x.args,abort.signal));assert.equal(x.calls.length,0)
  const midway=new AbortController()
  const y=fixture(t,{download:async()=>{midway.abort();return png}})
  await assert.rejects(y.invoke(y.args,midway.signal))
  assert(!fs.existsSync(path.join(y.workspace,'bird.png')))
})
test('upstream errors are sanitized and identical failed requests are not billed twice', async t => {
  let count=0
  const x=fixture(t,{fetchImpl:async()=>{count++;return new Response('fixture-secret raw provider detail',{status:401})}})
  for(let i=0;i<2;i++)await assert.rejects(x.invoke(x.args),error=>/HTTP 401/.test(error.message)&&!error.message.includes('fixture-secret'))
  assert.equal(count,1)
})
test('image download rejects local, mapped and credential URLs without connecting', async()=>{
  for(const url of ['http://example.com/x','https://localhost:3000/x','https://127.0.0.1/x','https://[::1]/x','https://[::ffff:127.0.0.1]/x','https://a:b@example.com/x']) await assert.rejects(downloadImage(url))
  assert.equal(publicAddress('10.1.2.3',4),false)
  assert.equal(publicAddress('8.8.8.8',4),true)
  assert.equal(allowedImageAddress('maas-watermark-prod-new.cn-wlcb.ufileos.com','198.18.2.130',4),true)
  assert.equal(allowedImageAddress('maas-watermark-prod-new.cn-wlcb.ufileos.com','127.0.0.1',4),false)
  assert.equal(allowedImageAddress('untrusted.test','198.18.2.130',4),false)
})
test('Claude tool uses existing approvals; read-only and offline tasks do not advertise it', async t=>{
  const x=fixture(t);const calls=[]
  const sdk={tool:(name,description,shape,handler)=>({name,description,shape,handler}),createSdkMcpServer:value=>value}
  const base={sdk,workspace:x.workspace,builtinTools:{execute:async req=>{calls.push(req);return {path:'bird.png'}},cancel(){}}}
  for(const extra of [{networkAccess:false},{sandboxMode:'read-only'}])assert(!createClaudeTools({...base,...extra}).tools.some(t=>t.name==='stable_image_generate'))
  const denied=createClaudeTools({...base,requestApproval:async()=>false}).tools.find(t=>t.name==='stable_image_generate')
  assert.equal((await denied.handler(x.args)).isError,true);assert.equal(calls.length,0)
  const allowed=createClaudeTools({...base,requestApproval:async()=>true}).tools.find(t=>t.name==='stable_image_generate')
  assert.equal((await allowed.handler(x.args)).isError,undefined)
  assert.equal(calls[0].approved,true)
  const builtins=new BuiltinTools({workspace:x.workspace,browserSession:{},networkAccess:false})
  await assert.rejects(builtins.execute({requestId:'1',name:'stable_image_generate',args:x.args,approved:true},'workspace-write'),/网络/)
  await assert.rejects(builtins.execute({requestId:'2',name:'stable_image_generate',args:x.args,approved:true},'read-only'),/只读/)
  builtins.dispose()
})

test('successful generation survives a new runner and retries only download', async t => {
  const x = fixture(t); const directory = path.join(x.workspace, 'receipts'); let requests = 0, fail = true
  const options = { nativeImage, resolveApiKey: () => 'fixture', fetchImpl: async () => { requests++; return Response.json({ data: [{ url: 'https://cdn.example/image' }] }) }, download: async () => { if (fail) throw Error('offline'); return png } }
  const run = () => createImageGenerator({ ...options, jobStore: new ImageJobStore(directory) })({ workspace: x.workspace, args: x.args })
  await assert.rejects(run(), /只重试下载/); fail = false
  assert.equal((await run()).mimeType, 'image/png'); assert.equal(requests, 1)
  assert.equal((await run()).reused, true); assert.equal(requests, 1)
  fs.writeFileSync(path.join(x.workspace, 'bird.png'), 'changed')
  await assert.rejects(run(), /发生变化/); assert.equal(requests, 1)
})

test('unknown direct submission and damaged receipts fail closed across runners', async t => {
  const x = fixture(t); const directory = path.join(x.workspace, 'receipts'); let requests = 0
  const options = { nativeImage, resolveApiKey: () => 'fixture', fetchImpl: async () => { requests++; throw Error('network') } }
  const run = () => createImageGenerator({ ...options, jobStore: new ImageJobStore(directory) })({ workspace: x.workspace, args: x.args })
  await assert.rejects(run(), /结果未确认/); await assert.rejects(run(), /结果未知/); assert.equal(requests, 1)
  fs.writeFileSync(path.join(directory, fs.readdirSync(directory)[0]), '{broken')
  await assert.rejects(run(), /恢复记录/); assert.equal(requests, 1)
})

test('protected image destinations reject canonical junction targets before generation', async t => {
  const x = fixture(t); fs.mkdirSync(path.join(x.workspace, '.git'))
  fs.symlinkSync(path.join(x.workspace, '.git'), path.join(x.workspace, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(x.invoke({ ...x.args, output: 'alias/image.png' }), /配置目录/)
  assert.equal(x.calls.length, 0); assert.equal(fs.existsSync(path.join(x.workspace, '.git/image.png')), false)
})

test('fresh cloud profile sends only Stable credentials to cloud image route', async t => {
  const x = fixture(t), calls = []
  const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')
  const gateway = new CloudGatewayProxy({ account: { baseURL: 'https://gateway.example', token: () => 'device-test', publicState: () => ({ status: 'authenticated', account: { id: 'account-a' }, models: [{ id: 'glm-5.3-flashx' }, { id: 'glm-image' }] }) }, fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ data: [{ url: 'https://cdn.example/image' }] }) } })
  const registry = new ModelRegistry({ getSetting: () => null, modelCatalog: () => ({ items: [] }) }, { get: () => { throw Error('must not read local keys') } }, gateway)
  const run = createImageGenerator({ resolveRoute: () => registry.resolveImageRoute(), nativeImage, download: async () => png })
  await run({ workspace: x.workspace, args: x.args })
  assert.equal(calls[0].url, 'https://gateway.example/v1/images/generations')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-test')
  assert.match(calls[0].options.headers['Idempotency-Key'], /^image-[a-f0-9]{64}$/)
  assert(!registry.publicCatalog().items.some(item => item.id === 'glm-image'))
})
