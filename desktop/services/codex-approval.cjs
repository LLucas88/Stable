'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const { classifyWending } = require('./wending-approval.cjs')
const { classifyPython } = require('./python-approval.cjs')
const { stripUtf8Prefix } = require('./windows-command.cjs')
const unknown = (reason) => ({ risk: 'unknown', reason })
const high = (reason) => ({ risk: 'high', reason })

// Codex renders argv with shell_words quoting. Decode only that display format;
// never interpolate it into a shell invocation or strip a trailing command.
function splitCommand(command) {
  const args = []; let value = ''; let quote = ''; let started = false
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (c === '\\' && quote !== "'" && (quote !== '"' || /[\\"$`\n]/.test(command[i + 1] || ''))) {
      if (++i >= command.length) return null
      value += command[i]; started = true
    } else if (quote) { if (c === quote) quote = ''; else value += c }
    else if (c === '"' || c === "'") { quote = c; started = true }
    else if (/\s/.test(c)) { if (started) { args.push(value); value = ''; started = false } }
    else { value += c; started = true }
  }
  if (quote) return null
  if (started) args.push(value)
  return args
}
function inside(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) }
function canonicalTarget(target) {
  let existing = target; const missing = []
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error('No existing ancestor')
    missing.unshift(path.basename(existing)); existing = parent
  }
  return path.join(fs.realpathSync(existing), ...missing)
}
function checkPaths(paths, cwd, workspace) {
  for (const entry of paths) {
    const value = entry.path
    if (!value || /^[\\/]{2}/.test(value) || /(^|[^a-z]):/i.test(value.replace(/^[a-z]:/i, '')) || value.includes(':', 2)) return unknown('网络、设备或非文件系统路径需要确认')
    if (/[*?\[\]]/.test(value)) return unknown('通配符路径的实际访问范围需要确认')
    const target = path.resolve(cwd, value)
    const sensitive = /(^|[\\/])(\.env(?:\.[^\\/]*)?|\.ssh|\.aws|\.azure|\.codex|\.crm-cli|\.git|\.npmrc|\.pypirc|\.netrc|[^\\/]*(?:credential|secret|token|password)[^\\/]*|auth\.json)([\\/]|$)/i
    if (entry.mode !== 'list' && sensitive.test(target)) return high('操作涉及凭据、认证或版本库内部文件')
    try {
      const canonical = canonicalTarget(target)
      if (entry.mode !== 'list' && sensitive.test(canonical)) return high('实际目标涉及凭据、认证或版本库内部文件')
      if (entry.mode === 'write' && !inside(fs.realpathSync(workspace), canonical)) return high('写入目标位于工作区之外')
      if (entry.mode === 'write' && fs.existsSync(canonical) && fs.statSync(canonical).nlink > 1 && fs.statSync(canonical).isFile()) return unknown('目标文件具有多个硬链接，需要确认写入影响')
      if (entry.mode === 'read' && /(^|[\\/])[^\\/]*config[^\\/]*(?:\.json|\.toml|\.yaml|\.yml|\.ini)?$/i.test(canonical)) return unknown('配置文件可能含登录信息，需要确认读取范围')
    } catch { return unknown('无法核实文件实际路径') }
  }
  return null
}
function parsePowerShell(script) {
  return new Promise((resolve) => {
    const helper = fs.readFileSync(path.join(__dirname, 'powershell-approval.ps1'), 'utf8')
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    const child = execFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(helper, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) { resolve(unknown('命令结构检查未完成，需要人工确认')); return }
        try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, ''))) } catch { resolve(unknown('命令结构检查结果无效')) }
      })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify({ script }))
  })
}
async function classifyCodexApproval(method, params, workspace, trustedCli) {
  if (method !== 'item/commandExecution/requestApproval') return unknown(method.includes('fileChange') ? '文件变更审批未提供完整变更内容，需要确认' : '扩大权限的范围需要确认')
  if (params.networkApprovalContext || params.proposedNetworkPolicyAmendments?.length) return unknown('网络访问需要核实目的地与发送内容')
  if (params.additionalPermissions || params.grantRoot) return unknown('请求附带了额外访问权限，需要单独确认范围')
  if (!params.cwd || !path.isAbsolute(params.cwd)) return unknown('命令未提供明确的工作目录，需要确认路径范围')
  const args = splitCommand(String(params.command || ''))
  if (!args || args.length < 3 || process.platform !== 'win32') return unknown('无法完整核实命令结构')
  const executable = args.shift()
  if (!/^(powershell|pwsh)\.exe$/i.test(path.basename(executable))) return unknown('尚未核实的程序需要确认')
  const trustedRoots = [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell'), path.join(require('node:os').homedir(), '.cache/codex-runtimes')]
  try { if (!trustedRoots.some((root) => inside(root, fs.realpathSync(executable)))) return unknown('尚未核实的 PowerShell 程序路径') } catch { return unknown('无法核实 PowerShell 程序路径') }
  while (args.length && /^-(NoProfile|NonInteractive)$/i.test(args[0])) args.shift()
  if (args.length !== 2 || !/^-Command$/i.test(args[0])) return unknown('脚本文件、编码命令或额外启动参数需要确认')
  const parsed = await parsePowerShell(stripUtf8Prefix(args[1]))
  const paths = checkPaths(parsed.paths || [], params.cwd, workspace)
  if (paths?.risk === 'high') return paths
  const external = await Promise.all((parsed.external || []).map(async (item) => {
    const cli = classifyWending(item.argv, params.cwd, trustedCli)
    if (cli.risk === 'safe' || cli.risk === 'high') return cli
    // No shared category for a script combined with other commands or file I/O.
    if (parsed.risk === 'safe' && parsed.external.length === 1 && parsed.commandNames.length === 1 && !(parsed.paths || []).length) {
      return await classifyPython(item, params.cwd, trustedCli, checkPaths, workspace) || cli
    }
    return cli
  }))
  const unsafe = external.find((item) => item.risk === 'high') || external.find((item) => item.risk !== 'safe')
  if (unsafe?.risk === 'high') return unsafe
  if (parsed.risk !== 'safe') return { risk: parsed.risk, reason: parsed.reason }
  if (paths || unsafe) return paths || unsafe
  if (external.length) {
    // Mixed file writes/read commands stay scoped to the exact invocation.
    const category = !(parsed.paths || []).length && external.every((item) => item.category === external[0].category) ? external[0].category : undefined
    return { risk: 'safe', reason: external.map((item) => item.reason).join('；'), ...(category ? { category, categoryLabel: external[0].categoryLabel } : {}) }
  }
  return { risk: 'safe', reason: parsed.reason }
}

function approvalScope(method, params, assessment, execution = {}) {
  // Never accept a category supplied by the renderer or the model.
  const metadata = new Set(['threadId', 'turnId', 'itemId', 'callId', 'startedAtMs', 'reason', 'commandActions', 'availableDecisions', 'proposedExecpolicyAmendment'])
  if (assessment.category) metadata.add('command')
  const stableParams = Object.fromEntries(Object.entries(params).filter(([key]) => !metadata.has(key)))
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
  const value = JSON.stringify(canonical({ method, params: stableParams, category: assessment.category, execution }))
  return { key: createHash('sha256').update(`v2:${value}`).digest('hex'), label: assessment.categoryLabel || '相同命令、参数和访问范围' }
}

function canAutoApprove(mode, event) {
  // Legacy harness events have no risk classification. Preserve their existing
  // policy, but never treat a Codex 'unknown' assessment as permission to run.
  return mode === 'full' && !event.danger && (event.approvalRisk ? event.approvalRisk === 'safe' : true)
}
module.exports = { classifyCodexApproval, canAutoApprove, splitCommand, checkPaths, approvalScope }
