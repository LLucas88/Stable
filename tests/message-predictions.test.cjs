'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { MessagePredictions, predictionSource, predictionPrompt, parsePrediction } = require('../desktop/services/message-predictions.cjs')
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const snapshot = () => ({ conversation: {}, modelKey: 'model-a', originalGoal: '修复问题', messages: [
  { id: 'user', role: 'user', content: '修复并验证' },
  { id: 'answer', role: 'assistant', content: '已修复，需要验证。', trace: [{ id: 'complete', status: 'completed' }] },
] })

test('only a committed completed answer can be a prediction source', () => {
  assert.equal(predictionSource(snapshot()).id, 'answer')
  for (const change of [s => { s.busy = true }, s => { s.conversation.archivedAt = 'now' }, s => { s.conversation.deletionState = 'pending' },
    s => { s.messages.at(-1).role = 'user' }, s => { s.messages.at(-1).trace = [] },
    s => { s.messages.at(-1).trace.push({ id: 'runtime', status: 'failed' }) }, s => { s.messages.at(-1).trace.push({ id: 'runtime', status: 'cancelled' }) },
    s => { s.messages.at(-1).trace.push({ clarification: { status: 'waiting' } }) },
    s => { s.messages.at(-1).automationProposal = { status: 'pending' } }]) {
    const value = snapshot(); change(value); assert.equal(predictionSource(value), null)
  }
})
test('bounded JSON context preserves the latest answer and excludes traces and attachments', () => {
  const value = snapshot(); value.originalGoal = '目'.repeat(5000)
  value.messages = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) + '文'.repeat(20000), trace: ['SECRET_TRACE'], attachments: ['SECRET_ATTACHMENT'] }))
  const prompt = predictionPrompt(value), parsed = JSON.parse(prompt)
  assert.equal(parsed.conversation.length, 6); assert.equal(parsed.originalGoal.length, 1500)
  assert.equal(parsed.conversation.at(-1).content.length, 8000)
  assert(prompt.length < 19000); assert(!prompt.includes('SECRET'))
})
test('only short one-line JSON suggestions are accepted', () => {
  assert.equal(parsePrediction('{"suggestion":"  继续验证。  "}'), '继续验证。')
  for (const raw of ['{}', '{"suggestion":null}', '{"suggestion":12}', '```json\n{"suggestion":"x"}\n```', '{"suggestion":"x","action":"run"}', JSON.stringify({ suggestion: 'x'.repeat(121) }), JSON.stringify({ suggestion: 'a\nb' }), '[]']) assert.equal(parsePrediction(raw), null)
})
test('deduplicates in-flight requests and caches successful and empty predictions', async () => {
  const wait = deferred(); let calls = 0
  const service = new MessagePredictions({ snapshot, generate: async () => { calls++; await wait.promise; return '{"suggestion":"运行测试。"}' } })
  const a = service.request('a', 'answer', 'r1'), b = service.request('a', 'answer', 'r2')
  service.cancel('r1'); wait.resolve()
  assert.deepEqual(await a, await b); assert.equal(calls, 1)
  assert.equal((await service.request('a', 'answer', 'r3')).suggestion, '运行测试。'); assert.equal(calls, 1)
  service.invalidate('a'); service.generate = async () => { calls++; return '{"suggestion":null}' }
  assert.equal(await service.request('a', 'answer', 'r4'), null)
  assert.equal(await service.request('a', 'answer', 'r5'), null); assert.equal(calls, 2)
})
test('new messages, model changes, deletion and disabling discard late responses', async () => {
  for (const change of [s => { s.messages.push({ id: 'next', role: 'user' }) }, s => { s.modelKey = 'model-b' }, s => { s.conversation.deletionState = 'pending' }]) {
    const value = snapshot(), wait = deferred()
    const service = new MessagePredictions({ snapshot: () => value, generate: () => wait.promise })
    const pending = service.request('a', 'answer', 'r'); await Promise.resolve()
    change(value); wait.resolve('{"suggestion":"old"}'); assert.equal(await pending, null)
  }
  let enabled = true; const wait = deferred()
  const service = new MessagePredictions({ snapshot, enabled: () => enabled, generate: () => wait.promise })
  const pending = service.request('a', 'answer', 'r'); await Promise.resolve(); enabled = false; service.invalidate()
  wait.resolve('{"suggestion":"old"}'); assert.equal(await pending, null)
})
test('switches stop the old request before another starts; stale cancellation cannot stop the new request', async () => {
  const first = deferred(), second = deferred(), calls = []
  const service = new MessagePredictions({ snapshot, generate: async (_s, _p, signal) => { calls.push(signal); return calls.length === 1 ? first.promise : second.promise } })
  const a = service.request('a', 'answer', 'old'); await Promise.resolve()
  const b = service.request('b', 'answer', 'new'); await Promise.resolve()
  assert.equal(calls.length, 1); assert(calls[0].aborted)
  first.resolve('{"suggestion":"a"}'); assert.equal(await a, null)
  await Promise.resolve(); await Promise.resolve(); assert.equal(calls.length, 2)
  service.cancel('old'); assert(!calls[1].aborted)
  second.resolve('{"suggestion":"b"}'); assert.equal((await b).conversationId, 'b')
  assert.equal(await service.request('a', 'answer', 'again'), null, 'cancelled generation must not spend a second attempt')
})
test('unavailable and failed predictions remain silent without retrying', async () => {
  let calls = 0
  const service = new MessagePredictions({ snapshot, generate: () => { calls++; throw Error('provider unavailable') } })
  assert.equal(await service.request('a', 'stale', 'r'), null); assert.equal(calls, 0)
  assert.equal(await service.request('a', 'answer', 'r'), null)
  assert.equal(await service.request('a', 'answer', 'r2'), null); assert.equal(calls, 1)
})
