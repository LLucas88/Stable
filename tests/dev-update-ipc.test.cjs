'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { registerDevUpdateIpc } = require('../desktop/services/dev-update-ipc.cjs')

function fixture({ enabled = true, connected = true, controller = true } = {}) {
  const handlers = new Map(), calls = []
  const contents = { mainFrame: {} }
  const current = { enabled: connected, revision: 12, action: 'restart', applying: false, blocked: false, message: '' }
  registerDevUpdateIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getWindow: () => ({ isDestroyed: () => false, webContents: contents }),
    getController: () => controller ? { state: () => current, apply: revision => { calls.push(revision); return Promise.resolve(current) } } : undefined,
    enabled: () => enabled,
  })
  const trusted = { sender: contents, senderFrame: contents.mainFrame }
  return { calls, current, trusted, invoke: (name, payload, event = trusted) => handlers.get('stable:development:' + name)(event, payload) }
}

test('installed and standalone apps expose no development restart action', () => {
  const x = fixture({ enabled: false })
  assert.equal(x.invoke('state').enabled, false)
  assert.equal(x.invoke('state').action, null)
  assert.throws(() => x.invoke('apply', { revision: 12 }), /监听器未连接/)
  assert.deepEqual(x.calls, [])
})

test('only the trusted main frame may read state or confirm an update', () => {
  const x = fixture()
  for (const event of [{ sender: {}, senderFrame: x.trusted.senderFrame }, { sender: x.trusted.sender, senderFrame: {} }]) {
    assert.throws(() => x.invoke('state', undefined, event), /无权/)
    assert.throws(() => x.invoke('apply', { revision: 12 }, event), /无权/)
  }
  assert.deepEqual(x.calls, [])
})

test('confirmation passes only a validated revision and cannot choose a privileged action', async () => {
  const x = fixture()
  assert.deepEqual(x.invoke('state'), x.current)
  for (const revision of [0, -1, 1.5, '12', undefined, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => x.invoke('apply', { revision }), /请求无效/)
  }
  assert.equal(await x.invoke('apply', { revision: 12, action: 'arbitrary', command: 'ignored' }), x.current)
  assert.deepEqual(x.calls, [12])
})

test('startup without a controller and disconnected watchers cannot restart the app', () => {
  for (const options of [{ controller: false }, { connected: false }]) {
    const x = fixture(options)
    assert.equal(x.invoke('state').enabled, false)
    assert.throws(() => x.invoke('apply', { revision: 12 }), /监听器未连接/)
    assert.deepEqual(x.calls, [])
  }
})
