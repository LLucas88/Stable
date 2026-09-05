'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { WendingCliService } = require('../desktop/services/wending-cli.cjs')
const { codexEnvironment } = require('../desktop/services/codex-harness.cjs')
const root = path.resolve(__dirname, '..')

function save(cli, brand) {
  const cfg = { wnToken: `synthetic-token-${brand}`, third_login_channel: '1', stable_brand_id: brand, stable_brand_label: `品牌 ${brand}` }
  fs.writeFileSync(path.join(cli.options.configDirectory, 'config.json'), JSON.stringify(Object.fromEntries(Object.entries(cfg).map(([key, value]) => [key, Buffer.from(value).toString('base64')]))))
}
function query(cli, cwd, scenario = 'ok') {
  const env = codexEnvironment(cli.environment(), path.join(cwd, 'mock-codex'), 'fixture-gateway', 'C:\\runtime\\bin\\codex.exe')
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(cli.root(), 'python/python.exe'), ['-B', '-X', 'utf8', path.join(__dirname, 'fixtures/wending-task-scope.py'), scenario], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', error = ''
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { error += chunk })
    child.on('error', reject); child.on('close', code => { try { assert.equal(code, 0, error); resolve(JSON.parse(output)) } catch (error) { reject(error) } })
  })
}
test('task profiles keep concurrent accounts separate across cwd, restart and deletion; brand drift fails closed', { skip: process.platform !== 'win32' }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-task-cli-'))
  const options = { appPath: root, workspace: directory, userData: directory, packaged: false }
  const service = new WendingCliService(options)
  try {
    const a = service.forConversation('a'), b = service.forConversation('b'), empty = service.forConversation('empty')
    assert.notEqual(a.options.configDirectory, b.options.configDirectory)
    assert.equal(a, service.forConversation('a'))
    assert.equal(fs.existsSync(path.join(empty.options.configDirectory, 'config.json')), false, 'Never clone a shared token')
    save(a, '100'); save(b, '200')
    const [first, second] = await Promise.all([query(a, directory), query(b, directory)])
    assert.equal(first.result.brand, '100'); assert.equal(second.result.brand, '200')
    const otherCwd = path.join(directory, 'changed-cwd'); fs.mkdirSync(otherCwd)
    assert.equal((await query(a, otherCwd)).result.brand, '100')
    const restored = new WendingCliService(options).forConversation('a')
    assert.equal((await query(restored, directory)).result.brand, '100')
    assert.equal(restored.binding().brandLabel, '品牌 100')
    assert.doesNotMatch(JSON.stringify(restored.binding()), /token|wnToken/)
    for (const scenario of ['drift-before', 'drift-during', 'switch']) {
      const result = await query(a, directory, scenario)
      assert.ok(result.error, scenario); assert.equal(result.result, undefined)
      assert.equal(result.businessCalls, scenario === 'drift-during' ? 1 : 0)
    }
    assert.ok((await query(empty, directory)).error)
    service.removeConversation('a')
    assert.equal((await query(b, directory)).result.brand, '200')
    assert.equal(fs.existsSync(path.join(a.options.configDirectory, 'config.json')), false)
  } finally { service.dispose(); fs.rmSync(directory, { recursive: true, force: true }) }
})
