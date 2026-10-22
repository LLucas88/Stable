'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { resolveBoundPath } = require('./claude-tools.cjs')
const { HTML_PREVIEW_GUIDANCE, isBrowserScreenshotCommand } = require('./browser-command-route.cjs')
const { TOOL_WATCHDOG_MS } = require('./run-progress.cjs')
// Leave time for native process cleanup and the SDK result before the run guard.
const BASH_TIMEOUT_MS = TOOL_WATCHDOG_MS - 60_000
const TIMEOUT_RECOVERY = '本次命令超时，整轮任务仍可继续。根据已返回的输出检查已完成步骤和文件；超时不代表已有写入已回滚。请缩小范围、拆分为可恢复步骤或改用其他可用方法继续，不要原样重复长命令；仍须遵守用户停止、审批和费用上限。'
const QUOTING_RECOVERY = 'Bash 报告了引号或变量展开错误。不要原样重复或继续叠加转义；先核对已有文件和部分写入，用原生 Write / Edit 保存脚本或长文本，再用简短 Bash 命令执行脚本文件。不要把 JavaScript 的 ${...} 或反引号直接放入 shell 双引号字符串。已有操作未自动回滚，后续写入和命令仍须审批。'

const TOOLS = Object.freeze(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit'])
const WRITES = new Set(['Write', 'Edit', 'NotebookEdit'])
const SEARCH_LIMIT = 30_000
const MAX_MUTATION_BYTES = 2_000_000
const FIELDS = {
  Bash: ['command', 'timeout', 'description', 'run_in_background', 'dangerouslyDisableSandbox'],
  Read: ['file_path', 'offset', 'limit', 'pages'],
  Write: ['file_path', 'content'],
  Edit: ['file_path', 'old_string', 'new_string', 'replace_all'],
  Glob: ['pattern', 'path'],
  Grep: ['pattern', 'path', 'glob', 'output_mode', '-B', '-A', '-C', 'context', '-n', '-i', '-o', 'type', 'head_limit', 'offset', 'multiline'],
  NotebookEdit: ['notebook_path', 'cell_id', 'new_source', 'cell_type', 'edit_mode'],
}
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel) }
function aborted(signal) { if (signal?.aborted) throw Error('任务已停止。') }
function text(value, name) { if (typeof value !== 'string' || !value || value.includes('\0')) throw Error(`${name}需要有效的文字。`); return value }
function pathGlob(value) {
  text(value, '搜索 glob')
  // Grep.pattern is a content regex, not a path. These checks apply only to
  // Glob.pattern and Grep.glob, including brace/extglob traversal alternatives.
  if (value.includes(':') || /(?:^|[{},()!])(?:[\\/]|~)/.test(value) || value.includes('..')) throw Error('搜索 glob 不能使用绝对路径、盘符或 .. 越界。')
}
function directoryChain(value) {
  const result = []
  for (let current = path.resolve(value);; current = path.dirname(current)) {
    try {
      const info = fs.lstatSync(current)
      result.push([current, info.dev, info.ino, info.birthtimeMs, info.isSymbolicLink() ? fs.readlinkSync(current) : null, info.isDirectory()])
    } catch (error) { if (error.code !== 'ENOENT') throw error; result.push([current, null]) }
    if (current === path.dirname(current)) break
  }
  return result
}
async function writeSnapshot(requested, canonical, signal) {
  aborted(signal)
  const chains = [directoryChain(requested), directoryChain(canonical)]
  let info
  try { info = fs.statSync(canonical) } catch (error) { if (error.code === 'ENOENT') return JSON.stringify({ chains, missing: true }); throw error }
  if (!info.isFile() || info.nlink > 1) throw Error('写入目标必须是没有多重硬链接的普通文件。')
  const fd = fs.openSync(canonical, 'r')
  try {
    const opened = fs.fstatSync(fd)
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== info.dev || opened.ino !== info.ino || !samePath(fs.realpathSync(canonical), canonical)) throw Error('文件或路径已变化，请重新读取。')
    const hash = createHash('sha256'), chunk = Buffer.allocUnsafe(64 * 1024)
    let chunks = 0
    for (let length; (length = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0;) {
      aborted(signal); hash.update(chunk.subarray(0, length))
      if (++chunks % 16 === 0) { await new Promise(resolve => setImmediate(resolve)); aborted(signal) }
    }
    const after = fs.fstatSync(fd)
    if (after.nlink > 1 || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw Error('文件或路径已变化，请重新读取。')
    return JSON.stringify({ chains, file: [opened.dev, opened.ino, opened.nlink, opened.size, opened.mtimeMs, opened.ctimeMs, hash.digest('hex')] })
  } finally { fs.closeSync(fd) }
}
async function approval(requestApproval, request, signal) {
  aborted(signal)
  if (typeof requestApproval !== 'function') throw Error('缺少此任务的权限审批服务。')
  let listener
  const interrupted = new Promise((_resolve, reject) => {
    listener = () => reject(Error('任务已停止。'))
    signal?.addEventListener('abort', listener, { once: true })
    if (signal?.aborted) listener()
  })
  try {
    const allowed = await Promise.race([Promise.resolve().then(() => requestApproval(request)), interrupted])
    aborted(signal)
    if (allowed !== true) throw Error('用户未批准本次操作，未执行。')
  } finally { signal?.removeEventListener('abort', listener) }
}

function createNativeToolGuard({ workspace, writableRoots = [], readableRoots = [], sandboxMode = 'workspace-write', networkAccess = false, browserAvailable = false, requestApproval, signal, onToolEvent = () => {} }) {
  const cwd = fs.realpathSync(path.resolve(workspace))
  if (!fs.statSync(cwd).isDirectory()) throw Error('工作区路径不是文件夹。')
  const canonicalRoots = values => [...new Set(values.map(value => fs.realpathSync(path.resolve(value))))]
  const writes = canonicalRoots([cwd, ...writableRoots])
  const reads = canonicalRoots([...writes, ...readableRoots])
  if (sandboxMode !== 'read-only' && writes.some(root => samePath(root, path.parse(root).root))) throw Error('不能将整个盘符根目录作为可写工作区。')
  const bashEnabled = sandboxMode !== 'read-only' && networkAccess === true
  const tools = [...TOOLS, ...(bashEnabled ? ['Bash'] : [])]
  const calls = new Map()
  let serial = 0
  function protectedWrite(target) {
    // Protect nested repositories/configuration as well as each root's files.
    if (writes.some(root => inside(root, target) && path.relative(root, target).split(path.sep).some(part => ['.git', '.codex', '.claude', '.agents'].includes(part.toLowerCase())))) throw Error('运行时和版本控制配置目录只允许读取。')
  }
  async function inspectSearchTree(target, activeSignal) {
    const pending = [target], visited = new Set()
    let entries = 0
    while (pending.length) {
      aborted(activeSignal)
      const current = pending.pop()
      let canonical
      try { canonical = resolveBoundPath(current, cwd, reads) }
      catch { throw Error('搜索目录包含越界或不可核实的链接，未执行搜索。') }
      if (++entries > SEARCH_LIMIT) throw Error('搜索范围过大，无法核实全部目录；请选择更具体的子目录。')
      if (entries % 128 === 0) { await new Promise(resolve => setImmediate(resolve)); aborted(activeSignal) }
      const info = fs.statSync(canonical)
      if (!info.isDirectory()) continue
      if (visited.has(canonical)) continue
      visited.add(canonical)
      // Native Glob/Grep do not expose a stable no-follow contract. Check every
      // descendant before handing the directory to them, including hidden links.
      const children = fs.readdirSync(canonical, { withFileTypes: true })
      if (entries + pending.length + children.length > SEARCH_LIMIT) throw Error('搜索范围过大，无法核实全部目录；请选择更具体的子目录。')
      for (const entry of children) pending.push(path.join(canonical, entry.name))
    }
  }
  async function validate(name, input, activeSignal, executionCwd = cwd) {
    aborted(activeSignal)
    if (name === 'Bash' && !bashEnabled) throw Error('只读或禁网模式不开放原生 Bash：本机命令无法保证文件只读或禁止网络。')
    if (!tools.includes(name)) throw Error('此原生工具未获准。')
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !FIELDS[name].includes(key))) throw Error('原生工具参数包含不支持的字段。')
    const args = { ...input }, writing = WRITES.has(name)
    if (name === 'Bash') {
      text(args.command, '命令')
      if (!args.command.trim() || args.command.length > 100_000) throw Error('命令不能为空或超过 100000 字符。')
      if (args.timeout !== undefined && (!Number.isInteger(args.timeout) || args.timeout < 1 || args.timeout > 600_000)) throw Error('Bash timeout 必须为 1 到 600000 毫秒。')
      if (args.description !== undefined && typeof args.description !== 'string') throw Error('Bash description 必须为文字。')
      for (const key of ['run_in_background', 'dangerouslyDisableSandbox']) if (args[key] !== undefined && args[key] !== false) throw Error('Bash 不允许后台运行或覆盖沙箱设置。')
      if (browserAvailable && isBrowserScreenshotCommand(args.command)) throw Error('截图命令未执行。' + HTML_PREVIEW_GUIDANCE)
      args.timeout = Math.min(args.timeout ?? 60_000, BASH_TIMEOUT_MS)
      args.run_in_background = false
      const target = resolveBoundPath(executionCwd, cwd, writes)
      if (!fs.statSync(target).isDirectory()) throw Error('命令工作目录不是文件夹。')
      return { args, target, snapshot: JSON.stringify(directoryChain(target)) }
    }
    if (writing && sandboxMode === 'read-only') throw Error('当前为只读模式，不能写入文件。')
    const field = name === 'NotebookEdit' ? 'notebook_path' : ['Glob', 'Grep'].includes(name) ? 'path' : 'file_path'
    const requested = path.resolve(cwd, text(args[field] === undefined && field === 'path' ? cwd : args[field], '文件路径'))
    // Win32 trims trailing dots/spaces and recognizes device names even when a
    // not-yet-created path looks harmless lexically (for example '.git /x').
    if (process.platform === 'win32' && requested.split(/[\\/]/).some(part => /[ .]$/.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?$/i.test(part))) throw Error('不支持 Windows 设备名称或带末尾空格/点的路径。')
    const target = resolveBoundPath(requested, cwd, writing ? writes : reads, { missing: name === 'Write', write: writing })
    if (writing) { protectedWrite(requested); protectedWrite(target) }
    if (name === 'Write') { if (typeof args.content !== 'string') throw Error('Write 需要 content。') }
    if (name === 'Edit') { text(args.old_string, 'old_string'); if (typeof args.new_string !== 'string') throw Error('Edit 需要 new_string。') }
    if (name === 'NotebookEdit' && typeof args.new_source !== 'string') throw Error('NotebookEdit 需要 new_source。')
    if (writing && ['content', 'old_string', 'new_string', 'new_source'].some(key => typeof args[key] === 'string' && Buffer.byteLength(args[key], 'utf8') > MAX_MUTATION_BYTES)) throw Error('写入内容超过 2 MB，请通过获批命令分段处理。')
    if (name === 'Glob' || name === 'Grep') {
      if (name === 'Glob') pathGlob(args.pattern)
      else { text(args.pattern, '搜索正则'); if (args.glob !== undefined) pathGlob(args.glob) }
      if (name === 'Glob' && !fs.statSync(target).isDirectory()) throw Error('Glob 需要目录路径。')
      await inspectSearchTree(target, activeSignal)
    } else if (name !== 'Write' && !fs.statSync(target).isFile()) throw Error('目标不是普通文件。')
    args[field] = target
    return { args, requested, target, snapshot: writing ? await writeSnapshot(requested, target, activeSignal) : undefined }
  }
  async function authorize(name, input, id, options = {}) {
    const activeSignal = signal && options.signal ? AbortSignal.any([signal, options.signal]) : signal || options.signal
    const executionCwd = options.cwd || calls.get(id)?.cwd || cwd
    const checked = await validate(name, input, activeSignal, executionCwd)
    const signature = JSON.stringify(Object.fromEntries(Object.entries(checked.args).sort(([a], [b]) => a.localeCompare(b))))
    let entry = calls.get(id)
    if (entry) {
      if (entry.name !== name || entry.signature !== signature || entry.cwd !== executionCwd) throw Error('工具调用参数已变化，未执行。')
      await entry.promise
      const current = await validate(name, entry.input, activeSignal, executionCwd)
      if (entry.snapshot !== current.snapshot) throw Error('审批期间文件或路径已变化，请重新读取再操作。')
      aborted(activeSignal)
      return checked.args
    }
    entry = { name, signature, cwd: executionCwd, args: checked.args, input: { ...input }, snapshot: checked.snapshot }
    calls.set(id, entry)
    onToolEvent({ id, name, args: checked.args, status: 'running' })
    entry.promise = (async () => {
      if (WRITES.has(name) || name === 'Bash') {
        await approval(requestApproval, { name, args: checked.args, cwd: name === 'Bash' ? checked.target : cwd, ...(name === 'Bash' ? { command: checked.args.command } : {}) }, activeSignal)
        const current = await validate(name, input, activeSignal, executionCwd)
        if (current.target !== checked.target || current.snapshot !== checked.snapshot) throw Error('审批期间文件或路径已变化，请重新读取再操作。')
      }
      aborted(activeSignal)
    })()
    await entry.promise
    // Native code opens the file AFTER this hook returns. Unlike stable_file's
    // parent-owned descriptor writes, hooks cannot atomically pin the path or
    // stop an external process swapping a junction/hard link after this check.
    return checked.args
  }
  function failed(id, name, args, error) { calls.delete(id); onToolEvent({ id, name, args, status: 'failed', detail: String(error.message || error) }) }
  async function preToolUse(input, toolUseID, options = {}) {
    const id = input.tool_use_id || toolUseID || `native-tool-${++serial}`
    try {
      const updatedInput = await authorize(input.tool_name, input.tool_input, id, { ...options, cwd: input.cwd })
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput } }
    } catch (error) {
      failed(id, input.tool_name, input.tool_input, error)
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: String(error.message || error) } }
    }
  }
  async function canUseTool(name, input, options = {}) {
    const id = options.toolUseID || `native-tool-${++serial}`
    try { return { behavior: 'allow', updatedInput: await authorize(name, input, id, options) } }
    catch (error) { failed(id, name, input, error); return { behavior: 'deny', message: String(error.message || error) } }
  }
  async function postToolUse(input) {
    const id = input.tool_use_id
    const entry = calls.get(id)
    if (entry) {
      const timedOut = entry.name === 'Bash' && !signal?.aborted && input.tool_response?.interrupted === true
      calls.delete(id)
      onToolEvent({ id, name: entry.name, args: entry.args, status: timedOut ? 'failed' : entry.name === 'Bash' && input.tool_response?.interrupted ? 'cancelled' : 'completed', output: input.tool_response })
      if (timedOut) return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: TIMEOUT_RECOVERY } }
    }
    return {}
  }
  async function postToolUseFailure(input) {
    const entry = calls.get(input.tool_use_id)
    if (entry) {
      const timedOut = entry.name === 'Bash' && !signal?.aborted && /(?:timed out|timeout|超时)/i.test(String(input.error || ''))
      calls.delete(input.tool_use_id)
      onToolEvent({ id: input.tool_use_id, name: entry.name, args: entry.args, status: input.is_interrupt && !timedOut ? 'cancelled' : 'failed', detail: input.error || '原生工具执行失败。' })
      if (timedOut) return { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: TIMEOUT_RECOVERY } }
      if (entry.name === 'Bash' && !signal?.aborted && !input.is_interrupt && /bad substitution|unexpected EOF|syntax error near unexpected token/i.test(String(input.error || ''))) return { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: QUOTING_RECOVERY } }
    }
    return {}
  }
  return { tools, preToolUse, postToolUse, postToolUseFailure, canUseTool }
}

module.exports = { createNativeToolGuard, NATIVE_FILE_TOOLS: TOOLS, BASH_TIMEOUT_MS }
