'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { cleanupStaleInstalls, staleInstallPaths } = require('../desktop/services/update-maintenance.cjs')
const { spawnSync } = require('node:child_process')

test('Electron update cleanup preserves runtime behind nested and top-level junctions', { skip: process.platform !== 'win32' }, () => {
  const modulePath = path.join(__dirname, '../desktop/services/update-maintenance.cjs')
  const safePath = path.join(__dirname, '../desktop/services/safe-remove.cjs')
  const probe = `
    const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
    const { cleanupStaleInstalls } = require(${JSON.stringify(modulePath)})
    const { removeWithoutFollowingLinks } = require(${JSON.stringify(safePath)})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-maintenance-junction-'))
    const runtime = path.join(root, 'runtime-v1')
    const previous = path.join(root, 'Stable.__stable_previous_0.91.7')
    const external = path.join(root, 'unrelated')
    try {
      fs.mkdirSync(runtime); fs.writeFileSync(path.join(runtime, 'sentinel'), 'keep-runtime')
      fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'sentinel'), 'keep-unrelated')
      fs.mkdirSync(path.join(previous, 'resources'), { recursive: true })
      fs.symlinkSync(runtime, path.join(previous, 'resources', 'runtime'), 'junction')
      fs.symlinkSync(external, path.join(root, 'Stable.__stable_failed_0.91.7'), 'junction')
      cleanupStaleInstalls(path.join(root, 'Stable', 'Stable.exe'))
      process.stdout.write(JSON.stringify({
        runtime: fs.existsSync(path.join(runtime, 'sentinel')),
        unrelated: fs.existsSync(path.join(external, 'sentinel')),
        previous: fs.existsSync(previous),
      }))
    } finally { removeWithoutFollowingLinks(root) }
  `
  const result = spawnSync(require('electron'), ['-e', probe], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(JSON.parse(result.stdout), { runtime: true, unrelated: true, previous: false })
})

test('successful startup removes only versioned update staging siblings', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-update-cleanup-'))
  const install = path.join(root, 'Stable')
  const previous = path.join(root, 'Stable.__stable_previous_0.9.31')
  const failed = path.join(root, 'Stable.__stable_failed_0.9.31')
  const unrelated = path.join(root, 'Stable.__stable_user-files')
  mkdirSync(install)
  mkdirSync(previous)
  mkdirSync(failed)
  mkdirSync(unrelated)
  try {
    const execPath = path.join(install, 'Stable.exe')
    assert.deepEqual(new Set(staleInstallPaths(execPath)), new Set([previous, failed]))
    assert.deepEqual(new Set(cleanupStaleInstalls(execPath)), new Set([previous, failed]))
    assert.equal(existsSync(previous), false)
    assert.equal(existsSync(failed), false)
    assert.equal(existsSync(unrelated), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
