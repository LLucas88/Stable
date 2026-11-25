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
  assert.equal(updater.autoRunAppAfterInstall, true)
  assert.equal(updater.disableDifferentialDownload, false)
  assert.equal(updater.disableWebInstaller, true)
  const downloaded = await controller.check(true)
  assert.equal(downloads, 1)
  assert.equal(downloaded.status, 'downloaded')
  assert.equal(downloaded.progress, 100)
  assert.doesNotMatch(publicError(new Error('failed https://secret.example/token')), /secret\.example/)
  controller.dispose()
})

test('install opens progress UI and requests automatic relaunch', async () => {
  const updater = new EventEmitter()
  let installArgs
  updater.checkForUpdates = async () => {}
  updater.quitAndInstall = (...args) => { installArgs = args }
  const controller = createUpdateController({ autoUpdater: updater, isPackaged: true, currentVersion: '0.9.27' })
  updater.emit('update-downloaded', { version: '0.9.28' })
  assert.equal(await controller.install(), true)
  assert.deepEqual(installArgs, [false, true])
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
  await assert.rejects(controller.install(), /尚未下载完成/)
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
  await assert.rejects(controller.install(), /installer unavailable/)
  assert.equal(controller.state().status, 'downloaded'); assert.equal(controller.state().progress, 100)
  controller.dispose()
})

function scenario(beforeInstall = async () => {}, options = {}) {
  const updater = new EventEmitter(), calls = { checks:0, downloads:0, installs:[] }
  updater.checkForUpdates = async () => { calls.checks++; updater.emit('update-available',{version:'1.2.0'}) }
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('update-downloaded',{version:'1.2.0'}) }
  updater.quitAndInstall = (...args) => calls.installs.push(args)
  const controller = createUpdateController({autoUpdater:updater,isPackaged:true,currentVersion:'1.1.0',beforeInstall,...options})
  return {updater,calls,controller}
}
const tick = () => new Promise(resolve=>setImmediate(resolve))
test('one click checks, downloads, guards again and installs exactly once', async () => {
  let guards=0
  const {controller,calls}=scenario(async()=>{guards++})
  await controller.oneClick(); await tick()
  assert.equal(guards,2); assert.equal(calls.checks,1); assert.equal(calls.downloads,1)
  assert.deepEqual(calls.installs,[[false,true]])
  await controller.oneClick(); await controller.install()
  assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('a downloaded update is reused without another download', async () => {
  const {controller,calls}=scenario()
  await controller.check(); assert.equal(calls.installs.length,0)
  await controller.oneClick(); await tick()
  assert.equal(calls.checks,1); assert.equal(calls.downloads,1); assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('the installer waits for final quit preparation only after downloading', async t => {
  let finish, prepareCalls = 0
  const {controller,calls} = scenario(undefined, {withInstallQuit: async commit => {
    prepareCalls++
    await new Promise(resolve => { finish = resolve })
    return commit()
  }})
  t.after(() => controller.dispose())
  await controller.check()
  assert.equal(prepareCalls, 0, 'background download does not request permission to quit')
  const pending = controller.install()
  await tick()
  assert.equal(prepareCalls, 1)
  assert.deepEqual(calls.installs, [])
  assert.equal(controller.state().status, 'downloaded')
  finish()
  assert.equal(await pending, true)
  assert.deepEqual(calls.installs, [[false, true]])
})
test('canceling final quit preparation keeps the downloaded update and invalidates the old commit', async t => {
  let canceled = 0, allowed = false, abandonedCommit
  const {controller,calls,updater} = scenario(undefined, {
    prepareInstall: async () => ({cancel: () => { canceled++ }, install: target => target.quitAndInstall(true, true)}),
    withInstallQuit: async commit => {
      if (allowed) return commit()
      abandonedCommit = commit
      return false
    },
  })
  t.after(() => controller.dispose())
  await controller.oneClick()
  await tick()
  assert.equal(canceled, 1)
  assert.equal(controller.state().oneClick, false)
  assert.equal(controller.state().status, 'downloaded')
  assert.equal(abandonedCommit(), false)
  updater.emit('update-downloaded', {version:'1.2.0'})
  assert.deepEqual(calls.installs, [])
  allowed = true
  await controller.oneClick()
  assert.equal(calls.downloads, 1)
  assert.deepEqual(calls.installs, [[true, true]])
})
test('an update error invalidates final quit preparation before it can launch an installer', async t => {
  let finish, canceled = 0
  const {controller,calls,updater} = scenario(undefined, {
    prepareInstall: async () => ({cancel: () => { canceled++ }, install: target => target.quitAndInstall(true, true)}),
    withInstallQuit: async commit => {
      await new Promise(resolve => { finish = resolve })
      return commit()
    },
  })
  t.after(() => controller.dispose())
  await controller.check()
  const pending = controller.install()
  await tick()
  updater.emit('error', Error('update no longer valid'))
  finish()
  assert.equal(await pending, false)
  assert.deepEqual(calls.installs, [])
  assert.equal(canceled, 1)
  assert.equal(controller.state().status, 'error')
})
test('duplicate clicks during preflight and download join the same operation', async () => {
  let ready, finish
  let checks=0
  const {updater,controller,calls}=scenario(()=>++checks===1?new Promise(r=>{ready=r}):Promise.resolve())
  updater.downloadUpdate=()=>{calls.downloads++;return new Promise(r=>{finish=()=>{updater.emit('update-downloaded',{version:'1.2.0'});r()}})}
  const first=controller.oneClick(); await controller.oneClick()
  assert.equal(calls.checks,0)
  ready(); await first; await controller.oneClick(); await controller.check()
  assert.equal(calls.downloads,1);assert.equal(calls.checks,1)
  finish();await tick();assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('work starting during download blocks install, preserves the cached update and permits retry', async () => {
  let busy=false,finish
  const {updater,controller,calls}=scenario(async()=>{if(busy)throw Error('任务运行中')})
  updater.downloadUpdate=()=>{calls.downloads++;return new Promise(r=>{finish=()=>{updater.emit('update-downloaded',{version:'1.2.0'});r()}})}
  await controller.oneClick();busy=true;finish();await tick()
  assert.equal(calls.installs.length,0); assert.equal(controller.state().status,'downloaded')
  assert.equal(controller.state().oneClick,false); assert.match(controller.state().error,/任务运行中/)
  busy=false;await controller.oneClick();await tick()
  assert.equal(calls.downloads,1);assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('unsafe preflight and a failed download disarm automatic install', async () => {
  let busy=true
  const {updater,controller,calls}=scenario(async()=>{if(busy)throw Error('请先保存')})
  await controller.oneClick();assert.equal(calls.checks,0);assert.equal(controller.state().oneClick,false)
  busy=false;updater.downloadUpdate=async()=>{throw Error('network failure')}
  await controller.oneClick();await tick()
  assert.equal(controller.state().oneClick,false)
  updater.emit('update-downloaded',{version:'1.2.0'});await tick()
  assert.equal(calls.installs.length,0)
  await controller.oneClick();await tick();assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('one click can adopt a background download but ordinary background checks never install', async () => {
  let finish
  const {updater,controller,calls}=scenario()
  updater.downloadUpdate=()=>{calls.downloads++;return new Promise(r=>{finish=()=>{updater.emit('update-downloaded',{version:'1.2.0'});r()}})}
  await controller.check();await controller.oneClick();finish();await tick()
  assert.equal(calls.checks,1);assert.equal(calls.downloads,1);assert.equal(calls.installs.length,1)
  controller.dispose()
})
test('latest version, emitted installer errors and disposal do not leave a restart armed', async () => {
  const {updater,controller,calls}=scenario()
  updater.checkForUpdates=async()=>updater.emit('update-not-available',{version:'1.1.0'})
  await controller.oneClick();assert.equal(controller.state().status,'current');assert.equal(controller.state().oneClick,false)
  updater.emit('update-downloaded',{version:'1.2.0'})
  updater.quitAndInstall=()=>updater.emit('error',Error('installer cannot start'))
  await controller.oneClick();assert.equal(controller.state().status,'error');assert.equal(controller.state().oneClick,false)
  controller.dispose();assert.equal(calls.installs.length,0)
  let ready
  const second=scenario(()=>new Promise(r=>{ready=r}))
  const pending=second.controller.oneClick();second.controller.dispose();ready();await pending
  assert.equal(second.calls.checks,0)
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
