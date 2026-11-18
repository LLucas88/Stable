'use strict'
const { REPORT_GUIDANCE } = require('./report-guidance.cjs')
const path = require('node:path')
const fs = require('node:fs')
const { createHash } = require('node:crypto')
const TOOL_WATCHDOG_MS = 10 * 60_000
const EXECUTION_GUIDANCE = [
  REPORT_GUIDANCE,
  '执行预算：复用已有帮助说明，同一帮助命令最多2次；整轮帮助查询不超过12次，超限只拦截帮助调用，不终止任务。禁止猜测或枚举数据集 ID。',
  '相同操作失败后必须根据新证据修正，不能重复碰运气。同一操作连续失败3次后，仅拦截原样重复调用，不终止本轮任务；读取真实错误、修复相关文件或调整方案继续。确实无法完成时，由你在最终回复说明具体原因、已完成内容和仍缺少的条件，不把工具错误当作用户要求停止。权限不足不是空数据，不能绕过拒绝。',
  '脚本报错时先读取具体异常与相关数据类型，再修改对应脚本并重试、验证结果；不要只换命令写法或修改无关文件。经过确认的相关文件内容修改可获得新的重试机会，每条命令本轮最多 6 轮修复；权限拒绝和费用上限不因此重置。',
  '工具超时或普通执行错误返回后，整轮任务仍可继续：先分析已有输出，检查已经完成的步骤及可能产生的副作用，再缩小范围、拆分步骤或换策略；不要原样重复长命令，不把超时当作用户要求停止，也不要因此直接放弃。单条 Bash 命令最多 9 分钟，较长工作拆成可恢复步骤。用户停止、权限拒绝、预算耗尽必须遵守，不得绕过。',
  '实时查询不得递归扫描磁盘寻找旧数据。只搜索任务提供或文档明确指出的目录。',
  '普通查询命令设 60 秒超时；较慢查询最多 180 秒。长任务拆成可观察的步骤，不在单条命令内批量探测或循环重试。',
  'SDK 原生 Bash 的临时目录不作为交付位置。后续需要的 JS 库、数据与脚本保存到当前授权工作区的 _work 目录；执行前检查文件确实存在，不重复搜索已消失的 /tmp 文件。',
  'grep/rg 的退出码 1 表示没有匹配；若这是预期的检查结果，显式使用 if grep ...; then ...; else code=$?; [ "$code" -eq 1 ] || exit "$code"; fi，仍保留退出码 2 等真实错误。命令失败不会回滚已经发生的写入。',
  '数据计算前先验证类型并把数值字符串转换为数值；空值、非数值和零分母单独处理，不直接相减或格式化缺失值。HTML 校验使用解析器识别标签，不对包含内嵌脚本的全文用 </body> 字符串出现次数断言文档结构。',
  '长文件按结构分段写入：先写骨架，再用 Edit 填入数据、样式和交互；单次工具参数中的文件内容尽量不超过 3000 字符，保留正常换行，不压成难以定位错误的长行。工具参数必须是完整 JSON，不能把截断内容当作写入成功。',
  '交付前按用户要求列出有限的检查项（数据、桌面与手机布局、放大和关闭等交互）；通过的项目只在相关代码变更后复查。报错先根据具体日志定位自己的配置和代码，不因库源码包含错误提示字符串就断定依赖损坏并反复下载。检查通过后交付；仍有阻塞则说明已完成内容和缺口，不无依据重复试验。',
].join('\n')
function isPermissionAudit(query) {
  return /权限/.test(String(query || '')) && /哪些命令|命令.*(?:权限|可用)|权限.*(?:清单|盘点|检查)|(?:检查|盘点|核查).*权限/.test(String(query || ''))
}
function failureKind(item) {
  // Tool contents are evidence, not an execution status. Reading an error log
  // or printing a JSON example must not turn a successful operation into failure.
  if (!(item.exitCode != null && item.exitCode !== 0 || ['failed','declined','errored'].includes(item.status))) return null
  const output = String(item.aggregatedOutput || item.error?.message || '')
  if (/session\.lock/i.test(output) && /Permission denied|EACCES|拒绝访问/i.test(output)) return 'CLI 会话锁无写权限，请检查 Stable 锁目录与沙箱配置'
  if (/当前品牌无权访问|当前账号缺少权限码|没有权限，请联系管理员/.test(output)) return '数据权限不足，请确认目标数据集权限，不要继续枚举数据集'
  if (item.exitCode != null && item.exitCode !== 0 || ['failed','declined','errored'].includes(item.status)) {
    if (item.toolName === 'stable_browser') return '浏览器操作失败'
    if (['WebFetch','stable_fetch'].includes(item.toolName)) return '网页抓取失败'
    return item.toolName && item.toolName !== 'Bash' ? '工具执行失败' : '命令执行失败'
  }
  return null
}
function operationKey(name, args = {}, cwd = process.cwd(), workspace = cwd) {
  args = args && typeof args === 'object' ? args : { input: args }
  if (name === 'Bash') return path.resolve(cwd) + '\n' + String(args.command || name)
  args = { ...args }
  const field = name === 'NotebookEdit' ? 'notebook_path' : ['Read','Write','Edit'].includes(name) ? 'file_path' : ['Glob','Grep'].includes(name) ? 'path' : null
  if (field && (typeof args[field] === 'string' || field === 'path' && args[field] === undefined)) args[field] = path.resolve(workspace, args[field] || '.')
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().filter(key => !['description','purpose','prompt','timeout','timeoutMs'].includes(key)).map(key => {
      let item = value[key]
      if (key === 'url') { try { const url = new URL(item); url.hash = ''; item = url.href } catch {} }
      return [key, normalize(item)]
    }))
  }
  return name + ' ' + JSON.stringify(normalize(args))
}
class RunProgress {
  constructor({ now = Date.now, idleMs = 5*60_000, toolMs = TOOL_WATCHDOG_MS, toolIdleMs = 2*60_000, permissionAudit = false, workspace = process.cwd(), readableRoots = [] } = {}) {
    this.permissionAudit = permissionAudit
    this.workspace = workspace; this.failureEvidence = new Map(); this.repairs = new Map()
    this.readableRoots = [workspace, ...readableRoots].map(root => path.resolve(root))
    this.now=now; this.idleMs=idleMs; this.toolMs=toolMs; this.toolIdleMs=toolIdleMs; this.started=now(); this.lastActivity=this.started
    this.active=new Map(); this.failures=new Map(); this.help=new Map(); this.helpCount=0; this.completed=0; this.seen=new Set(); this.pausedAt=null
  }
  touch() { this.lastActivity=this.now() }
  startTool({ id, name, args, cwd = this.workspace, retryBlocked = false }) {
    const issue = this.start(id, operationKey(name, args, cwd, this.workspace), false, !retryBlocked)
    const entry = this.active.get(id)
    if (entry) { entry.toolName = name; entry.cwd = cwd }
    return issue
  }
  start(id, command='', monitorOutput=false, countHelp=true) {
    if(this.seen.has(id)) return null
    this.seen.add(id); this.touch()
    this.active.set(id,{started:this.now(),lastOutput:this.now(),monitorOutput,command:String(command)})
    if(countHelp && /--help\b/.test(command)) {
      const key=String(command).trim(); const count=(this.help.get(key)||0)+1; this.help.set(key,count); this.helpCount++
      if(count>2 || this.helpCount>12) return '帮助查询重复或超过 12 次。请使用已有说明继续；任务仍可继续。'
    }
    return null
  }
  output(id) { const entry=this.active.get(id); if(entry){entry.lastOutput=this.now();this.touch()} }
  beforeTool({ name, args, cwd = this.workspace }) {
    const operation = operationKey(name, args, cwd, this.workspace)
    if (name === 'Bash' && /--help\b/.test(args?.command || '') && ((this.help.get(operation.trim()) || 0) >= 2 || this.helpCount >= 12)) return '此帮助调用未执行：已有帮助输出或已达到12次帮助查询。使用已有说明，或说明缺少的接口信息；整轮任务仍可继续。'
    for (const [key, evidence] of this.failureEvidence) {
      if (evidence.operation !== operation) continue
      if (evidence.repairable && (this.repairs.get(key) || 0) < 6 && [...evidence.files].some(([file, digest]) => {
        const current = this.fileDigest(file)
        return current !== undefined && current !== digest
      })) {
        this.failures.delete(key); this.failureEvidence.delete(key); this.repairs.set(key, (this.repairs.get(key) || 0) + 1)
        continue
      }
      if ((this.failures.get(key) || 0) >= 3) return `此调用未执行：同一操作已失败3次，暂不重复执行。整轮任务仍可继续；请先分析错误、修复相关文件或改用有依据的方案。若仍无法完成，请说明具体失败原因与缺少条件。\n最近原因：${evidence.output.slice(-1000)}`
    }
    return null
  }
  guidance() {
    const repeated = [...this.failureEvidence.entries()].filter(([key]) => (this.failures.get(key) || 0) >= 3).slice(-3)
    if (!repeated.length) return ''
    return '以下操作已重复失败；本轮未取消。不要原样重试，请修复或调整方案；若无法继续，在最终回复说明具体原因、已有成果和缺口：\n' + repeated.map(([,e]) => `${e.operation.slice(0,300)}\n${e.output.slice(-600)}`).join('\n')
  }
  fileDigest(file) {
    const contained = this.readableRoots.some(root => { const rel = path.relative(root, file); return rel === '' || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel) })
    if (!contained) return undefined
    try {
      const info = fs.lstatSync(file)
      const canonical = fs.realpathSync(file)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2_000_000 || (process.platform === 'win32' ? canonical.toLowerCase() !== file.toLowerCase() : canonical !== file)) return undefined
      return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    } catch (error) { return error.code === 'ENOENT' ? null : undefined }
  }
  fileEvidence(text, cwd) {
    const files = new Map()
    for (const match of String(text).matchAll(/"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s;&|<>"']+)/g)) {
      if (files.size >= 32) break
      const token = match[1] || match[2] || match[3]
      if (!/\.[a-z0-9]{1,10}$/i.test(token) || token.includes('\0')) continue
      const file = path.resolve(cwd || this.workspace, token), digest = this.fileDigest(file)
      if (digest !== undefined) files.set(file, digest)
    }
    return files
  }
  // Called only after a successful native write verified different file bytes.
  recordFileChange(file) {
    const normalize = value => { const result=path.resolve(this.workspace,value).replace(/\\/g,'/');return process.platform==='win32'?result.toLowerCase():result }
    const target=normalize(file)
    for(const [key,evidence] of this.failureEvidence) {
      if(!this.failures.has(key) || !evidence.repairable || (this.repairs.get(key)||0)>=6) continue
      const tokens=[...evidence.text.matchAll(/"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s;&|<>"']+)/g)].map(match=>match[1]||match[2]||match[3])
      if(!tokens.some(token=>normalize(token)===target)) continue
      this.failures.delete(key);this.failureEvidence.delete(key)
      this.repairs.set(key,(this.repairs.get(key)||0)+1)
    }
  }
  complete(id,item) {
    const entry=this.active.get(id)
    if(!entry) return null
    this.active.delete(id); this.completed++; this.touch()
    if (item.retryBlocked) return null
    const failure=failureKind({...item, toolName:entry.toolName})
    if (!failure) {
      if (item.status === 'cancelled') return null
      for (const [key, evidence] of this.failureEvidence) if (evidence.operation === entry.command) { this.failures.delete(key); this.failureEvidence.delete(key) }
      return null
    }
    const key=entry.command
    const count=(this.failures.get(key)||0)+1;this.failures.set(key,count)
    const output=String(item.aggregatedOutput||item.error?.message||'')
    this.failureEvidence.set(key,{operation:entry.command,text:entry.command+'\n'+output,output,files:this.fileEvidence(entry.command+'\n'+output,entry.cwd),repairable:(!entry.toolName || ['Bash','Read','Write','Edit','NotebookEdit','Glob','Grep'].includes(entry.toolName)) && !/(?:EACCES|EPERM|permission denied|access denied|权限|拒绝|预算|额度|quota|budget)/i.test(output)})
    if(count>=3) return failure+'；同一操作本轮已出现 3 次。下一次原样调用将被拦截，整轮任务仍可继续；请根据错误修复或调整方案，无法完成时说明具体原因。'+(output ? '\n最近原因：'+output.slice(-600) : '')
    return null
  }
  check(waiting=false, { managedToolIds = new Set(), backgroundActive = false, awaitingTaskResults = false } = {}) {
    const now=this.now()
    if(waiting){this.pausedAt ??= now; return null}
    if(this.pausedAt!==null){const pause=now-this.pausedAt;for(const entry of this.active.values()){entry.started+=pause;entry.lastOutput+=pause}this.lastActivity+=pause;this.pausedAt=null}
    if([...this.active].some(([id,entry])=>!managedToolIds.has(id) && now-entry.started>=this.toolMs)) return '单次工具执行超过 10 分钟未完成，已停止任务。请缩小查询范围或拆分步骤后继续。'
    if(!backgroundActive && awaitingTaskResults && now-this.lastActivity>=this.idleMs) return 'SDK 已移除后台任务，但连续 5 分钟未收到结果或其他执行进展，无法确认交付；已有文件保留。'
    if(!this.active.size && !backgroundActive && now-this.lastActivity>=this.idleMs) return '连续 5 分钟未收到模型或工具进展，已停止等待。请检查模型连接后继续，已有结果保留。'
    return null
  }
  notice() {
    if (this.pausedAt !== null) return ''
    return [...this.active.values()].some(entry => this.now() - entry.lastOutput >= this.toolIdleMs)
      ? '工具已超过2分钟未返回结果，仍在等待；没有据此判定失败或取消任务。' : ''
  }
  detail(){return `已用时 ${Math.floor((this.now()-this.started)/60000)} 分钟；已完成 ${this.completed} 次工具调用；帮助查询 ${this.helpCount} 次。`}
}
module.exports={RunProgress,failureKind,EXECUTION_GUIDANCE,isPermissionAudit,TOOL_WATCHDOG_MS}
