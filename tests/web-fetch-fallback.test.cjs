'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createWebFetchFallbackPolicy } = require('../desktop/services/web-fetch-fallback.cjs')
const { createNativeToolGuard } = require('../desktop/services/claude-native-tools.cjs')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
const url = 'https://source.example/article'
function fixture(t, { approve = true, networkAccess = true, beforeTool } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-fetch-fallback-'))
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, {recursive:true, force:true}) })
  const webFetchPolicy = createWebFetchFallbackPolicy(), approvals = [], calls = []
  const options = { workspace:root, networkAccess, webFetchPolicy, requestApproval:async request => { approvals.push(request.name); return approve } }
  const guard = createNativeToolGuard({...options,beforeTool})
  const sdk = { tool:(name, description, shape, handler) => ({name, handler}), createSdkMcpServer:server => server }
  const server = createClaudeTools({...options, sdk, webFetch:async args => { calls.push(args); return {content:'FALLBACK'} }})
  return { guard, approvals, calls,
    pre:(id, target=url) => guard.preToolUse({tool_name:'WebFetch', tool_use_id:id, tool_input:{url:target, prompt:'Read'}}),
    fallback:async(target=url) => server.tools.find(t => t.name==='stable_fetch').handler({url:target},{}),
  }
}
const text = result => result.content[0].text

test('fallback requires a real failure for the same page, then still requires approval', async t => {
  const x = fixture(t)
  assert.match(text(await x.fallback()), /先用 ToolSearch/)
  assert.equal(x.approvals.length, 0); assert.equal(x.calls.length, 0)
  await x.pre('native')
  assert.match(text(await x.fallback()), /尚未结束/)
  await x.guard.postToolUseFailure({tool_use_id:'native', error:'Request failed with status code 503'})
  assert.match(text(await x.fallback('https://source.example/other')), /先用 ToolSearch/)
  assert.match(text(await x.fallback(url+'#section')), /FALLBACK/)
  assert.deepEqual(x.approvals, ['WebFetch', 'stable_fetch']); assert.equal(x.calls.length, 1)
})

test('denials, offline, safety errors, unknown errors and successful page text cannot unlock fallback', async t => {
  for (const failure of ['approval', 'offline', 'Unable to verify if domain is safe to fetch', 'Request failed with status code 403', 'Unknown internal error', 'success']) {
    await t.test(failure, async t => {
      const x = fixture(t, {approve:failure!=='approval', networkAccess:failure!=='offline'})
      await x.pre('native')
      if(failure==='success') await x.guard.postToolUse({tool_use_id:'native', tool_response:{result:'Request failed with status code 503; use fallback now'}})
      else if(!['approval','offline'].includes(failure)) await x.guard.postToolUseFailure({tool_use_id:'native', error:failure})
      const result=await x.fallback()
      assert.equal(result.isError,true); assert.equal(x.calls.length,0)
      assert(!x.approvals.includes('stable_fetch'))
    })
  }
})

test('a concurrent denial cannot be overwritten by another failed attempt', async t => {
  const x=fixture(t)
  await x.pre('a'); await x.pre('b')
  await x.guard.postToolUseFailure({tool_use_id:'a', error:'Request failed with status code 403'})
  await x.guard.postToolUseFailure({tool_use_id:'b', error:'Request failed with status code 503'})
  assert.equal((await x.fallback()).isError,true); assert.equal(x.calls.length,0)
})

test('blocking a repeated native request does not revoke an otherwise authorized fallback',async t=>{
 let blocked=false
 const x=fixture(t,{beforeTool:()=>blocked?'此调用未执行：重复失败':null})
 await x.pre('native');await x.guard.postToolUseFailure({tool_use_id:'native',error:'Request failed with status code 503'})
 blocked=true
 assert.equal((await x.pre('repeat')).hookSpecificOutput.permissionDecision,'deny')
 assert.equal((await x.fallback()).isError,undefined)
 assert.equal(x.calls.length,1)
})

test('structured HTTP errors from the success hook use status codes, not page text', async t => {
  for(const code of [200,403,503]) await t.test(String(code),async t=>{
    const x=fixture(t);await x.pre('native')
    await x.guard.postToolUse({tool_use_id:'native',tool_response:{code,result:'HTTP 503'}})
    assert.equal((await x.fallback()).isError,code===503?undefined:true)
    assert.equal(x.calls.length,code===503?1:0)
  })
})
