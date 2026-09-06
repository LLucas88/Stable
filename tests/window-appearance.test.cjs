'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createWindowAppearance } = require('../desktop/services/window-appearance.cjs')

function fixture({ platform = 'win32', version = '10.0.26200', gpu = 'enabled', fails = false } = {}) {
  const nativeTheme = Object.assign(new EventEmitter(), { themeSource: 'system', shouldUseHighContrastColors: false })
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    setBackgroundMaterial(value) { if (fails && value === 'mica') throw Error('Unsupported material'); this.material = value },
    setBackgroundColor(value) { this.background = value },
    setTitleBarOverlay(value) { this.overlay = value },
    webContents: { isDestroyed: () => false, send(channel, value) { this.channel = channel; this.state = value } },
  })
  const appearance = createWindowAppearance({ platform, osRelease: () => version, nativeTheme, app: { getGPUFeatureStatus: () => ({ gpu_compositing: gpu }) } })
  return { appearance, window, nativeTheme }
}

test('Mica and renderer transparency switch together with the selected app theme', () => {
  const { appearance, window, nativeTheme } = fixture()
  assert.equal(appearance.apply(window, 'light'), 'mica')
  assert.equal(window.background, '#00000000')
  assert.equal(window.material, 'mica')
  assert.equal(window.overlay.color, '#00000000')
  assert.equal(nativeTheme.themeSource, 'light')
  assert.deepEqual(window.webContents.state, { material: 'mica', theme: 'light' })
  appearance.apply(window, 'dark')
  assert.equal(window.overlay.symbolColor, '#dfdfdf')
  assert.equal(nativeTheme.themeSource, 'dark')
})

test('unsupported platform/build, GPU fallback and material errors retain an opaque reading surface', () => {
  for (const options of [{ platform: 'linux' }, { version: '10.0.19045' }, { gpu: 'disabled_software' }, { fails: true }]) {
    const { appearance, window } = fixture(options)
    assert.equal(appearance.apply(window, 'dark'), 'opaque')
    assert.equal(window.background, '#141414')
    assert.equal(window.webContents.state.material, 'opaque')
    assert.equal(appearance.apply(window, 'light'), 'opaque')
    assert.equal(window.background, '#f6f6f6')
  }
})

test('system changes respect launch timing and remove their listener when the window closes', () => {
  const { appearance, window, nativeTheme } = fixture()
  appearance.watch(window)
  nativeTheme.emit('updated')
  assert.equal(window.background, undefined, 'Do not replace the splash before launch completes')
  appearance.apply(window, 'light')
  nativeTheme.shouldUseHighContrastColors = true
  nativeTheme.emit('updated')
  assert.equal(window.material, 'none')
  assert.equal(window.webContents.state.material, 'opaque')
  nativeTheme.shouldUseHighContrastColors = false
  nativeTheme.emit('updated')
  assert.equal(window.material, 'mica')
  window.emit('closed')
  assert.equal(nativeTheme.listenerCount('updated'), 0)
})
