'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')

function verifyPowerShell(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, 'runtime', 'powershell')
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'stable-runtime.json'), 'utf8').replace(/^\uFEFF/, ''))
    const executable = path.join(directory, 'pwsh.exe')
    const hash = createHash('sha256').update(fs.readFileSync(executable)).digest('hex')
    if (manifest.version !== '7.6.6' || hash !== manifest.executableSha256.toLowerCase()) throw Error('Runtime version/hash mismatch')
    const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    if (result.status !== 0 || result.stdout.trim() !== manifest.version) throw Error(result.stderr || result.error?.message || 'Runtime version check failed')
    console.log(`Stable PowerShell ${manifest.version} verified: ${executable}`)
    return manifest
  } catch (error) { throw Error(`PowerShell 7 运行时不完整，请运行 npm run runtime:powershell。${error.message}`) }
}
module.exports = { verifyPowerShell }
if (require.main === module) verifyPowerShell()
