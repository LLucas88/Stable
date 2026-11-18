'use strict'
const { readSource } = require('./helpers/read-source.cjs')

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('QA capture delay remains configurable after splash removal', () => {
  const main = readSource(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8')
  assert.match(main, /STABLE_QA_CAPTURE_DELAY/)
  assert.match(main, /setTimeout\(async \(\) => \{[\s\S]*\}, captureDelay\)/)
})
