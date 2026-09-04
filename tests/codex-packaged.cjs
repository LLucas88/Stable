'use strict'

// Run the same protocol smoke tests inside Electron's Node runtime so asar
// loading, native binaries and the stdio search MCP are all exercised.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const pkg = require('../package.json')
const directory = path.resolve(process.argv[2] || `release-${pkg.version}/win-unpacked`)
const executable = path.join(directory, 'Stable.exe')
const resources = path.join(directory, 'resources')
for (const file of ['bin/codex.exe', 'codex-path/rg.exe', 'codex-resources/codex-command-runner.exe', 'codex-resources/codex-windows-sandbox-setup.exe']) {
  assert.ok(fs.existsSync(path.join(resources, 'codex', file)), `Missing packaged helper: ${file}`)
}
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', STABLE_CODEX_TEST_RESOURCES: resources }
delete env.STABLE_CODEX_PATH; delete env.STABLE_HARNESS
const result = spawnSync(executable, [path.join(__dirname, 'codex-integration.cjs')], { env, windowsHide: true, stdio: 'inherit', timeout: 180_000 })
assert.ifError(result.error); assert.equal(result.status, 0, 'Packaged integration failed')
delete env.ELECTRON_RUN_AS_NODE
const userData = path.resolve(__dirname, '../qa-artifacts/codex-packaged-health', `${Date.now()}`)
env.STABLE_QA_USER_DATA = userData
const health = spawnSync(executable, ['--stable-update-healthcheck', `--stable-user-data=${userData}`], { env, windowsHide: true, stdio: 'pipe', timeout: 30_000 })
assert.ifError(health.error); assert.equal(health.status, 0, `Packaged healthcheck failed: ${health.stderr?.toString()}`)
console.log(JSON.stringify({ success: true, packagedDirectory: directory, healthcheck: health.status, userData }, null, 2))
