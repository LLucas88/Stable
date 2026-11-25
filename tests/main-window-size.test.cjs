'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { defaultMainWindowSize, applyDefaultMainWindowSize } = require('../desktop/services/main-window-size.cjs')

const primary = { scaleFactor: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }

test('Stable uses the physical default at both standard and fractional display scale', () => {
  assert.deepEqual(defaultMainWindowSize(primary), { width: 1520, height: 1063, minWidth: 1180, minHeight: 720 })
  assert.deepEqual(defaultMainWindowSize({ ...primary, scaleFactor: 1.25 }), {
    width: 1216, height: 850, minWidth: 1180, minHeight: 720,
  })
})

test('a manually resized window returns to the default dimensions while keeping its origin when it fits', () => {
  const sizes = []
  let bounds = { x: 200, y: 2, width: 1200, height: 800 }
  const window = {
    getBounds: () => bounds,
    setMinimumSize: (...size) => sizes.push(size),
    setBounds: value => { bounds = value },
  }
  applyDefaultMainWindowSize(window, primary)
  assert.deepEqual(bounds, { x: 200, y: 2, width: 1520, height: 1063 })
  assert.deepEqual(sizes, [[1180, 720]])
})

test('restoring on a smaller secondary display clamps position and size and corrects fractional rounding', () => {
  const display = { scaleFactor: 1.25, workArea: { x: -1120, y: 30, width: 1120, height: 910 } }
  let bounds = { x: -100, y: 450, width: 1200, height: 800 }
  let minimum, updates = 0
  const window = {
    getBounds: () => bounds,
    setMinimumSize: (...size) => { minimum = size },
    setBounds: value => { updates++; bounds = { ...value, height: value.height + 1 } },
  }
  applyDefaultMainWindowSize(window, display)
  assert.deepEqual(bounds, { x: -1120, y: 90, width: 1120, height: 850 })
  assert.deepEqual(minimum, [1120, 720])
  assert.equal(updates, 2)
})
