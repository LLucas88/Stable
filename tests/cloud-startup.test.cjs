'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
for (const mode of ['--success', '--failure', '--packaged-default']) {
  test(`window loads while cloud recovery is pending and updates after ${mode}`, { skip: process.platform !== 'win32', timeout: 25000 }, () => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(require('electron'), [path.join(__dirname, 'fixtures/cloud-startup.cjs'), mode], {
      env, cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8', timeout: 20000,
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /CLOUD_STARTUP_RESULT/)
    console.log(result.stdout.match(/CLOUD_STARTUP_RESULT[^\r\n]*/)[0])
  })
}
