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

test('packaged updater checks first and downloads only after explicit confirmation', async () => {
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '0.9.28' }) }
  let downloads = 0
  updater.downloadUpdate = async () => { downloads += 1; updater.emit('download-progress', { percent: 51.4 }); updater.emit('update-downloaded', { version: '0.9.28' }) }
  let installArgs
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  const checked = await controller.check(true)
  assert.equal(checked.status, 'available')
  assert.equal(checked.progress, 0)
  assert.equal(downloads, 0)
  assert.equal(installArgs, undefined)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.autoRunAppAfterInstall, false)
  assert.equal(updater.disableDifferentialDownload, false)
  assert.equal(updater.disableWebInstaller, true)
  const downloaded = await controller.download()
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
