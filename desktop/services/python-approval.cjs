'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const { resolveExecutable } = require('./wending-approval.cjs')
const unknown = reason => ({ risk: 'unknown', reason })

async function classifyPython(invocation, cwd, trustedCli, checkPaths, workspace) {
  if (!trustedCli?.root) return null
  const python = path.join(trustedCli.root, 'python/python.exe')
  const executable = resolveExecutable(invocation.argv[0], cwd, trustedCli.environment || {})
  try { if (fs.realpathSync(python).toLowerCase() !== fs.realpathSync(executable).toLowerCase()) return null } catch { return null }
  const args = invocation.argv.slice(1)
  if (!args.includes('-I')) return unknown('Python 数据处理需要内置隔离模式 -I，避免加载工作区同名模块')
  while (['-I', '-B'].includes(args[0]) || args[0] === '-X' && args[1] === 'utf8') args.splice(0, args[0] === '-X' ? 2 : 1)
  const source = args.length === 1 && args[0] === '-' ? invocation.stdin : args.length === 2 && args[0] === '-c' ? args[1] : null
  if (typeof source !== 'string' || source.length > 250000) return unknown('仅内置 Python 的静态内联数据脚本可复用分类授权')
  const result = await new Promise(resolve => {
    const child = execFile(python, ['-I', '-B', '-X', 'utf8', path.join(__dirname, 'python-data-assessment.py')], { cwd: path.dirname(python), windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) return resolve(unknown('Python 数据脚本结构检查未完成'))
      try { resolve(JSON.parse(stdout)) } catch { resolve(unknown('Python 数据脚本检查响应无效')) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify({ source }))
  })
  if (result.risk !== 'safe') return result
  const paths = result.paths || []
  const issue = checkPaths(paths, cwd, workspace)
  if (issue) return issue
  const root = fs.realpathSync(workspace)
  // Reads also stay within this workspace. Use the existing canonical write
  // guard to reject junction and parent escapes, including future paths.
  const boundary = checkPaths(paths.map(item => ({ ...item, mode: 'write' })), cwd, workspace)
  if (boundary) return unknown('Python 数据脚本访问范围超出本工作区或包含未核实路径')
  const access = paths.some(item => item.mode === 'write') ? 'read-write' : 'read'
  const identity = createHash('sha256').update(fs.realpathSync(python)).update(fs.readFileSync(python)).digest('hex')
  const scope = createHash('sha256').update(JSON.stringify({ root, identity, access })).digest('hex')
  return { risk: 'safe', reason: `已核实内置 Python 数据脚本：仅本工作区${access === 'read' ? '读取和计算' : '数据读取、计算及普通文件写入'}`, category: `python-data-v1:${scope}`, categoryLabel: `本工作区 Python 数据处理（${access === 'read' ? '只读' : '读写普通文件'}）` }
}
module.exports = { classifyPython }
