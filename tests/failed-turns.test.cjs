'use strict'
const { readSource } = require('./helpers/read-source.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { ConversationLifecycle } = require('../desktop/services/conversation-lifecycle.cjs')
const { failedTurn } = require('../desktop/services/failed-turn.cjs')
const { createStreamTranscript } = require('../desktop/services/stream-transcript.cjs')

function fixture(t, runtimeAdapter = { read: async () => ({ noRuntime: true }) }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-failed-turn-'))
  const store = new StableStore(root), id = store.activeConversationId()
  const life = new ConversationLifecycle(store, { userData: root, runtimeAdapter })
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  const start = (key, content) => {
    life.begin(key, id, { content })
    const user = store.addMessage(id, 'user', content)
    life.status(key, 'running', { userMessageId: user, threadId: 'thread', turnId: key })
    return user
  }
  return { store, id, life, start }
}

test('failure closes pending actions and keeps public partial text with a short error', () => {
  const stream = createStreamTranscript()
  stream.append({ id: 'partial', time: 1, delta: '已经读完表格，正在生成' })
  const trace = [stream.snapshot(), { id: 'tool', kind: 'tool', toolName: 'Bash', status: 'running', time: 2 }]
  const result = failedTurn({ id: 'delivery', trace, items: [{ id: 'partial', type: 'agentMessage', text: '已经读完表格，正在生成' }], error: '上游连接断开\n' + 'stack trace '.repeat(100) })
  assert(result.content.length < 260)
  assert.equal(result.trace.filter(item => item.eventType === 'agent/answer').length, 1)
  assert(result.trace.every(item => item.status !== 'running'))
  assert.equal(result.trace.at(-1).status, 'failed')
  assert.equal(result.trace.find(item => item.id === 'tool').status, 'cancelled')
  assert.equal(stream.flush().content, '已经读完表格，正在生成', 'checkpoint must not consume the streaming text')
})

test('a failed turn becomes a durable assistant message once, including its text and tool checkpoint', t => {
  const { store, id, life, start } = fixture(t)
  start('first', '生成报告')
  life.checkpoint('first', [{ id: 'text', kind: 'reasoning', eventType: 'agent/answer', content: '部分结果', status: 'completed', time: 1 }, { id: 'cmd', kind: 'tool', toolName: 'Bash', status: 'running', time: 2 }])
  life.status('first', 'failed', { error: 'provider disconnected' })
  assert.equal(life.finishFailure('first', { error: 'provider disconnected' }), true)
  assert.equal(life.finishFailure('first', { error: 'duplicate' }), false)
  const messages = store.listMessages(id)
  assert.equal(messages.length, 2)
  assert.match(messages[1].content, /本轮执行失败/)
  assert(messages[1].trace.some(item => item.content === '部分结果'))
  assert.equal(messages[1].trace.find(item => item.id === 'cmd').status, 'cancelled')
})

test('startup restores old interruptions in their original turn before later questions without duplicate messages', async t => {
  const { store, id, life, start } = fixture(t)
  const first = start('first', '第一轮')
  life.item(id, 'thread', 'first', { id: 'a', type: 'agentMessage', text: '已收到的旧回复' })
  const steer = store.addMessage(id, 'user', '第一轮的补充')
  life.beginSteer('steer', id, { query: steer.content }); life.saveSteer('steer', 'accepted', steer)
  life.status('first', 'unknown', { error: '连接中断' })
  const second = start('second', '第二轮')
  const reply = store.addMessage(id, 'assistant', '第二轮完成')
  life.status('second', 'completed', { assistantMessageId: reply })
  await life.startup()
  await life.startup()
  const messages = store.listMessages(id)
  assert.deepEqual(messages.map(item => item.id).filter(value => [first.id, steer.id, second.id, reply.id].includes(value)), [first.id, steer.id, second.id, reply.id])
  assert.equal(messages.length, 5)
  assert.equal(messages[2].role, 'assistant')
  assert.match(messages[2].content, /结果未确认/)
  assert(messages[2].trace.some(item => item.content === '已收到的旧回复'))
  assert.deepEqual(messages.map(item => item.seq), [1, 2, 3, 4, 5])
  assert.deepEqual(store.messagePage(id, 4).messages.map(item => item.id), messages.slice(0, 3).map(item => item.id))
})

test('cleared or unsent turns are not recreated by failure recovery', async t => {
  const { store, id, life, start } = fixture(t)
  start('cleared', '旧消息'); store.clearMessages(id)
  life.begin('unsent', id, { content: '未发送' }); life.status('unsent', 'rejected')
  assert.equal(life.finishFailure('cleared'), false)
  assert.equal(life.finishFailure('unsent'), false)
  await life.startup()
  assert.equal(store.listMessages(id).length, 0)
})

test('the real run IPC failure path saves the terminal message and clears its active runner', async t => {
  const { store, id, life } = fixture(t)
  const source = readSource(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
  const handlerSource = source.slice(source.indexOf("ipcMain.handle('stable:agent:run'"), source.indexOf("ipcMain.handle('stable:agent:steer'"))
  const agentRunners = new Map()
  let handler, broadcasts = 0
  require('node:vm').runInNewContext(handlerSource, {
    require: name => require(path.resolve(__dirname, '../desktop', name)),
    messagePredictions: { interrupt() {} }, conversationTitles: { interrupt() {} }, scheduleConversationTitle() {},
    ipcMain: { handle: (_name, value) => { handler = value } },
    store, conversationLifecycle: life, agentRunners,
    requireText: value => value, randomUUID: () => 'request',
    modelRegistry: { resolve: () => ({ model: {}, apiKey: 'fixture' }) },
    wendingCli: { forConversation: () => ({ login: { pending: false, snapshot: () => ({ phase: 'ready' }) } }) },
    createHarnessRunner: () => ({}), taskAlerts: { start() {}, finish() {} },
    readGlobalInstructions: () => ({ content: '' }),
    clarificationTurn: require('../desktop/services/clarification.cjs').clarificationTurn,
    clarifyBeforeExecution: async ({ payload }) => ({ status: 'ready', payload }),
    prepareAgentMessage: async () => ({ attachments: [], selectedReferences: [], extractedAttachments: { installedSkills: [] }, selectedData: [], selectedKnowledge: [], selectedSkills: [], selectedScripts: [] }),
    commitAgentMessage: (_id, query) => { const messageId = store.addMessage(id, 'user', query); life.status('request', 'saved', { userMessageId: messageId }); return { id: messageId } },
    automationIntent: () => false,
    runAgent: async () => {
      life.status('request', 'running', { threadId: 'thread', turnId: 'turn' })
      life.checkpoint('request', [{ id: 'partial', kind: 'reasoning', eventType: 'agent/answer', content: '正在生成报告', status: 'completed', time: 1 }])
      throw Error('connection interrupted')
    },
    publishAgentState: () => { broadcasts++ },
  })
  await assert.rejects(handler(null, { conversationId: id, clientRequestId: 'request', prompt: '生成报告' }), /connection interrupted/)
  const messages = store.listMessages(id)
  assert.equal(messages.length, 2)
  assert.match(messages[1].content, /connection interrupted/)
  assert(messages[1].trace.some(item => item.content === '正在生成报告'))
  assert.equal(life.deliveries(id)[0].state, 'failed')
  assert.equal(agentRunners.size, 0)
  assert.equal(broadcasts, 1)
})
