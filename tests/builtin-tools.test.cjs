'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { installBuiltinBridge, TOOL_SPECS } = require('../desktop/services/builtin-tool-bridge.cjs')

test('real Harness advertises and invokes built-in browser and Excel through hidden Electron', { timeout: 75_000, skip: process.platform !== 'win32' }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise(resolve => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/builtin-tools-electron.cjs')], { cwd: path.join(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: `Timed out\n${output}` }) }, 70_000)
    child.stdout.on('data', data => { output = (output + data).slice(-12000) })
    child.stderr.on('data', data => { output = (output + data).slice(-12000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /BUILTIN_ELECTRON_PASSED/)
})

test('bridge fails closed on denied approval and routes cancellation without tool execution', async () => {
  const definitions = new Map(), events = []
  const ctx = { tools: { register: definition => definitions.set(definition.name, definition) }, get: () => ({ request: async () => 'rejected' }) }
  const bridge = installBuiltinBridge(TOOL_SPECS, x => x, event => events.push(event))
  bridge.register({ ctx }); bridge.register({ ctx })
  assert.equal(definitions.size, 2)
  const exec = { signal: new AbortController().signal, agent: {}, callId: 'fixture' }
  await assert.rejects(definitions.get('stable_browser').execute({ action: 'click', ref: 'test' }, exec), /未批准/)
  assert.equal(events.length, 0)
  const controller = new AbortController()
  const pending = definitions.get('stable_excel').execute({ action: 'read', path: 'test.xlsx' }, { ...exec, signal: controller.signal })
  controller.abort(); await assert.rejects(pending, /取消/)
  assert.deepEqual(events.map(e => e.eventType), ['builtin/request', 'builtin/cancel'])
  assert.equal(bridge.receive({ type: 'steer' }), false)
})
