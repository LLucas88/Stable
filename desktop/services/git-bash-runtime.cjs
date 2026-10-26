'use strict'
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
function gitBashPath({ packaged = false, resourcesPath, root = path.resolve(__dirname, '../..') } = {}) {
  return path.join(packaged ? resourcesPath : root, 'runtime', 'git', 'bin', 'bash.exe')
}
function verifyGitBash(options = {}) {
  const executable = gitBashPath(options)
  if (!fs.existsSync(executable)) throw Error('内置 Git Bash 缺失，请使用 Stable 完整安装包修复。')
  const directory = path.dirname(path.dirname(executable))
  const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    PATH: [path.join(directory, 'cmd'), path.join(directory, 'usr/bin'), path.join(process.env.SystemRoot || 'C:/Windows', 'System32')].join(path.delimiter), HOME: options.home || process.env.TEMP }
  const result = spawnSync(executable, ['--noprofile', '--norc', '-c', 'printf STABLE_BASH_OK; git --version; command -v sed; command -v grep'], { env, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0 || !result.stdout.includes('STABLE_BASH_OKgit version')) throw Error('内置 Git Bash 启动检查失败：' + (result.error?.message || result.stderr))
  return { executable, version: result.stdout.match(/git version ([^\r\n]+)/)?.[1] }
}
module.exports = { gitBashPath, verifyGitBash }
