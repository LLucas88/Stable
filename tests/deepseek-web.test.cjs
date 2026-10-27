'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { runProviderSearch, runProviderFetch } = require('../desktop/services/model-provider.cjs')
const { publicWebURL } = require('../desktop/services/deepseek-web.cjs')
const { ClaudeMessagesBridge } = require('../desktop/services/claude-messages-bridge.cjs')
const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')
const model = { id: 'deepseek', providerId: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-flash' }
const page = { title: 'Source', url: 'https://example.org/article', snippet: 'short', summary: 'model evidence', content: '', date: '2026-10-27T00:00:00Z' }
test('DeepSeek searches directly without a chat model round trip and preserves query operators', async () => {
  const calls = [], context = { model, apiKey: 'fixture-key', fetch: async (url, options) => { calls.push([url, options]); return Response.json({ results: [page, page, { ...page, url: 'file:///private' }] }) } }
  const result = await runProviderSearch.call(context, { query: 'site:example.org "release" after:2026', maxResults: 3 })
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'https://api.deepseek.com/v1/tools/search')
  assert.deepEqual(JSON.parse(calls[0][1].body), { query: 'site:example.org "release" after:2026', count: 3, need_content: false })
  assert.equal(calls[0][1].headers.authorization, 'Bearer fixture-key')
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].snippet, 'model evidence'); assert.equal(result.untrustedContent, true)
})
test('validation rejects long queries, invalid counts and private URLs before making a request', async () => {
  let calls = 0; const context = { model, apiKey: 'fixture', fetch: async () => { calls++; return Response.json({ results: [] }) } }
  await assert.rejects(runProviderSearch.call(context, { query: '字'.repeat(129) }), /128/)
  await assert.rejects(runProviderSearch.call(context, { query: 'ok', maxResults: 1.2 }), /整数/)
  for (const url of ['file:///C:/a', 'http://localhost/', 'http://127.0.0.1', 'http://2130706433', 'http://10.0.0.2', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://server/', 'http://host.local', 'https://user:secret@example.org']) await assert.rejects(runProviderFetch.call(context, { url }))
  assert.equal(calls, 0); assert.equal(publicWebURL('https://example.org/x'), 'https://example.org/x')
  await runProviderSearch.call(context, { query: '😀'.repeat(128) }); assert.equal(calls, 1)
})
test('fetch exposes bounded Markdown and marks returned page as untrusted', async () => {
  const context = { model, apiKey: 'fixture', fetch: async (url, options) => { assert.equal(url, 'https://api.deepseek.com/v1/tools/fetch'); assert.deepEqual(JSON.parse(options.body), { url: page.url }); return Response.json({ title: 'page', content: 'a'.repeat(160001) }) } }
  const result = await runProviderFetch.call(context, { url: page.url })
  assert.equal(result.content.length, 160000); assert.equal(result.truncated, true); assert.equal(result.untrustedContent, true)
})
test('empty search succeeds, malformed responses fail and provider errors never leak private body', async () => {
  const context = { model, apiKey: 'fixture', fetch: async () => Response.json({ results: [] }) }
  assert.deepEqual((await runProviderSearch.call(context, { query: 'none' })).sources, [])
  context.fetch = async () => Response.json({ choices: [] }); await assert.rejects(runProviderSearch.call(context, { query: 'bad' }), /results/)
  for (const status of [401,402,403,404,429,500]) {
    let calls = 0; context.fetch = async () => { calls++; return new Response('PRIVATE_PROVIDER_BODY', { status }) }
    await assert.rejects(runProviderSearch.call(context, { query: 'error' }), error => { assert.match(error.message, new RegExp('HTTP ' + status)); assert.doesNotMatch(error.message, /PRIVATE/); return true }); assert.equal(calls, 1)
  }
})
test('proxy credentials are never sent to DeepSeek and pre-aborted requests do not call network', async () => {
  let calls = 0; const context = { model: { ...model, baseURL: 'https://third-party.example/v1' }, apiKey: 'third-party-key', fetch: async () => { calls++ } }
  await assert.rejects(runProviderSearch.call(context, { query: 'q' }), /第三方/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(runProviderFetch.call({ ...context, model }, { url: page.url }, controller.signal)); assert.equal(calls, 0)
})
test('GLM cloud session routes search and fetch through the authenticated local proxy without leaking credentials', async t => {
  const calls = []
  const proxy = new CloudGatewayProxy({ account: { baseURL: 'https://cloud.example', token: () => 'device-token' }, fetchImpl: async (url, options) => { calls.push([url, options]); return Response.json(url.endsWith('/search') ? { results: [page] } : { title: page.title, content: '# Markdown' }) } })
  await proxy.start(); t.after(() => proxy.stop())
  const bridge = new ClaudeMessagesBridge({ model: { ...model, providerId: 'stable-cloud', model: 'glm-5.3-flashx', baseURL: proxy.baseURL }, apiKey: proxy.secret })
  assert.equal((await bridge.runSearch({ query: 'q' })).sources[0].url, page.url)
  assert.equal((await bridge.runFetch({ url: page.url })).content, '# Markdown')
  assert.deepEqual(calls.map(c => c[0]), ['https://cloud.example/v1/tools/search', 'https://cloud.example/v1/tools/fetch'])
  for (const [, options] of calls) { assert.equal(options.headers.authorization, 'Bearer device-token'); assert.match(options.headers['idempotency-key'], /^web-/); assert.doesNotMatch(String(options.body), /device-token|deepseek-flash|glm-5/); }
  assert.notEqual(calls[0][1].headers['idempotency-key'], calls[1][1].headers['idempotency-key'])
  const denied = await fetch(proxy.baseURL + '/tools/search', { method: 'POST', body: '{}' }); assert.equal(denied.status,401); assert.equal(calls.length,2)
})
test('cloud errors preserve supplier balance versus Stable quota and missing deployment', async () => {
  const bridge = new ClaudeMessagesBridge({ model: { ...model, providerId: 'stable-cloud', baseURL: 'https://cloud.example/v1' }, apiKey: 'fixture', fetchImpl: async () => Response.json({ error: { code: 'upstream_insufficient_balance', message: 'DeepSeek 联网服务供应商余额不足，不是 Stable 额度不足' } }, { status: 402 }) })
  await assert.rejects(bridge.runSearch({ query: 'q' }), /供应商余额不足/)
  bridge.fetch = async () => Response.json({ error: { code: 'insufficient_quota', message: 'Stable 账号额度不足' } }, { status: 429 })
  await assert.rejects(bridge.runSearch({ query: 'q' }), /Stable 账号额度不足/)
  bridge.fetch = async () => new Response('html', { status:404 }); await assert.rejects(bridge.runFetch({ url:page.url }), /尚未部署/)
  bridge.textOnly = true; await assert.rejects(bridge.runFetch({ url:page.url }), /不允许/)
})
test('MCP discovers both tools, blocks offline calls and forwards parameters and cancellation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-web-mcp-')); t.after(() => fs.rmSync(root, { recursive:true, force:true }))
  const sdk = { tool: (name, description, shape, handler) => ({ name, description, shape, handler }), createSdkMcpServer: value => value }
  let calls = 0
  const options = { sdk, workspace:root, search: async (args, signal) => { calls++; assert.equal(args.maxResults,2); assert.equal(signal.aborted,false); return {sources:[page]} }, webFetch: async () => { calls++; return {content:'markdown'} } }
  const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
  const offline = createClaudeTools({...options, networkAccess:false})
  for (const [name,args] of [['stable_search',{query:'q'}],['stable_fetch',{url:page.url}]]) assert.equal((await offline.tools.find(t => t.name===name).handler(args,{})).isError,true)
  assert.equal(calls,0)
  const online = createClaudeTools(options)
  assert.equal((await online.tools.find(t=>t.name==='stable_search').handler({query:'q',maxResults:2},{signal:new AbortController().signal})).isError,undefined)
  assert.equal((await online.tools.find(t=>t.name==='stable_fetch').handler({url:page.url},{})).isError,undefined); assert.equal(calls,2)
})
