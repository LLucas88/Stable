'use strict'

// Supplement native Claude tools with Stable product capabilities.
const fs = require('node:fs')
const path = require('node:path')
const z = require('zod/v4')
const { TOOL_SPECS } = require('./builtin-tool-bridge.cjs')

const inside = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
function checkAbort(signal) { if (signal?.aborted) throw new Error('任务已停止。') }
function rootsFor(values) {
  return [...new Set(values.filter(Boolean).map(value => fs.realpathSync(path.resolve(value))))]
}
function checkTargetSyntax(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('需要有效的文件路径。')
  // NTFS alternate streams and device namespaces must not bypass file checks.
  if (process.platform === 'win32' && (/^(?:\\\\[?.]\\|\\\?\?\\)/.test(value) || /:/.test(value.replace(/^[a-z]:/i, '')))) throw new Error('不支持设备路径或 NTFS 备用数据流。')
}
function resolveBoundPath(value, workspace, roots, { missing = false, write = false } = {}) {
  checkTargetSyntax(value)
  const requested = path.resolve(workspace, value)
  let ancestor = requested
  const suffix = []
  while (!fs.existsSync(ancestor)) {
    // existsSync is false for a dangling symlink. Do not treat it as a new file.
    try { fs.lstatSync(ancestor); throw new Error('路径包含不可用链接。') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!missing || ancestor === path.dirname(ancestor)) throw new Error('文件或目录不存在。')
    suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor)
  }
  const canonical = path.join(fs.realpathSync(ancestor), ...suffix)
  if (!roots.some(root => inside(root, canonical))) throw new Error('路径超出此任务允许的目录。')
  if (write) {
    if (roots.some(root => ['.git', '.codex', '.claude', '.agents'].some(name => inside(path.join(root, name), canonical)))) throw new Error('运行时和版本控制配置目录只允许读取。')
    if (fs.existsSync(canonical)) {
      const info = fs.statSync(canonical)
      if (info.isFile() && info.nlink > 1) throw new Error('不能写入多重硬链接文件，请另存到工作区。')
    }
    if (roots.some(root => samePath(root, canonical))) throw new Error('不能把工作区根目录作为文件写入。')
  }
  return canonical
}
function schemaFor(descriptor) {
  const { required: _required, ...schema } = descriptor
  if (schema.type === 'json') delete schema.type
  if (schema.properties) {
    const properties = schema.properties
    schema.properties = Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, schemaFor(value)]))
    schema.required = Object.keys(properties).filter(name => properties[name].required === true)
  }
  if (schema.items) schema.items = schemaFor(schema.items)
  return schema
}
function combinedSignal(signals) {
  const active = signals.filter(Boolean)
  if (!active.length) return undefined
  if (active.length === 1) return active[0]
  return AbortSignal.any(active)
}
async function approved(requestApproval, request, signal) {
  checkAbort(signal)
  if (typeof requestApproval !== 'function') throw new Error('缺少此任务的权限审批服务。')
  let listener
  const interrupted = new Promise((_resolve, reject) => {
    listener = () => reject(new Error('任务已停止。'))
    signal?.addEventListener('abort', listener, { once: true })
    if (signal?.aborted) listener()
  })
  try {
    const allowed = await Promise.race([Promise.resolve().then(() => requestApproval(request)), interrupted])
    checkAbort(signal)
    if (allowed !== true) throw new Error('用户未批准本次操作，未执行。')
  } finally { signal?.removeEventListener('abort', listener) }
}
function mcpContent(value) {
  if (typeof value?.image === 'string') {
    const match = value.image.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/)
    if (match) { const { image: _image, ...metadata } = value; return { content: [{ type: 'text', text: JSON.stringify(metadata) }, { type: 'image', mimeType: match[1], data: match[2] }] } }
  }
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }
}

function createClaudeTools({ sdk, workspace, writableRoots = [], sandboxMode = 'workspace-write', trustedCli, builtinTools, requestApproval, onToolEvent = () => {}, signal, search }) {
  const canonicalWorkspace = fs.realpathSync(path.resolve(workspace))
  const writes = rootsFor([canonicalWorkspace, ...writableRoots])
  if (process.platform === 'win32' && sandboxMode !== 'read-only' && writes.some(root => samePath(root, path.parse(root).root))) throw new Error('不能将整个盘符根目录作为可写工作区。')
  let serial = 0
  const tools = []
  function add(name, description, shape, handler) {
    const validation = z.object(shape).strict()
    tools.push(sdk.tool(name, description, shape, async (input, extra) => {
      const id = `claude-tool-${++serial}`
      const toolSignal = combinedSignal([signal, extra?.signal])
      const event = { id, name, args: input }
      try {
        checkAbort(toolSignal)
        const args = validation.parse(input)
        onToolEvent({ ...event, status: 'running' })
        const result = await handler(args, { id, signal: toolSignal })
        checkAbort(toolSignal)
        onToolEvent({ ...event, status: 'completed', output: result })
        return mcpContent(result)
      } catch (error) {
        onToolEvent({ ...event, status: 'failed', detail: error.message, ...(error.result ? { output: error.result } : {}) })
        return { content: [{ type: 'text', text: error.message }], isError: true }
      }
    }, { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }))
  }
  if (typeof search === 'function') add('stable_search', '查询当前模型服务提供的联网搜索，返回可核对来源。', { query: z.string().min(1).max(1000) }, (args, context) => search(args, context.signal))
  if (trustedCli) add('stable_wending', '通过受控 Windows 接口调用内置问鼎 CLI。args 是逐项参数数组，例如 ["--help"]；不接受 shell 命令。每次调用需审批，使用本会话品牌配置。登录和凭据管理在 Stable 专用界面完成。', {
    args: z.array(z.string().min(1).max(4096)).min(1).max(100),
  }, async (args, context) => {
    if (sandboxMode === 'read-only') throw Error('只读任务不允许调用 Windows 业务 CLI。')
    const { validateArguments, runWending } = require('./wending-agent-tool.cjs')
    validateArguments(args.args)
    await approved(requestApproval, { name: 'stable_wending', args, cwd: canonicalWorkspace }, context.signal)
    return runWending({ trustedCli, args: args.args, cwd: canonicalWorkspace, signal: context.signal })
  })
  if (builtinTools) for (const spec of TOOL_SPECS) {
    const shape = z.fromJSONSchema(schemaFor({ type: 'object', properties: spec.parameters, additionalProperties: false })).shape
    add(spec.name, spec.description, shape, async (args, context) => {
      const needsApproval = spec.name === 'stable_skill_install' || spec.name === 'stable_browser' && ['open', 'click', 'fill', 'select', 'key', 'drag'].includes(args.action)
      if (needsApproval && sandboxMode === 'read-only') throw new Error('只读模式不允许安装 Skill 或网页交互。')
      if (needsApproval) await approved(requestApproval, { name: spec.name, args, cwd: canonicalWorkspace }, context.signal)
      const abort = () => builtinTools.cancel(context.id)
      context.signal?.addEventListener('abort', abort, { once: true })
      try { checkAbort(context.signal); return await builtinTools.execute({ requestId: context.id, name: spec.name, args, approved: needsApproval }, sandboxMode) }
      finally { context.signal?.removeEventListener('abort', abort) }
    })
  }
  return sdk.createSdkMcpServer({ name: 'stable', version: '1.0.0', tools })
}

module.exports = { createClaudeTools, resolveBoundPath }
