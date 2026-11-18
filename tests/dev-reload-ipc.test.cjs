'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { sendIpc } = require('../desktop/services/dev-ipc.cjs')

test('real Electron IPC refreshes automatically but exits only after a current manual confirmation', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-manual-reload-'))
  const children = []
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const start = () => {
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/dev-reload-ipc.cjs'), profile], {
      cwd: path.join(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const messages = [], listeners = new Set()
    let output = '', exited = false
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
    const closed = new Promise(resolve => {
      child.once('error', error => { output += error.message; exited = true; resolve({ code: -1, signal: null }) })
      child.once('close', (code, signal) => { exited = true; resolve({ code, signal }); for (const callback of listeners) callback() })
    })
    child.on('message', message => {
      messages.push(message)
      for (const callback of listeners) callback()
      if (message.type === 'stable:dev:restart-request') void sendIpc(child, { type: 'stable:dev:restart-confirmed', id: message.id })
    })
    const waitFor = predicate => new Promise((resolve, reject) => {
      let timer
      const check = () => {
        const found = messages.find(predicate)
        if (!found && !exited) return
        clearTimeout(timer); listeners.delete(check)
        if (found) resolve(found)
        else reject(Error('Electron closed before expected message: ' + output))
      }
      timer = setTimeout(() => { listeners.delete(check); reject(Error('IPC timeout: ' + output)) }, 8000)
      listeners.add(check); check()
    })
    const session = { child, messages, closed, waitFor, output: () => output }
    children.push(session)
    return session
  }
  const change = (session, id, action, blocked = false) => sendIpc(session.child, { type: 'stable:dev:change', id, action, blocked })
  try {
    const first = start()
    await first.waitFor(m => m.type === 'stable:dev:ready')
    await change(first, 1, 'reload')
    await first.waitFor(m => m.type === 'stable:dev:applied' && m.id === 1)
    for (let id = 2; id <= 5; id++) await change(first, id, 'restart')
    await first.waitFor(m => m.type === 'stable:dev:test-state' && m.state.revision === 5)
    await new Promise(resolve => setTimeout(resolve, 1700))
    assert.equal(first.child.exitCode, null, first.output())
    assert.equal(first.messages.filter(m => m.type === 'stable:dev:restart-request').length, 0)
    await sendIpc(first.child, { type: 'stable:dev:test-apply', revision: 4 })
    await first.waitFor(m => m.type === 'stable:dev:test-error' && m.code === 'DEV_RELOAD_STALE')
    await change(first, 6, 'restart', true)
    await sendIpc(first.child, { type: 'stable:dev:test-apply', revision: 6 })
    await first.waitFor(m => m.type === 'stable:dev:test-error' && m.code === 'DEV_RELOAD_BLOCKED')
    await change(first, 7, 'restart')
    await first.waitFor(m => m.type === 'stable:dev:test-state' && m.state.revision === 7)
    assert.equal(first.messages.filter(m => m.type === 'stable:dev:restart-request').length, 0)
    await sendIpc(first.child, { type: 'stable:dev:test-apply', revision: 7 })
    const exit = await first.closed
    assert.deepEqual(exit, { code: 0, signal: null }, first.output())
    assert.deepEqual(first.messages.filter(m => m.type === 'stable:dev:restart-request').map(m => m.id), [7])

    // A replacement process using the same isolated profile starts idle.
    const second = start()
    await second.waitFor(m => m.type === 'stable:dev:ready')
    await sendIpc(second.child, { type: 'stable:dev:test-state' })
    const snapshot = await second.waitFor(m => m.type === 'stable:dev:test-state')
    assert.equal(snapshot.state.action, null)
    assert.equal(snapshot.state.revision, 0)
    assert.equal(second.messages.filter(m => m.type === 'stable:dev:restart-request').length, 0)
    await sendIpc(second.child, { type: 'stable:dev:test-stop' })
    assert.deepEqual(await second.closed, { code: 0, signal: null }, second.output())
  } finally {
    for (const session of children) {
      if (session.child.exitCode === null) session.child.kill()
      await session.closed
    }
    assert.equal(path.dirname(profile), os.tmpdir())
    assert(path.basename(profile).startsWith('stable-manual-reload-'))
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
