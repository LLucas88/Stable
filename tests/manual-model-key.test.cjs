const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { spawnSync } = require('node:child_process')
test('API Key entered through settings survives a full Electron restart without plaintext exposure', { skip: process.platform !== 'win32', timeout: 50000 }, () => {
  const root = fs.mkdtempSync(path.resolve(__dirname, '../.local/manual-key-'))
  const env = { ...process.env, STABLE_KEY_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE
  for (const mode of ['--save','--reopen']) {
    const result = spawnSync(require('electron'), [path.join(__dirname,'fixtures/manual-model-key.cjs'),mode], { env, cwd:path.resolve(__dirname,'..'), windowsHide:true, encoding:'utf8', timeout:25000 })
    assert.equal(result.status,0,result.stdout+result.stderr)
    assert.match(result.stdout,/MANUAL_MODEL_KEY_PASS/)
    console.log(result.stdout.match(/MANUAL_MODEL_KEY_PASS[^\r\n]*/)[0])
  }
})
