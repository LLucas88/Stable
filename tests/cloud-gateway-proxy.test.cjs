'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')

test('Cloud receives tool images as attributed user evidence after the complete tool batch',async t=>{
 let sent
 const proxy=new CloudGatewayProxy({account:{baseURL:'https://cloud.invalid',token:()=> 'secret'},fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[]})}})
 await proxy.start();t.after(()=>proxy.stop())
 const image={type:'image_url',image_url:{url:'data:image/png;base64,cGl4ZWxz'}}
 const body={model:'test',reasoning_effort:'high',messages:[
  {role:'assistant',content:null,reasoning_content:'retained',tool_calls:[{id:'shot'},{id:'read'}]},
  {role:'tool',tool_call_id:'shot',content:[{type:'text',text:'screenshot metadata'},image]},
  {role:'tool',tool_call_id:'read',content:'other result'},
  {role:'user',content:'continue'}]}
 const response=await fetch(proxy.baseURL+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+proxy.secret},body:JSON.stringify(body)})
 assert.equal(response.status,200)
 assert.deepEqual(sent.messages.map(m=>m.role),['assistant','tool','tool','user','user'])
 assert.equal(sent.messages[1].tool_call_id,'shot');assert.equal(typeof sent.messages[1].content,'string')
 assert.match(sent.messages[3].content[0].text,/shot/);assert.deepEqual(sent.messages[3].content[1],image)
 assert.equal(sent.messages[0].reasoning_content,'retained');assert.equal(sent.reasoning_effort,'high')
 assert.equal(sent.messages.at(-1).content,'continue')
})

test('disconnecting a local caller aborts the upstream cloud request',async t=>{
 let signal,startedResolve,abortedResolve
 const started=new Promise(r=>startedResolve=r),aborted=new Promise(r=>abortedResolve=r)
 const proxy=new CloudGatewayProxy({account:{baseURL:'https://cloud.invalid',token:()=> 'secret'},fetchImpl:async(_url,options)=>{
  signal=options.signal;startedResolve()
  return new Promise((resolve,reject)=>{signal?.addEventListener('abort',()=>{abortedResolve();reject(new Error('aborted'))},{once:true});setTimeout(()=>resolve(Response.json({})),1000).unref()})
 }})
 await proxy.start();t.after(()=>proxy.stop())
 const controller=new AbortController()
 const request=fetch(proxy.baseURL+'/chat/completions',{method:'POST',signal:controller.signal,headers:{authorization:'Bearer '+proxy.secret},body:'{}'}).catch(()=>{})
 await started;controller.abort();await request
 await Promise.race([aborted,new Promise(r=>setTimeout(r,100))])
 assert.equal(signal?.aborted,true)
})

function listen(server) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())) })
}

test('local gateway keeps the cloud token in the main process and injects a unique idempotency key per request', async (t) => {
  const received = []
  const upstream = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push({ authorization: request.headers.authorization, idempotencyKey: request.headers['idempotency-key'], body: Buffer.concat(chunks).toString('utf8') })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ id: `reply-${received.length}`, choices: [] }))
    })
  })
  const address = await listen(upstream)
  t.after(() => new Promise((resolve) => upstream.close(resolve)))
  const state = { status: 'authenticated', models: [{ id: 'model-a', display_name: 'Model A' }] }
  const account = { baseURL: `http://127.0.0.1:${address.port}`, token: () => 'real-cloud-token', publicState: () => state }
  const proxy = new CloudGatewayProxy({ account })
  await proxy.start(); t.after(() => proxy.stop())
  const route = proxy.modelRoute('model-a')
  assert.notEqual(route.apiKey, 'real-cloud-token')
  for (let index = 0; index < 2; index += 1) {
    const response = await fetch(`${route.model.baseURL}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${route.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'model-a', messages: [{ role: 'user', content: String(index) }] }) })
    assert.equal(response.status, 200)
  }
  assert.equal(received.length, 2)
  assert.equal(received[0].authorization, 'Bearer real-cloud-token')
  assert.match(received[0].idempotencyKey, /^stable-/)
  assert.notEqual(received[0].idempotencyKey, received[1].idempotencyKey)
})

test('local gateway rejects callers without its per-process credential', async (t) => {
  const account = { baseURL: 'https://stable.example.com', token: () => 'cloud', publicState: () => ({ status: 'authenticated', models: [] }) }
  const proxy = new CloudGatewayProxy({ account, fetchImpl: async () => { throw new Error('must not forward') } })
  await proxy.start(); t.after(() => proxy.stop())
  const response = await fetch(`${proxy.baseURL}/models`)
  assert.equal(response.status, 401)
})

test('gateway converts HTML interception to a JSON error without forwarding the interception page', async (t) => {
  const account = { baseURL: 'https://stable.example.com', token: () => 'cloud' }
  const proxy = new CloudGatewayProxy({ account, fetchImpl: async () => new Response('<html>private-interception-body</html>', { status: 403, headers: { 'content-type': 'text/html' } }) })
  await proxy.start(); t.after(() => proxy.stop())
  const response = await fetch(`${proxy.baseURL}/models`, { headers: { authorization: `Bearer ${proxy.secret}` } })
  assert.equal(response.status, 403)
  assert.match(response.headers.get('content-type'), /application\/json/)
  const result = await response.text()
  assert.match(result, /代理或站点入口拦截/)
  assert.doesNotMatch(result, /private-interception-body/)
})

test('gateway forwards SSE and provider JSON quota rejection without buffering or changing status', async (t) => {
  const account = { baseURL: 'https://stable.example.com', token: () => 'cloud' }
  let quota = false
  const proxy = new CloudGatewayProxy({ account, fetchImpl: async () => quota ? Response.json({ error: { code: 'quota_exceeded' } }, { status: 429 }) : new Response('data: first\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }) })
  await proxy.start(); t.after(() => proxy.stop())
  const options = { method: 'POST', headers: { authorization: `Bearer ${proxy.secret}`, 'content-type': 'application/json' }, body: '{}' }
  const response = await fetch(`${proxy.baseURL}/chat/completions`, options)
  assert.equal(response.headers.get('content-type'), 'text/event-stream')
  assert.equal(await response.text(), 'data: first\n\ndata: [DONE]\n\n')
  quota = true
  const rejected = await fetch(`${proxy.baseURL}/chat/completions`, options)
  assert.equal(rejected.status, 429)
  assert.equal((await rejected.json()).error.code, 'quota_exceeded')
})
