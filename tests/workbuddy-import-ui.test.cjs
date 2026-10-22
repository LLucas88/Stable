'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { spawn } = require('node:child_process')

test('hidden Electron verifies settings, preview, scope selection and continuation through real import IPC', { skip: process.platform !== 'win32', timeout: 120000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise(resolve => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/workbuddy-import-ui.cjs')], { cwd: path.resolve(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: 'UI test timed out\n' + output }) }, 110000)
    child.stdout.on('data', data => { output = (output + data).slice(-12000) })
    child.stderr.on('data', data => { output = (output + data).slice(-12000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /WORKBUDDY_IMPORT_UI_PASSED/)
})
