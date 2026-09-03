'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { readFileSync } = require('node:fs')
const { createWindowPresence, registerCompletedCountIpc, badgeScript, validateCompletedCount } = require('../desktop/services/window-presence.cjs')
const { createUpdateController } = require('../desktop/services/updater.cjs')

function fixture(isInstalling) {
  const app = new EventEmitter(), window = new EventEmitter()
  window.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, executeJavaScript: async () => 'png' })
  window.isDestroyed = () => false
  const overlays = []; let minimizes = 0
  window.minimize = () => minimizes++
  window.setOverlayIcon = (...args) => overlays.push(args)
  const presence = createWindowPresence({ app, nativeImage: { createFromDataURL: value => value }, platform: 'win32', isInstalling })
  presence.attach(window)
  const close = () => { let prevented = false; window.emit('close', { preventDefault: () => { prevented = true } }); return prevented }
  return { app, window, overlays, presence, close, minimizes: () => minimizes }
}

test('close minimizes without terminating; explicit quit and Windows shutdown may close', () => {
  const a = fixture()
  assert.equal(a.close(), true); assert.equal(a.minimizes(), 1)
  a.app.emit('before-quit'); assert.equal(a.close(), false)
  const b = fixture(); b.window.emit('query-session-end'); assert.equal(b.close(), false)
})

test('updater allows closing windows before quitAndInstall, not after', () => {
  let controller
  const f = fixture(() => controller?.state().status === 'installing'), updater = new EventEmitter()
  let installed = false
  updater.quitAndInstall = () => { assert.equal(f.close(), false); installed = true }
  controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: 'test' })
  assert.throws(() => controller.install()); assert.equal(f.close(), true)
  updater.emit('update-downloaded', { version: 'next' }); controller.install()
  assert.equal(installed, true)
  updater.emit('error', new Error('Install failed'))
  assert.equal(f.close(), true, 'a failed update must restore close-to-minimize')
})

test('badge clear/new count wins pending renders and displays complete accessible count', async () => {
  const f = fixture(), pending = []
  f.window.webContents.executeJavaScript = () => new Promise(resolve => pending.push(resolve))
  const first = f.presence.setCompletedCount(1)
  await f.presence.setCompletedCount(0)
  pending.shift()('stale'); await first
  assert.deepEqual(f.overlays, [[null, '']])
  const old = f.presence.setCompletedCount(2), next = f.presence.setCompletedCount(105)
  pending.pop()('latest'); await next; pending.shift()('stale'); await old
  assert.deepEqual(f.overlays.at(-1), ['latest', '105 个任务已完成，尚未查看'])
  assert.match(badgeScript(105), /99\+/)
  assert.match(badgeScript(8), /fillStyle = '#000000'[\s\S]*fillStyle = '#ffffff'/)
})

test('badge IPC only accepts bounded counts from the main window main frame', async () => {
  const f = fixture(); let handler
  registerCompletedCountIpc({ handle: (_name, fn) => { handler = fn } }, () => f.window, f.presence)
  const event = { sender: f.window.webContents, senderFrame: f.window.webContents.mainFrame }
  for (const count of [-1, NaN, Infinity, 1.2, '1', undefined, 1_000_001]) {
    assert.throws(() => validateCompletedCount(count)); await assert.rejects(handler(event, { count }))
  }
  assert.throws(() => handler({ ...event, senderFrame: {} }, { count: 1 }))
  assert.throws(() => handler({ ...event, sender: {} }, { count: 1 }))
  assert.equal(await handler(event, { count: 2 }), 2)
})

test('UI count excludes deleted/running tasks; main wiring preserves background execution and explicit exit', () => {
  const app = readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
  assert.match(app, /state.conversations.filter\(\(item\) => unread.has\(item.id\) && !runningMap\[item.id\]\).length/)
  assert.match(app, /setCompletedCount\?\.\(completedUnreadCount\)/)
  const main = readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
  assert.match(main, /windowPresence.attach\(window\)/)
  assert.match(main, /isInstalling: \(\) => updateController\?\.state\(\).status === 'installing'/)
  assert.match(main, /label: '退出 Stable', click: \(\) => app.quit\(\)/)
  assert.match(main, /backgroundThrottling: false/)
})

test('hidden Electron: real CSS spinner/instant hover, native badge PNG and background close', { skip: process.platform !== 'win32', timeout: 40_000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise(resolve => {
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/window-presence-ui.cjs')], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output }) }, 35_000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /WINDOW_PRESENCE_UI_PASSED/)
})
