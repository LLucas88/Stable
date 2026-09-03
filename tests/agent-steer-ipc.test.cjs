const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const main = readFileSync(path.join(__dirname, '..', 'desktop/main.cjs'), 'utf8')
const source = main.slice(main.indexOf("ipcMain.handle('stable:agent:steer'"), main.indexOf("ipcMain.handle('stable:agent:cancel'"))
const tick = () => new Promise((resolve) => setImmediate(resolve))
function setup() {
  let handler, prepareRoute, calls = 0, commits = 0, answer
  const modelRoute = { model: { id: 'frozen' } }
  const control = { phase: 'agent', cancelled: false, modelRoute, steerRequests: new Map(), directions: [], steerInputs: [], runner: { steerReady: true, steer: () => { calls++; return new Promise((resolve, reject) => { answer = { resolve, reject } }) } } }
  const agentRunners = new Map([['a', control]])
  vm.runInNewContext(source, {
    ipcMain: { handle: (_name, callback) => { handler = callback } }, agentRunners,
    requireText: (value) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid input'); return value },
    prepareAgentMessage: async (_payload, _id, route) => { prepareRoute = route; return { attachments: [] } },
    store: { listMessages: () => [], getSetting: () => '', conversation: () => ({ capability: 'auto' }) },
    isWendingCliPrompt: () => false, composeAgentPrompt: ({ query }) => query,
    isImageAttachment: () => false, commitAgentMessage: () => { commits++ }, agentState: () => ({ activeConversationId: 'a' }),
  })
  return { control, send: (id = 'message') => handler(null, { conversationId: 'a', requestId: id, prompt: 'new instruction' }), stats: () => ({ calls, commits, prepareRoute }), answer: () => answer }
}

test('real steer IPC handler deduplicates pending/successful receipts and commits only after acceptance', async () => {
  const env = setup()
  const a = env.send(); const duplicate = env.send(); await tick()
  assert.equal(env.stats().calls, 1); assert.equal(env.stats().commits, 0)
  assert.equal(env.stats().prepareRoute, env.control.modelRoute)
  env.answer().resolve(true); await Promise.all([a, duplicate, env.send()])
  assert.equal(env.stats().calls, 1); assert.equal(env.stats().commits, 1)
  assert.equal(env.control.directions[0], 'new instruction')
  assert.match(env.control.steerInputs[0].prompt, /new instruction/)
})

test('real steer IPC retries explicit rejection but retains uncertain receipts and rejects terminal phases', async () => {
  const env = setup()
  const first = env.send(); await tick(); const rejected = assert.rejects(first, /rejected/)
  env.answer().reject(new Error('rejected')); await rejected
  const second = env.send(); await tick()
  assert.equal(env.stats().calls, 2)
  const uncertain = assert.rejects(second, /uncertain/)
  env.answer().reject(Object.assign(new Error('uncertain'), { code: 'STEER_UNCERTAIN' })); await uncertain
  await assert.rejects(env.send(), /uncertain/)
  assert.equal(env.stats().calls, 2); assert.equal(env.stats().commits, 0)
  env.control.phase = 'finishing'
  await assert.rejects(env.send('another'), /可调整/)
  assert.equal(env.stats().calls, 2)
})
