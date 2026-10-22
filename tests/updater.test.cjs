'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createUpdateController, publicError } = require('../desktop/services/updater.cjs')

test('development builds never contact the release service', async () => {
  let checks = 0
  const updater = { checkForUpdates: async () => { checks += 1 } }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: false, currentVersion: '0.9.27' })
  assert.equal((await controller.check(true)).status, 'development')
  assert.equal(checks, 0)
})

test('packaged updater automatically downloads but waits for an explicit install', async () => {
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '0.9.28' }) }
  let downloads = 0
  updater.downloadUpdate = async () => { downloads += 1; updater.emit('download-progress', { percent: 51.4 }); updater.emit('update-downloaded', { version: '0.9.28' }) }
  let installArgs
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  const checked = await controller.check(true)
  assert.equal(checked.status, 'downloaded')
  assert.equal(checked.progress, 100)
  assert.equal(downloads, 1)
  assert.equal(installArgs, undefined)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.autoRunAppAfterInstall, false)
  assert.equal(updater.disableDifferentialDownload, false)
  assert.equal(updater.disableWebInstaller, true)
  const downloaded = await controller.check(true)
  assert.equal(downloads, 1)
  assert.equal(downloaded.status, 'downloaded')
  assert.equal(downloaded.progress, 100)
  assert.doesNotMatch(publicError(new Error('failed https://secret.example/token')), /secret\.example/)
  controller.dispose()
})

test('install confirmation opens the installer UI and leaves restart to the user', () => {
  const updater = new EventEmitter()
  let installArgs
  updater.checkForUpdates = async () => {}
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  updater.emit('update-downloaded', { version: '0.9.28' })
  assert.equal(controller.install(), true)
  assert.deepEqual(installArgs, [false, false])
  assert.equal(controller.state().status, 'installing')
  assert.equal(controller.state().progress, 0)
  controller.dispose()
})


test('repeated checks preserve a pending download and a ready installer', async () => {
  const updater = new EventEmitter(); let checks = 0, downloads = 0, finish
  updater.checkForUpdates = async () => { checks++; updater.emit('update-available', { version: '1.2.0' }) }
  updater.downloadUpdate = () => { downloads++; return new Promise(resolve => { finish = resolve }) }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '1.1.0' })
  await controller.check(); updater.emit('download-progress', { percent: 42 })
  await controller.check(true); updater.emit('update-available', { version: '1.2.0' })
  assert.equal(checks, 1); assert.equal(downloads, 1); assert.equal(controller.state().progress, 42)
  assert.throws(() => controller.install(), /尚未下载完成/)
  updater.emit('update-downloaded', { version: '1.2.0' }); finish(); await controller.check()
  assert.equal(controller.state().status, 'downloaded'); assert.equal(checks, 1)
  controller.dispose()
})

test('failed automatic download can retry without installing, and failed install stays ready', async () => {
  const updater = new EventEmitter(); let fail = true
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '1.2.0' })
  updater.downloadUpdate = async () => { if (fail) throw Error('offline'); updater.emit('update-downloaded', { version: '1.2.0' }) }
  updater.quitAndInstall = () => { throw Error('installer unavailable') }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '1.1.0' })
  await controller.check(); assert.equal(controller.state().status, 'error')
  fail = false; await controller.check(true); assert.equal(controller.state().status, 'downloaded')
  assert.throws(() => controller.install(), /installer unavailable/)
  assert.equal(controller.state().status, 'downloaded'); assert.equal(controller.state().progress, 100)
  controller.dispose()
})

test('startup schedules checks once and never installs on its own', async () => {
  const updater = new EventEmitter(); let checks = 0, installs = 0
  updater.checkForUpdates = async () => { checks++; updater.emit('update-available', { version: '1.2.0' }) }
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '1.2.0' })
  updater.quitAndInstall = () => installs++
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '1.1.0', checkDelayMs: 1, checkIntervalMs: 5 })
  try {
    controller.start(); controller.start()
    await new Promise(resolve => setTimeout(resolve, 35))
    assert.equal(checks, 1); assert.equal(installs, 0); assert.equal(controller.state().status, 'downloaded')
  } finally { controller.dispose() }
})
