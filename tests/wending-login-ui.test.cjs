const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')

test('hidden Electron form verifies confirmation, account/brand selection, privacy and cancellation without network', { skip: process.platform !== 'win32', timeout: 40_000 }, async () => {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const result = await new Promise((resolve) => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/wending-login-ui.cjs')], {
      cwd: path.join(__dirname, '..'), windowsHide: true, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: 'Hidden UI test timed out' }) }, 35_000)
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output = (output + chunk.toString()).slice(-8000) })
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, output: 'Cannot launch hidden Electron test' }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /WENDING_LOGIN_UI_PASSED/)
})
