'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { windowsUserProtection } = require('../desktop/services/windows-user-protection.cjs')
const root = path.resolve(__dirname, '..')
function launch(directory, profile) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [path.join(__dirname, 'fixtures/local-model-startup.cjs'), directory, profile], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, result.stderr)
  const line = result.stdout.split(/\r?\n/).find(line => line.startsWith('LOCAL_MODEL_STARTUP_RESULT '))
  assert.ok(line, 'Missing startup evidence')
  return JSON.parse(line.slice('LOCAL_MODEL_STARTUP_RESULT '.length))
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-model-startup-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}
test('real Windows encryption imports across Electron profile changes and a process restart', { skip: process.platform !== 'win32', timeout: 45000 }, t => {
  const directory = temporary(t)
  const encrypted = windowsUserProtection.encryptString('fixture-only-secret')
  assert.equal(windowsUserProtection.decryptString(encrypted), 'fixture-only-secret')
  fs.writeFileSync(path.join(directory, '.stable-local-model.json'), JSON.stringify({ version: 2, protection: 'windows-dpapi-current-user', profile: { id: 'zhipu-glm-5-3', providerId: 'zhipu', displayName: '智谱 GLM-5.3', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3' }, encryptedApiKey: encrypted.toString('base64') }))
  for (const profile of ['profile-a', 'profile-a', 'profile-b']) {
    const result = launch(directory, profile)
    assert.deepEqual(result, { status: 'loaded', windowCreated: true, model: 'glm-5.3', hasApiKey: true, defaultModelId: 'zhipu-glm-5-3' })
  }
})
test('a damaged local credential still permits a real Electron window to be created', { skip: process.platform !== 'win32', timeout: 20000 }, t => {
  const directory = temporary(t)
  fs.writeFileSync(path.join(directory, '.stable-local-model.json'), JSON.stringify({ version: 1, profile: { id: 'zhipu-glm-5-3' }, encryptedApiKey: Buffer.from('v10-invalid-fixture').toString('base64') }))
  assert.deepEqual(launch(directory, 'profile'), { status: 'error', windowCreated: true })
})