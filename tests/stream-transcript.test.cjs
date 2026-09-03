'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createStreamTranscript } = require('../desktop/services/stream-transcript.cjs')

test('complete visible text survives tool boundaries, new steps and retried sessions', () => {
  const transcript = createStreamTranscript()
  const event = { id: 'session-one:0:0', time: 1, delta: '第一段' }
  assert.equal(transcript.append(event), undefined)
  transcript.append({ ...event, delta: '补充'.repeat(5000) })
  const first = transcript.append({ id: 'session-two:0:0', time: 2, delta: '下一段' })
  assert.equal(first.content, '第一段' + '补充'.repeat(5000))
  assert.equal(first.status, 'completed')
  assert.equal(transcript.flush().content, '下一段')
  assert.equal(transcript.flush(), undefined)
})
