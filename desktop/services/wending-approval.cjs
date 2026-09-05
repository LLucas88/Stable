'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const unknown = (reason) => ({ risk: 'unknown', reason })
// Explicit inventory of the bundled version. New commands fail closed until reviewed.
const reads = new Set([
  ...['query-customer-data', 'recall-semantics', 'query-data', 'query-activity-effect', 'query-shop-activity-config', 'query-activity-product', 'query-coupon-effect', 'query-precision-marketing', 'query-product-diagnosis', 'query-category-product-diagnosis', 'query-shop-open-close', 'query-member-asset', 'query-category-member-asset', 'query-trade-data', 'query-category-trade-data', 'query-trade-funnel', 'query-category-trade-funnel', 'query-shop-category-flow', 'query-crowd-profile', 'query-shop-crowd-profile', 'query-brand-category-flow', 'get-today', 'get-yesterday'].map((name) => `data-analysis ${name}`),
  'third login list-brand', 'third login login-record',
  'member-marketing query-member-card-template', 'member-marketing query-voucher-template-detail', 'member-marketing query-voucher-template-list',
])
function sameFile(left, right) {
  try { return fs.realpathSync(left).toLowerCase() === fs.realpathSync(right).toLowerCase() } catch { return false }
}
function resolveExecutable(name, cwd, environment) {
  if (/[\\/]/.test(name)) return path.resolve(cwd, name)
  const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH')
  for (const directory of String(environment[pathKey] || '').split(path.delimiter).filter(Boolean)) {
    for (const suffix of path.extname(name) ? [''] : ['.exe', '.com', '.cmd', '.bat']) {
      const candidate = path.join(directory, name + suffix)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return ''
}
function classifyWending(argv, cwd, { root, environment = process.env } = {}) {
  if (!root || !argv?.length) return unknown('未核实的外部程序需要确认')
  const executable = resolveExecutable(argv[0], cwd, environment)
  let args = argv.slice(1)
  const wrapper = path.join(root, 'crm-brand-cli.cmd')
  const python = path.join(root, 'python/python.exe')
  let identity
  if (sameFile(executable, wrapper)) {
    if (args.some((value) => /[&|<>\r\n%^!]/.test(value))) return unknown('批处理参数包含需复核的 shell 控制字符')
    const content = fs.readFileSync(wrapper, 'utf8').replace(/\r/g, '').trim()
    if (content !== '@echo off\n"%~dp0python\\python.exe" -X utf8 -m crm_cli.cli %*') return unknown('内置 CLI 启动脚本已变化，需要重新核实')
    identity = hash(content)
  } else if (sameFile(executable, python)) {
    while (args[0] === '-B' || args[0] === '-I' || args[0] === '-X' && args[1] === 'utf8') args.splice(0, args[0] === '-X' ? 2 : 1)
    if (args[0] !== '-m' || args[1] !== 'crm_cli.cli') return unknown('Python 脚本不是内置 CLI 模块')
    args = args.slice(2); identity = 'python-module'
  } else return unknown('程序路径不属于内置问鼎 CLI；同名程序或工作区包装脚本需确认')
  // Bind grants to the installed module and the exact runtime location.
  const module = path.join(root, 'python/Lib/site-packages/crm_cli/cli.py')
  if (!fs.existsSync(module)) return unknown('内置 CLI 模块缺失')
  identity = hash(`${fs.realpathSync(root)}:${identity}:${hash(fs.readFileSync(module))}`)
  if (args[0] === '--json') args = args.slice(1)
  if (args.at(-1) === '--help' && args.slice(0, -1).every((value) => /^[a-z][a-z0-9-]*$/.test(value)) || args.length === 1 && args[0] === '--version') {
    return { risk: 'safe', reason: '已核实内置问鼎 CLI：仅查看命令帮助或版本', category: `wending:${identity}:help`, categoryLabel: '内置问鼎 CLI 帮助与版本' }
  }
  const command = args.slice(0, args[0] === 'third' ? 3 : 2).join(' ')
  if (reads.has(command)) {
    return { risk: 'safe', reason: `已核实内置问鼎 CLI 只读查询：${command}`, category: `wending:${identity}:read:${command}`, categoryLabel: `问鼎只读查询 · ${command}` }
  }
  if (/(?:^|[- ])(?:send|verify|auth|switch|logout|reset|update|delete|remove|create|commit|retry|save|set|add)(?:[- ]|$)/i.test(command)) {
    return { risk: 'high', reason: '命令可能发送验证码、改变登录状态或修改业务数据，需要确认' }
  }
  return unknown('该内置 CLI 子命令尚未完成只读分类')
}
module.exports = { classifyWending, resolveExecutable, reads }
