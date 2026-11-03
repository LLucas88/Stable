'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawn } = require('node:child_process')

test('hidden Electron enforces offline local preview in shared and standalone browsers', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-browser-offline-'))
  const env = { ...process.env, STABLE_OFFLINE_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE
  try {
    const result = await new Promise(resolve => {
      let output = ''
      const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/browser-offline.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const timer = setTimeout(() => { child.kill(); }, 50000)
      for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-16000) })
      child.once('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
      child.once('close', code => { clearTimeout(timer); resolve({ code, output }) })
    })
    assert.equal(result.code, 0, result.output); assert.match(result.output, /BROWSER_OFFLINE_PASSED/)
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
