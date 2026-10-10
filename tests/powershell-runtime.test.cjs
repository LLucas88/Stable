'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { powershellPath, requirePowerShell } = require('../desktop/services/powershell-runtime.cjs')

test('packaged PowerShell resolves inside resources and a missing runtime never selects system 5.1', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-pwsh-resources-'))
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }) })
  const options = { packaged: true, resourcesPath: path.join(root, 'resources with spaces') }
  const executable = powershellPath(options)
  assert.equal(executable, path.join(options.resourcesPath, 'runtime', 'powershell', 'pwsh.exe'))
  assert.throws(() => requirePowerShell(options), /PowerShell 7.*重新安装/)
  fs.mkdirSync(path.dirname(executable), { recursive: true })
  fs.writeFileSync(executable, 'path-discovery-fixture')
  assert.equal(requirePowerShell(options), executable)
})

test('full and lightweight packages both include the PowerShell runtime and validate it before packing', () => {
  const pkg = require('../package.json'), update = require('../build/update-builder.config.cjs')
  assert(pkg.build.extraResources.some(item => item.from === 'runtime' && item.to === 'runtime' && !item.filter.includes('!powershell/**/*')))
  assert(update.extraResources.some(item => item.from === 'runtime/powershell' && item.to === 'runtime/powershell'))
  assert.equal(pkg.build.beforePack, 'scripts/verify-builtin-tools.cjs')
  assert.match(fs.readFileSync(path.resolve(__dirname, '../scripts/verify-builtin-tools.cjs'), 'utf8'), /verify-powershell-runtime/)
})
