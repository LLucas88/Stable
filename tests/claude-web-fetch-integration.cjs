'use strict'

// Real SDK HTTP, HTML extraction and pagination; TLS pages, safety checks and
// model responses all stay on loopback. No external network or paid inference.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const { execFileSync } = require('node:child_process')
const { ClaudeHarnessRunner } = require('../desktop/services/claude-harness.cjs')

function upstream(text, calls) {
  const delta = calls ? { tool_calls: calls.map((c, index) => ({ index, id: c.id, type: 'function', function: {name:c.name, arguments:JSON.stringify(c.input)} })) } : {content:text}
  const chunk = {id:'fixture',object:'chat.completion.chunk',model:'fixture-model',choices:[{index:0,delta,finish_reason:calls?'tool_calls':'stop'}],usage:{prompt_tokens:50,completion_tokens:10}}
  return new Response('data: '+JSON.stringify(chunk)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
}
const result = (body,id) => body.messages.find(m=>m.role==='tool' && m.tool_call_id===id)?.content || ''
function extractPage(body) {
  const content=JSON.stringify(body.messages)
  assert.match(content,/Paragraph \d+/,'SDK must send the fetched text to its extraction model')
  return upstream(['EXTRACTED_FIXTURE_CONTENT',...(content.match(/FIRSTPAGEMARKER|LASTPAGEMARKER/g)||[]),content.match(/Paragraph \d+/)[0]].join(' '))
}

async function fixture(t, responder, {webResponder}={}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'stable-native-fetch-'))
  const workspace = path.join(root,'workspace');fs.mkdirSync(workspace)
  const key = path.join(root,'test.key'), cert = path.join(root,'test.pem')
  const openssl = process.platform==='win32' ? path.join(process.env.ProgramFiles,'Git','usr','bin','openssl.exe') : 'openssl'
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=source.stable.test','-addext','subjectAltName=DNS:source.stable.test,DNS:api.anthropic.com'],{windowsHide:true,stdio:'ignore'})
  const pages=[],connects=[],sockets=new Set(),requests=[],events=[]
  const html = '<html><body><h1>FIRSTPAGEMARKER</h1>'+Array.from({length:12000},(_,i)=>`<p>Paragraph ${i}: local fixture evidence for long native page reading.</p>`).join('')+'<p>LASTPAGEMARKER</p></body></html>'
  const server = https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    if(req.headers.host==='api.anthropic.com' && req.url.startsWith('/api/web/domain_info')) {res.setHeader('content-type','application/json');res.end(JSON.stringify({can_fetch:true}));return}
    pages.push(req.url)
    if(req.url==='/unavailable') {res.writeHead(503);res.end('fixture unavailable');return}
    res.setHeader('content-type','text/html; charset=utf-8');res.end(html)
  })
  const proxy = http.createServer((_req,res)=>{res.writeHead(502);res.end()})
  const track = socket => {sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{})}
  server.on('connection',track);proxy.on('connection',track)
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  proxy.on('connect',(req,socket,head)=>{
    connects.push(req.url)
    if(!['source.stable.test:443','api.anthropic.com:443'].includes(req.url)) {socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');return}
    const upstreamSocket=net.connect(server.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstreamSocket.write(head);socket.pipe(upstreamSocket);upstreamSocket.pipe(socket)})
    track(upstreamSocket);socket.once('close',()=>upstreamSocket.destroy())
  })
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve))
  const environment={HTTPS_PROXY:`http://127.0.0.1:${proxy.address().port}`,HTTP_PROXY:`http://127.0.0.1:${proxy.address().port}`,ALL_PROXY:`http://127.0.0.1:${proxy.address().port}`,NODE_EXTRA_CA_CERTS:cert}
  const saved=Object.fromEntries(Object.keys(environment).map(k=>[k,process.env[k]]))
  Object.assign(process.env,environment)
  let failure
  const runner=new ClaudeHarnessRunner({userData:root,workspace,fetchImpl:async(url,request)=>{
    if(webResponder && url==='https://provider.invalid/v1/tools/fetch')return webResponder(JSON.parse(request.body))
    assert.equal(url,'https://provider.invalid/v1/chat/completions')
    const body=JSON.parse(request.body);requests.push(body)
    try {return await responder(body,requests.length,{pages,events})}
    catch(error){failure ||= error;return upstream('FIXTURE_FAILED')}
  }})
  t.after(async()=>{
    runner.cancel()
    for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}
    for(const socket of sockets)socket.destroy()
    await Promise.all([new Promise(resolve=>proxy.close(resolve)),new Promise(resolve=>server.close(resolve))])
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()))
    await fs.promises.rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100})
  })
  return {pages,requests,events,connects,check:()=>assert.ifError(failure),run:async({networkAccess=true,approve=true,providerId='fixture'}={})=>runner.run('Read the fixture webpage using native WebFetch. Continue long pages using the returned offset.',{providerId,model:'fixture-model',baseURL:'https://provider.invalid/v1'},'local-fixture',45000,e=>{
    events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,approve)
  },'workspace-write',[],{cwd:workspace,networkAccess})}
}

test('native WebFetch exposes and executes long-page offset through the real SDK', {timeout:60000},async t=>{
  let stage=0,previousOffset=0,latest='first-page'
  const x=await fixture(t,(body,_number)=>{
    // The SDK can make a separate summarization call with no tools.
    if(!body.tools?.length)return extractPage(body)
    if(stage++===0)return upstream(null,[{id:'discover',name:'ToolSearch',input:{query:'select:WebFetch',max_results:1}}])
    if(stage===2){
      const tool=body.tools.find(t=>t.function.name==='WebFetch');assert(tool,JSON.stringify({tools:body.tools.map(t=>t.function.name),messages:body.messages.slice(-2)}))
      assert(tool.function.parameters.properties.offset)
      return upstream(null,[{id:'first-page',name:'WebFetch',input:{url:'https://source.stable.test/long',prompt:'Return the provided text.'}}])
    }
    const content=result(body,latest)
    assert.match(content,stage===3?/FIRSTPAGEMARKER/:/Paragraph/)
    if(!content.includes('LASTPAGEMARKER')){
      const offset=Number(content.match(/offset[\s:=`"']+(\d+)/i)?.[1])
      assert(offset>previousOffset,content.slice(-1800));assert(stage<20,'pagination must terminate')
      previousOffset=offset;latest='page-'+stage
      return upstream(null,[{id:latest,name:'WebFetch',input:{url:'https://source.stable.test/long',prompt:'Read the next section.',offset}}])
    }
    assert(previousOffset>160000,'read beyond the old Stable fetch truncation limit')
    return upstream('NATIVE_PAGINATION_OK')
  })
  const answer=await x.run();x.check();assert.equal(answer,'NATIVE_PAGINATION_OK')
  assert.deepEqual(x.pages,['/long'],'native continuation reuses its page cache')
  assert(x.events.some(e=>e.toolName==='WebFetch' && e.status==='completed'))
})

test('child agent can discover and execute native WebFetch', {timeout:60000},async t=>{
  let childStage=0,parentStage=0
  const x=await fixture(t,body=>{
    if(!body.tools?.length)return extractPage(body)
    if(body.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('NATIVE_CHILD_FETCH_FIXTURE'))){
      if(childStage++===0)return upstream(null,[{id:'child-discover',name:'ToolSearch',input:{query:'select:WebFetch',max_results:1}}])
      if(childStage===2){assert(body.tools.some(t=>t.function.name==='WebFetch'));return upstream(null,[{id:'child-page',name:'WebFetch',input:{url:'https://source.stable.test/long',prompt:'Read the opening.',offset:0}}])}
      assert.match(result(body,'child-page'),/FIRSTPAGEMARKER/);return upstream('CHILD_NATIVE_OK')
    }
    if(parentStage++===0)return upstream(null,[{id:'child',name:'Agent',input:{description:'Read webpage',subagent_type:'stable-worker',prompt:'NATIVE_CHILD_FETCH_FIXTURE: read the public fixture page.'}}])
    assert.match(result(body,'child'),/CHILD_NATIVE_OK/);return upstream('PARENT_NATIVE_OK')
  })
  const answer=await x.run();x.check();assert.equal(answer,'PARENT_NATIVE_OK');assert.deepEqual(x.pages,['/long'])
})

test('native fetch service failure can use the approved Stable fallback', {timeout:60000},async t=>{
  let stage=0,fallbackCalls=0
  const x=await fixture(t,body=>{
    if(stage++===0)return upstream(null,[{id:'discover',name:'ToolSearch',input:{query:'select:WebFetch,mcp__stable__stable_fetch',max_results:2}}])
    if(stage===2)return upstream(null,[{id:'native-failure',name:'WebFetch',input:{url:'https://source.stable.test/unavailable',prompt:'Read the page'}}])
    if(stage===3){assert.match(result(body,'native-failure'),/503/);return upstream(null,[{id:'fallback',name:'mcp__stable__stable_fetch',input:{url:'https://source.stable.test/unavailable'}}])}
    assert.match(result(body,'fallback'),/FALLBACK_EVIDENCE/);return upstream('FALLBACK_OK')
  },{webResponder:async args=>{fallbackCalls++;assert.equal(args.url,'https://source.stable.test/unavailable');return Response.json({title:'fixture',content:'FALLBACK_EVIDENCE'})}})
  const answer=await x.run({providerId:'stable-cloud'});x.check();assert.equal(answer,'FALLBACK_OK')
  assert.equal(fallbackCalls,1);assert(x.pages.includes('/unavailable'))
  assert.equal(x.events.filter(e=>e.kind==='approval'&&e.status==='running').length,2)
})

test('native WebFetch approval rejection and offline policy make no page request', {timeout:120000},async t=>{
  for(const networkAccess of [true,false])await t.test(networkAccess?'denied':'offline',async t=>{
    let stage=0
    const x=await fixture(t,body=>{
      if(stage++===0)return upstream(null,[{id:'discover',name:'ToolSearch',input:{query:'select:WebFetch',max_results:1}}])
      if(!networkAccess){assert.match(result(body,'discover'),/No matching deferred tools/);return upstream('BLOCKED_OK')}
      if(stage===2)return upstream(null,[{id:'blocked',name:'WebFetch',input:{url:'https://source.stable.test/long',prompt:'Read this page',offset:100}}])
      assert.match(result(body,'blocked'),/未批准|denied|not.*allowed/i)
      return upstream('BLOCKED_OK')
    })
    const answer=await x.run({networkAccess,approve:false});x.check();assert.equal(answer,'BLOCKED_OK')
    assert.deepEqual(x.pages,[])
    assert.equal(x.events.filter(e=>e.kind==='approval'&&e.status==='running').length,networkAccess?1:0)
  })
})
