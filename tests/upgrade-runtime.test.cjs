'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { verifyRuntime } = require('../desktop/services/upgrade-maintenance.cjs')

test('lightweight upgrade healthcheck uses migrated Node and still rejects a missing runtime', { skip: process.platform !== 'win32', timeout: 120000 }, async t => {
  const project = path.resolve(__dirname, '..')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-upgrade-runtime-'))
  const resources = path.join(root, 'resources')
  const local = process.env.LOCALAPPDATA, override = process.env.STABLE_RUNTIME_HOME
  t.after(async () => {
    if (local === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = local
    if (override === undefined) delete process.env.STABLE_RUNTIME_HOME; else process.env.STABLE_RUNTIME_HOME = override
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  fs.mkdirSync(path.join(resources, 'runtime'), { recursive: true })
  for (const name of ['git', 'powershell']) fs.symlinkSync(path.join(project, 'runtime', name), path.join(resources, 'runtime', name), 'junction')
  fs.symlinkSync(path.dirname(require('../desktop/services/claude-harness.cjs').runtimePath()), path.join(resources, 'claude'), 'junction')
  process.env.LOCALAPPDATA = path.join(root, 'local')
  delete process.env.STABLE_RUNTIME_HOME
  const persistent = path.join(process.env.LOCALAPPDATA, 'stable-desktop/runtime-v1')
  fs.mkdirSync(path.join(persistent, 'node'), { recursive: true })
  fs.copyFileSync(path.join(project, 'runtime/node/node.exe'), path.join(persistent, 'node/node.exe'))
  assert.equal(fs.existsSync(path.join(resources, 'runtime/node/node.exe')), false)
  const options = { packaged: true, resourcesPath: resources }
  await verifyRuntime(options)
  process.env.STABLE_RUNTIME_HOME = path.join(root, 'custom-runtime')
  fs.renameSync(persistent, process.env.STABLE_RUNTIME_HOME)
  await verifyRuntime(options)
  fs.unlinkSync(path.join(process.env.STABLE_RUNTIME_HOME, 'node/node.exe'))
  await assert.rejects(verifyRuntime(options), /运行时启动检查失败：node.exe/)
})
