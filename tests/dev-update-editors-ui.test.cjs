'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')

test('reports and workflows protect only unsaved editor state from development reload', { skip: process.platform !== 'win32', timeout: 45000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-dev-editors-ui-'))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  try {
    const result = await new Promise(resolve => {
      let output = ''
      const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/dev-update-editors-ui.cjs'), profile], { cwd: path.join(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
      const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output }) }, 40000)
      child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
      child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
      child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
    })
    assert.equal(result.code, 0, result.output)
    assert.match(result.output, /DEV_UPDATE_EDITORS_UI_PASSED/)
  } finally {
    assert.equal(path.dirname(profile), os.tmpdir()); assert(path.basename(profile).startsWith('stable-dev-editors-ui-'))
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
