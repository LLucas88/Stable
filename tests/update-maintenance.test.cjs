'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { cleanupStaleInstalls, staleInstallPaths } = require('../desktop/services/update-maintenance.cjs')

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
