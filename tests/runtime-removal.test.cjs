'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
test('only Claude is dispatchable and the retired runtime cannot enter packaging', () => {
  const root = path.resolve(__dirname, '..'), pkg = require('../package.json')
  assert.equal(pkg.devDependencies['@openai/codex'], undefined)
  assert(!fs.existsSync(path.join(root, 'runtime/codex')))
  assert(!fs.readdirSync(path.join(root, 'desktop/services')).some(name => name.startsWith('codex-')))
  assert(!pkg.build.extraResources.some(item => item.to === 'codex'))
  const wslFiles = pkg.build.extraResources.find(item => item.to === 'wsl-agent').filter
  for (const file of ['runner.cjs', 'workspace-copy.cjs', 'package.json', 'package-lock.json']) assert(wslFiles.includes(file))
  assert.deepEqual(pkg.build.extraResources.find(item => item.to === 'runtime').filter, ['node/**/*', 'powershell/**/*'])
  const { HarnessRunner } = require('../desktop/services/execution-harness.cjs')
  const { ClaudeHarnessRunner } = require('../desktop/services/claude-harness.cjs')
  assert.equal(HarnessRunner, ClaudeHarnessRunner)
})
