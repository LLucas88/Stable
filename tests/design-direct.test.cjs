'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { runDirectDesign } = require('../desktop/services/design-direct.cjs')
const { createImageGenerator } = require('../desktop/services/image-generation.cjs')
const { StableStore } = require('../desktop/services/store.cjs')
const { ConversationLifecycle } = require('../desktop/services/conversation-lifecycle.cjs')
const { TaskAlerts } = require('../desktop/services/task-alerts.cjs')
const { DesignReferences } = require('../desktop/services/design-references.cjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
const base = { model: 'gpt-image-2.5-sunburst', mode: 'generate', ratio: '1:1', resolution: 'standard', count: 1, text: '', quality: 'medium', background: 'opaque' }
test('unbound direct request forwards original prompt and omits fixed image options',async t=>{
 const x=fixture(t)
 const result=await x.send({prompt:'生成一张小猫的图片'},{...base,count:4,quality:'high',resolution:'2k',bindings:{}})
 assert.equal(x.calls.length,1)
 assert.deepEqual(x.calls[0].body,{model:base.model,prompt:'生成一张小猫的图片'})
 assert.match(result.answer,/已生成 1 张/)
})
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-direct-design-')), workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const store = new StableStore(root), id = store.createConversation(); store.updateConversationModel(id, 'no-text-model', ['no-text-model'])
  const lifecycle = new ConversationLifecycle(store, { userData: root }), controls = new Map(), alerts = new TaskAlerts({ notify() {} })
  const calls = [], events = [], referenceSets = []; let sequence = 0
  const decoded = { isEmpty: () => false, getSize: () => ({ width: 1280, height: 1280 }), resize: () => decoded, toPNG: () => png }
  const nativeImage = { createFromBuffer: () => decoded }
  const vault = new DesignReferences(path.join(root, 'references'), nativeImage)
  const deps = { store, lifecycle, controls, alerts, userData: root, nativeImage,
    getPaths: () => ({ workspace }), captureReferences: async (_id, attachments) => { const ids = await vault.capture(attachments, () => [workspace]); return { ids, attachments: vault.materialize(attachments, ids, workspace) } },
    readReferences: (_id, ids) => vault.read(ids),
    resolveImageRoute: () => ({ endpoint: 'https://mock.test/images/generations', editEndpoint: 'https://mock.test/images/edits', apiKey: 'mock-only', replay: true, scope: 'isolated-test' }),
    publishState() {}, state: () => ({ messages: store.listMessages(id) }), publishEvent: event => events.push(event),
    makeGenerator: params => { referenceSets.push(params.references); return createImageGenerator({ ...params, fetchImpl: async (url, init) => {
      const call = { url, body: JSON.parse(init.body), key: init.headers['Idempotency-Key'], signal: init.signal }; calls.push(call)
      if (options.fetch) return options.fetch(call, calls)
      return Response.json({ data: [{ b64_json: png.toString('base64') }] })
    } }) },
  }
  const send = (extra = {}, design = base) => runDirectDesign({ conversationId: id, query: extra.prompt || '生成饮品图', payload: { clientRequestId: `request-${++sequence}`, ...extra }, design }, deps)
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { store, id, root, workspace, lifecycle, deps, calls, controls, events, referenceSets, send }
}

test('direct Design generates 3 images with no text route and forwards reference pixels and visible copy', async t => {
  const x = fixture(t), file = path.join(x.workspace, 'mango.png'); fs.writeFileSync(file, png)
  const result = await x.send({ prompt: '参考图1生成饮品图', attachments: [{ path: file, name: 'mango.png' }] }, { ...base, count: 3, text: '芒果椰椰' })
  assert.equal(x.calls.length, 3); assert.equal(new Set(x.calls.map(c => c.key)).size, 3)
  for (const call of x.calls) { assert.equal(call.url, 'https://mock.test/images/edits'); assert.equal(call.body.model, base.model); assert.match(call.body.prompt, /^参考图1生成饮品图/); assert.match(call.body.prompt, /芒果椰椰/); assert.equal(call.body.references[0].data, png.toString('base64')) }
  assert.match(result.answer, /已生成 3 张/); assert.equal(x.store.listMessages(x.id).length, 2); assert.equal(x.store.conversation(x.id).modelId, 'no-text-model')
  assert.equal(x.lifecycle.deliveries(x.id)[0].state, 'completed'); assert.equal(x.controls.size, 0)
  assert.equal(x.store.getSetting(`design-direct-pending:${x.id}`), null); assert.equal(x.events.filter(e => e.eventType === 'tool/end' && e.status === 'completed').length, 3)
})

test('invalid parameters, long prompts, network denial and unsupported inputs cannot spend', async t => {
  const x = fixture(t)
  await assert.rejects(x.send({ prompt: '尺寸2048x4436' }), /3840/)
  await assert.rejects(x.send({ prompt: '长'.repeat(1001) }), /1000/)
  await assert.rejects(x.send({ attachments: [{ path: 'data.xlsx' }] }), /PNG/)
  await assert.rejects(x.send({ references: [{ kind: 'skill', id: 'example' }] }), /不执行技能/)
  await assert.rejects(x.send({}, { ...base, mode: 'preserve' }), /原图像素/)
  x.store.setConversationNetwork(x.id, false); await assert.rejects(x.send(), /网络访问/)
  assert.equal(x.calls.length, 0); assert.equal(x.store.listMessages(x.id).length, 0)
})

test('failed batch stops later images and retains successful output without duplicate spend on retry', async t => {
  const x = fixture(t, { fetch: async call => /第 2 张/.test(call.body.prompt) ? Response.json({ error: { message: '模拟额度不足' } }, { status: 402 }) : Response.json({ data: [{ b64_json: png.toString('base64') }] }) })
  const request = { ...base, count: 3 }
  const first = await x.send({}, request); assert.equal(x.calls.length, 2); assert.match(first.answer, /1\/3/); assert.match(first.answer, /image-1.png/)
  assert.match(first.answer, /已保留 1 张完成图片/); assert.match(first.answer, /失败请求已结束/)
  const second = await x.send({}, request); assert.equal(x.calls.length, 2); assert.match(second.answer, /1\/3/)
  assert.equal(x.lifecycle.deliveries(x.id)[0].state, 'failed')
})

test('confirmed output moderation rejection has no recoverable image and never resubmits the same request',async t=>{
 const x=fixture(t,{fetch:async()=>Response.json({error:{code:'image_generation_failed',message:'生成结果未通过供应商安全审核，未返回可交付图片。',reason:'moderation_blocked'}},{status:422})})
 for(let i=0;i<2;i++){
  const result=await x.send({prompt:'隔离审核测试'})
  assert.match(result.answer,/HTTP 422/)
  assert.match(result.answer,/本次没有可交付图片/)
  assert.match(result.answer,/失败请求已结束/)
  assert.doesNotMatch(result.answer,/已保留完成结果|会恢复原请求/)
 }
 assert.equal(x.calls.length,1)
})

test('cancel and restart recover the same image receipt key without invoking a new generation', async t => {
  let started
  const began = new Promise(resolve => { started = resolve })
  let pending = true
  const x = fixture(t, { fetch: async call => {
    if (!pending) return Response.json({ data: [{ b64_json: png.toString('base64') }] })
    started(); return new Promise((resolve, reject) => call.signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }))
  } })
  const first = x.send(); await began; const control = x.controls.get(x.id); control.cancelled = true; control.runner.cancel()
  assert.match((await first).answer, /本轮已停止/); assert.equal(x.lifecycle.deliveries(x.id)[0].state, 'interrupted')
  await assert.rejects(x.send({ prompt: '换一个新画面' }), /此前生图结果未确认/); assert.equal(x.calls.length, 1)
  pending = false
  assert.match((await x.send()).answer, /已生成 1 张/); assert.equal(x.calls.length, 2); assert.equal(x.calls[0].key, x.calls[1].key)
})

test('client delivery replay returns the recorded state and never submits another request', async t => {
  const x = fixture(t), payload = { clientRequestId: 'same-message' }
  await x.send(payload); await x.send(payload); assert.equal(x.calls.length, 1); assert.equal(x.store.listMessages(x.id).length, 2)
})

test('direct delivery rejects invalid actual image dimensions and retains the source for local processing', async t => {
  const x = fixture(t)
  const bad = { isEmpty: () => false, getSize: () => ({ width: 1000, height: 500 }), resize: () => bad, toPNG: () => png }
  x.deps.nativeImage = { createFromBuffer: () => bad }
  const result = await x.send(); assert.match(result.answer, /0\/1/); assert.match(result.answer, /待调整的原图预览/); assert.match(result.answer, /source.png/)
  assert.equal(x.lifecycle.deliveries(x.id)[0].state, 'failed'); assert.equal(x.calls.length, 1)
})
