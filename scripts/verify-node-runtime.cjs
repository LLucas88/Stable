'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function verifyNodeRuntime(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, 'runtime', 'node')
  const executable = path.join(directory, 'node.exe')
  if (!fs.existsSync(executable) || !fs.existsSync(path.join(directory, 'LICENSE'))) {
    throw Error('完整安装包缺少 runtime/node/node.exe 或 LICENSE，请先恢复内置 Node 运行时。')
  }
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const result = spawnSync(executable, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})'], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (result.status !== 0) throw Error('内置 Node 无法启动：' + (result.error?.message || result.stderr))
  const version = JSON.parse(result.stdout.trim())
  if (version.platform !== 'win32' || version.arch !== 'x64' || Number(version.version.split('.')[0]) < 22) throw Error('内置 Node 需要 Windows x64 22 或更新版本。')
  console.log(`Stable Node ${version.version} verified: ${executable}`)
  return version
}

module.exports = { verifyNodeRuntime }
if (require.main === module) verifyNodeRuntime()
