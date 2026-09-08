const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { installWindowCloseChoice } = require('../desktop/services/window-close-choice.cjs')
const { stopBeforeDelete } = require('../desktop/services/stop-before-delete.cjs')
const tick = () => new Promise(resolve => setImmediate(resolve))
test('close choice authenticates decisions, persists opt-in and allows quit', async () => {
  const app = new EventEmitter(), window = new EventEmitter()
  let prompts = 0, minimized = 0, quits = 0, handler, saved = null
  window.webContents = { mainFrame: {}, send: () => prompts++ }
  window.minimize = () => minimized++
  app.quit = () => { quits++; app.emit('before-quit'); window.emit('close', { preventDefault() { throw Error('Quit blocked') } }) }
  const ipc = { handle: (_channel, fn) => handler = fn, removeHandler: () => handler = null }
  installWindowCloseChoice(window, app, ipc, { get: () => saved, set: value => saved = value })
  const close = () => window.emit('close', { preventDefault() {} })
  const decide = (choice, remember = false) => handler({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, { choice, remember })
  close(); close(); assert.equal(prompts, 1)
  assert.throws(() => handler({sender:{}}, {choice:'quit'}), /无效窗口/)
  decide('cancel', true); assert.equal(saved, null); assert.equal(quits, 0)
  close(); decide('minimize'); assert.equal(minimized, 1); assert.equal(saved, null)
  close(); decide('minimize', true); assert.equal(saved, 'minimize'); close(); assert.equal(minimized, 3); assert.equal(prompts, 3)
  saved = null; close(); decide('quit', true); assert.equal(saved, 'quit'); assert.equal(quits, 1)
  window.emit('closed'); assert.equal(app.listenerCount('before-quit'), 0); assert.equal(handler, null)
})
test('deletion waits for runner cleanup and preserves a task that cannot stop', async () => {
  const runners = new Map([['a', {}]])
  let cancelled = 0
  await stopBeforeDelete('a', runners, id => { cancelled++; setTimeout(() => runners.delete(id), 10) })
  assert.equal(cancelled, 1); assert.equal(runners.size, 0)
  runners.set('b', {})
  await assert.rejects(stopBeforeDelete('b', runners, () => {}, 0), /尚未删除/)
  assert.equal(runners.has('b'), true)
  await stopBeforeDelete('missing', runners, () => { throw Error('Should not cancel') })
})
