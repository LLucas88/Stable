const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { execFile } = require('node:child_process'), { promisify } = require('node:util')
test('business output presets produce exact PNG dimensions, bounded bytes and replay without extra generation', { timeout: 30000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await promisify(execFile)(require('electron'), [path.join(__dirname, 'fixtures/design-output-native.cjs')], { env, windowsHide: true, timeout: 25000 })
  assert.match(result.stdout, /DESIGN_OUTPUT_NATIVE_PASSED/)
})
