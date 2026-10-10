'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { spawnSync } = require('node:child_process')
test('standalone EXE generator stages DPAPI configuration and Electron imports it into safeStorage', { skip: process.platform !== 'win32', timeout: 40000 }, () => {
  const repo = path.resolve(__dirname, '..'), root = fs.mkdtempSync(path.join(repo, '.local/portable-config-'))
  const source = path.join(root, 'fixture.json'), receiver = path.join(root, 'receiver.exe'), profile = path.join(root, 'profile')
  const config = { version: 1, profile: { providerId: 'fixture', displayName: '测试模型', model: 'actual-test-model', baseURL: 'https://example.com/v1' }, apiKey: 'fixture-recipient-key' }
  fs.writeFileSync(source, JSON.stringify(config))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  function run(exe, args) { const result = spawnSync(exe, args, { env, cwd: repo, windowsHide: true, encoding: 'utf8', timeout: 20000 }); assert.equal(result.status, 0, result.stdout + result.stderr); return result }
  run(path.join(repo, 'deliverables/model-setup-20260927/Stable-Config-Builder.exe'), ['--build', source, receiver])
  run(receiver, ['--stage-only', profile])
  assert.ok(!fs.readFileSync(path.join(profile, 'model-setup.pending.json'), 'utf8').includes(config.apiKey))
  assert.match(run(require('electron'), [path.join(__dirname, 'fixtures/portable-model-setup.cjs'), profile]).stdout, /PORTABLE_MODEL_SETUP_PASS/)
  config.profile.baseURL = 'http://remote.invalid'; fs.writeFileSync(source, JSON.stringify(config))
  const failed = spawnSync(path.join(repo, 'deliverables/model-setup-20260927/Stable-Config-Builder.exe'), ['--build', source, path.join(root, 'bad.exe')], { env, windowsHide: true, timeout: 10000 })
  assert.equal(failed.status, 1); assert.equal(fs.existsSync(path.join(root, 'bad.exe')), false)
})
