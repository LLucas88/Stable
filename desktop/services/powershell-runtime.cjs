'use strict'

const fs = require('node:fs')
const path = require('node:path')

function powershellPath({ packaged = false, resourcesPath } = {}) {
  return packaged
    ? path.join(resourcesPath, 'runtime', 'powershell', 'pwsh.exe')
    : path.resolve(__dirname, '../../runtime/powershell/pwsh.exe')
}

function requirePowerShell(options = {}) {
  const executable = powershellPath(options)
  if (!fs.existsSync(executable)) throw new Error(options.packaged
    ? 'PowerShell 7 运行时不完整，请重新安装 Stable。'
    : 'PowerShell 7 运行时不完整，请先运行 npm run runtime:powershell。')
  return executable
}

module.exports = { powershellPath, requirePowerShell }
