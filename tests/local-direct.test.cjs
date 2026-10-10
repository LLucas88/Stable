'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
test('Electron local direct startup and provisioning IPC', { skip: process.platform !== 'win32', timeout: 30000 }, () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [path.join(__dirname, 'fixtures/local-direct.cjs')], { env, cwd: path.resolve(__dirname, '..'), windowsHide: true, encoding: 'utf8', timeout: 25000 })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /LOCAL_DIRECT_RESULT/)
  console.log(result.stdout.match(/LOCAL_DIRECT_RESULT[^\r\n]*/)[0])
})
