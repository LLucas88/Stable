const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { spawn } = require('node:child_process')
const path = require('node:path')

test('expert market uses offline catalogue and real installation service', { skip: process.platform !== 'win32', timeout: 40_000 }, async () => {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise((resolve) => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/expert-market-ui.cjs')], {
      cwd: path.join(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: 'Composer UI test timed out\n' + output }) }, 35_000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /EXPERT_MARKET_UI_PASSED/)
})
