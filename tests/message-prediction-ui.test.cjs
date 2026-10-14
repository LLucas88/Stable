'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
test('hidden Electron validates prediction acceptance, IME, stale replies and settings', { timeout: 90000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise(resolve => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/message-prediction-ui.cjs')], { cwd: path.join(__dirname, '..'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output }) }, 85000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: String(error) }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /MESSAGE_PREDICTION_UI_PASSED/)
})
