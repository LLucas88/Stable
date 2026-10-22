'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { sortModelsByRelease } = require('../desktop/services/model-release-order.cjs')

test('release order crosses providers and handles later variants without mutating routes', () => {
  const items = ['glm-4.7', 'unknown-z', 'glm-5', 'deepseek-flash', 'GLM-5.3-FLASHX', 'glm-4.7-flash', 'glm-5-turbo', 'unknown-a'].map(model => ({ id: model, model }))
  const original = structuredClone(items)
  assert.deepEqual(sortModelsByRelease(items).map(item => item.id), ['deepseek-flash', 'GLM-5.3-FLASHX', 'glm-5-turbo', 'glm-5', 'glm-4.7-flash', 'glm-4.7', 'unknown-z', 'unknown-a'])
  assert.deepEqual(items, original)
  assert.equal(sortModelsByRelease(items)[0], items[3])
})

test('same-day releases retain their order', () => {
  const items = [{ model: 'glm-4.5-air' }, { model: 'glm-4.5' }]
  assert.deepEqual(sortModelsByRelease(items), items)
})
