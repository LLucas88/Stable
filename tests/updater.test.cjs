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

test('packaged updater downloads the fast-install package and waits for restart confirmation', async () => {
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '0.9.28' }); updater.emit('download-progress', { percent: 51.4 }); updater.emit('update-downloaded', { version: '0.9.28' }) }
  let installArgs
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  const state = await controller.check(true)
  assert.equal(state.status, 'downloaded')
  assert.equal(state.progress, 100)
  assert.equal(installArgs, undefined)
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, true)
  assert.equal(updater.autoRunAppAfterInstall, true)
  assert.equal(updater.disableDifferentialDownload, true)
  assert.equal(updater.disableWebInstaller, true)
  assert.doesNotMatch(publicError(new Error('failed https://secret.example/token')), /secret\.example/)
  controller.dispose()
})

test('restart confirmation uses silent install and force restart', () => {
  const updater = new EventEmitter()
  let installArgs
  updater.checkForUpdates = async () => {}
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  updater.emit('update-downloaded', { version: '0.9.28' })
  assert.equal(controller.install(), true)
  assert.deepEqual(installArgs, [true, true])
  assert.equal(controller.state().status, 'installing')
  controller.dispose()
})
