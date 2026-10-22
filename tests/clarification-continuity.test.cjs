const test = require('node:test'), assert = require('node:assert/strict')
const { clarificationTurn } = require('../desktop/services/clarification.cjs')
const { groupConversationTurns, conversationTurnTrace, clarificationContinuation } = require('../src/conversation-turns.ts')
const { failedTurn } = require('../desktop/services/failed-turn.cjs')

const question = (id, time, previous) => ({ id, role: 'assistant', content: '哪种格式？', createdAt: new Date(time).toISOString(), trace: [
  clarificationTurn(previous || [], '继续', id, time),
  { id: 'read', runId: id, kind: 'tool', status: 'completed', title: '读取文件', time: time + 5 },
  { id: 'clarification', kind: 'status', status: 'completed', time: time + 10, clarification: { id: `q-${id}`, status: 'waiting', question: '哪种格式？' } },
] })
const reply = (id, time) => ({ id, role: 'user', content: '针对“哪种格式？”的补充：\nHTML', createdAt: new Date(time).toISOString(), attachments: [{ kind: 'attachment', name: 'source.csv', path: 'D:/source.csv' }] })

test('multiple clarification deliveries retain one start, one display turn and ordered replies after reload', () => {
  const first = question('a', 1000), user = reply('u', 80000)
  const second = question('b', 90000, [first])
  const final = { id: 'c', role: 'assistant', content: '交付 report.html', createdAt: new Date(150000).toISOString(), trace: [clarificationTurn([first, user, second], 'HTML', 'd', 140000), { id: 'complete', kind: 'status', status: 'completed', time: 150000 }] }
  const raw = [first, user, second, reply('u2', 130000), final], original = JSON.stringify(raw)
  const groups = groupConversationTurns(JSON.parse(original))
  assert.equal(groups.length, 1); assert.equal(groups[0].key, 'a'); assert.equal(groups[0].waiting, false)
  assert.equal(final.trace[0].startedAt, 1000)
  const trace = conversationTurnTrace(groups[0].messages)
  assert.equal(Math.max(...trace.map(i => i.time)) - Math.min(...trace.map(i => i.startedAt ?? i.time)), 149000)
  assert.deepEqual(trace.filter(i => i.clarificationReply).map(i => i.clarificationReply.id), ['u', 'u2'])
  assert.equal(trace.filter(i => i.kind === 'tool').length, 2)
  assert.equal(new Set(trace.map(i => i.id)).size, trace.length)
  assert.equal(trace.find(i => i.clarificationReply).clarificationReply.attachments[0].name, 'source.csv')
  assert.equal(JSON.stringify(raw), original)
})

test('waiting and live resumption use the same group key and keep the earlier process visible', () => {
  const first = question('a', 1000)
  assert.equal(groupConversationTurns([first])[0].waiting, true)
  const continuation = clarificationContinuation([first], 'q-a')
  assert.deepEqual(continuation, { continuationOf: 'a', startedAt: 1000 })
  assert.equal(clarificationContinuation([first], 'stale'), undefined)
  const live = { ...continuation, deliveryId: 'delivery2', runId: 'runtime2', status: 'running', items: [{ id: 'read', kind: 'tool', status: 'running', time: 95000 }], streaming: { id: 'text', time: 95001, content: '继续核对数据' } }
  const group = groupConversationTurns([first, reply('u', 90000)], live)[0]
  assert.equal(group.key, 'a'); assert.equal(group.live, live)
  const trace = conversationTurnTrace(group.messages, live)
  assert.equal(trace.filter(i => i.kind === 'tool').length, 2); assert.equal(trace.at(-1).content, '继续核对数据')
  const saved = { id: 'done', role: 'assistant', trace: [clarificationTurn([first], 'HTML', 'delivery2', 90000)] }
  const settled = groupConversationTurns([first, reply('u', 90000), saved], live)
  assert.equal(settled.length, 1); assert.equal(settled[0].live, undefined)
})

test('new tasks and unlinked ordinary messages do not merge, even with identical text', () => {
  const first = question('a', 1000), user = reply('u', 90000)
  const next = { id: 'next', role: 'assistant', trace: [clarificationTurn([first], '新任务：另一份报告', 'd', 91000)] }
  assert.equal(next.trace[0].continuationOf, undefined); assert.equal(next.trace[0].startedAt, 91000)
  assert.equal(groupConversationTurns([first, user, next]).length, 3)
  assert.equal(groupConversationTurns([first, user])[0].waiting, undefined)
  const unrelated = { ...next, trace: [{ ...next.trace[0], continuationOf: 'another-conversation' }] }
  assert.equal(groupConversationTurns([first, user, unrelated]).length, 3)
})

test('cancel and recovered failure retain the task link and stop the waiting timer', () => {
  for (const state of ['failed', 'interrupted']) {
    const first = question('a', 1000)
    const terminal = failedTurn({ id: 'd', trace: [clarificationTurn([first], 'HTML', 'd', 90000)], state, time: 100000 })
    const messages = [first, reply('u', 90000), { id: 'end', role: 'assistant', createdAt: new Date(100000).toISOString(), ...terminal }]
    const groups = groupConversationTurns(messages)
    assert.equal(groups.length, 1); assert.equal(groups[0].waiting, false)
    assert.equal(terminal.trace[0].startedAt, 1000)
    assert.equal(terminal.trace.at(-1).status, state === 'failed' ? 'failed' : 'cancelled')
  }
})

test('a paginated continuation retains full elapsed time before older history is loaded', () => {
  const first = question('a', 1000), second = question('b', 100000, [first])
  const page = groupConversationTurns([second])
  assert.equal(page[0].waiting, true)
  assert.equal(Math.min(...conversationTurnTrace(page[0].messages).map(i => i.startedAt ?? i.time)), 1000)
  assert.equal(groupConversationTurns([first, reply('u', 90000), second]).length, 1)
})
