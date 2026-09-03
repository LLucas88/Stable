const test = require('node:test')
const assert = require('node:assert/strict')
const { MessageOutbox } = require('../src/message-outbox.ts')
const tick = () => new Promise((resolve) => setImmediate(resolve))
function setup() {
  const calls = []; const runs = []; const steers = []
  const queue = new MessageOutbox({
    run: (id, entry) => { calls.push([id, entry.payload]); return new Promise((resolve) => runs.push(resolve)) },
    steer: (id, entry) => new Promise((resolve, reject) => steers.push({ id, entry, resolve, reject })),
    changed: () => {},
  })
  return { queue, calls, runs, steers }
}
const success = { accepted: true, continue: true }

test('outbox sends FIFO only after each full task resolves and isolates conversations', async () => {
  const { queue, calls, runs } = setup()
  queue.enqueue('a', 'A1'); queue.enqueue('a', 'A2'); queue.enqueue('a', 'A3'); queue.enqueue('b', 'B1')
  assert.deepEqual(calls, [['a', 'A1'], ['b', 'B1']])
  runs[0](success); await tick()
  assert.deepEqual(calls[2], ['a', 'A2'])
  runs[2](success); await tick()
  assert.deepEqual(calls[3], ['a', 'A3'])
  runs[1](success); runs[3](success); await tick()
  assert.equal(queue.snapshot('a').items.length, 0)
  assert.equal(queue.snapshot('a').running, false)
})

test('steering reserves one queued item and cannot double send at the completion boundary', async () => {
  const { queue, calls, runs, steers } = setup()
  queue.enqueue('a', 'first')
  const id = queue.enqueue('a', 'steer this')
  queue.enqueue('a', 'last')
  const steering = queue.steer('a', id)
  void queue.steer('a', id)
  assert.equal(steers.length, 1)
  assert.equal(queue.remove('a', id), false)
  assert.equal(queue.edit('a', id, 'changed'), false)
  runs[0](success); await tick()
  assert.equal(calls.length, 1)
  steers[0].resolve(); await steering; await tick()
  assert.deepEqual(calls, [['a', 'first'], ['a', 'last']])
  runs[1](success)
})

test('steering failure keeps the message and pauses rather than silently resending', async () => {
  const { queue, calls, runs, steers } = setup()
  queue.enqueue('a', 'first')
  const id = queue.enqueue('a', 'do not lose')
  const pending = queue.steer('a', id)
  steers[0].reject(new Error('not received')); await pending
  runs[0](success); await tick()
  assert.equal(calls.length, 1)
  assert.equal(queue.snapshot('a').items[0].error, 'not received')
  assert.equal(queue.snapshot('a').paused, true)
})

test('failed preparation retains attachments and editing/cancellation cannot dispatch accidentally', async () => {
  const { queue, calls, runs } = setup()
  const payload = { text: 'first', attachments: [{ path: 'file.png' }], references: ['skill'] }
  queue.enqueue('a', payload)
  runs[0]({ accepted: false, continue: false, error: 'file missing' }); await tick()
  const entry = queue.snapshot('a').items[0]
  assert.deepEqual(entry.payload, payload)
  const oldId = entry.id
  queue.edit('a', entry.id, { ...payload, text: 'edited' })
  assert.equal(queue.snapshot('a').items[0].payload.text, 'edited')
  assert.notEqual(queue.snapshot('a').items[0].id, oldId)
  assert.equal(calls.length, 1)
  queue.resume('a'); assert.equal(calls.length, 2)
  queue.enqueue('a', 'next'); queue.pause('a')
  runs[1]({ accepted: true, continue: false }); await tick()
  assert.equal(queue.snapshot('a').items[0].payload, 'next')
  assert.equal(calls.length, 2)
})

test('idle send-now promotes the chosen message and queue has a bounded length', async () => {
  const { queue, calls, runs } = setup()
  queue.pause('a'); queue.enqueue('a', 'one'); const id = queue.enqueue('a', 'two')
  await queue.steer('a', id)
  assert.deepEqual(calls, [['a', 'two']])
  assert.equal(queue.remove('a', queue.snapshot('a').items[0].id), true)
  for (let n = 0; n < 20; n++) queue.enqueue('a', n)
  assert.throws(() => queue.enqueue('a', 21), /20/)
  queue.pause('a'); runs[0](success)
})
