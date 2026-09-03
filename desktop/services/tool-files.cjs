'use strict'
const fs = require('node:fs')
const path = require('node:path')

function inside(root, target) {
  const relative = path.relative(root, target)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function toolFile(workspace, value, { output = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\x00-\x1f]/.test(value)) throw new Error('文件路径无效。')
  const root = fs.realpathSync(workspace)
  const target = path.resolve(workspace, value)
  if (!inside(path.resolve(workspace), target)) throw new Error('文件必须位于当前 Stable 工作区。')
  // Reject ADS, device names and UNC; these are not ordinary workbook paths.
  const relative = path.relative(path.resolve(workspace), target)
  if (relative.includes(':') || relative.split(/[\\/]/).some(p => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p) || /[. ]$/.test(p))) throw new Error('不支持特殊设备或流路径。')
  if (output) {
    const parent = fs.realpathSync(path.dirname(target))
    if (parent !== root && !inside(root, parent)) throw new Error('输出目录链接指向工作区外。')
    try { fs.lstatSync(target); throw new Error('输出文件已存在，请另存新文件，原件不会被覆盖。') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    return path.join(parent, path.basename(target))
  }
  const resolved = fs.realpathSync(target)
  if (!inside(root, resolved) || !fs.statSync(resolved).isFile()) throw new Error('源文件必须是真实工作区文件，不允许链接越界。')
  return resolved
}

module.exports = { toolFile }
