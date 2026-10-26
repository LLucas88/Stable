'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { isCloudEnabled } = require('../desktop/services/cloud-mode.cjs')

test('installed Stable enables the original cloud gateway without launcher environment', () => {
  assert.equal(isCloudEnabled({ isPackaged: true, env: {} }), true)
  assert.equal(isCloudEnabled({ isPackaged: false, env: {} }), false)
})

test('explicit cloud mode overrides the installed and development defaults', () => {
  for (const isPackaged of [true, false]) {
    assert.equal(isCloudEnabled({ isPackaged, env: { STABLE_CLOUD_ENABLED: '1' } }), true)
    assert.equal(isCloudEnabled({ isPackaged, env: { STABLE_CLOUD_ENABLED: '0' } }), false)
  }
})
