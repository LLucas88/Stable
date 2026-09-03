'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { formatElapsedTime } = require('../src/duration.ts')

const root = path.resolve(__dirname, '..')

test('execution duration uses seconds, minutes, and hours at the confirmed boundaries', () => {
  assert.equal(formatElapsedTime(0), '0秒')
  assert.equal(formatElapsedTime(49_999), '49秒')
  assert.equal(formatElapsedTime(60_000), '1分钟0秒')
  assert.equal(formatElapsedTime(289_999), '4分钟49秒')
  assert.equal(formatElapsedTime(3_889_999), '1小时4分钟49秒')
})

test('execution duration clamps invalid or negative values to zero', () => {
  assert.equal(formatElapsedTime(-1_000), '0秒')
  assert.equal(formatElapsedTime(Number.NaN), '0秒')
})

test('execution timer is the compact disclosure label without a separate process heading', () => {
  const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
  const trace = app.slice(app.indexOf('function RunTrace'), app.indexOf('function markdownTableCells'))
  assert.match(trace, /className="trace-elapsed" role="timer"/)
  assert.match(trace, /className="trace-summary"[\s\S]*className="trace-elapsed"/)
  assert.doesNotMatch(trace, /<strong>执行过程<\/strong>/)
  assert.equal((app.match(/className="trace-elapsed"/g) || []).length, 1)
  assert.match(trace, /window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/)
  assert.match(trace, /if \(status !== 'running'\) return/)
})
