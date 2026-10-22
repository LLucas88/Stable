'use strict'
const { REPORT_GUIDANCE } = require('./report-guidance.cjs')
const TOOL_WATCHDOG_MS = 10 * 60_000
const EXECUTION_GUIDANCE = [
  REPORT_GUIDANCE,
  '执行预算：同一帮助命令只读取一次；整轮帮助查询不超过 12 次。禁止猜测或枚举数据集 ID。',
  '相同操作失败后必须根据新证据修正，不能重复碰运气。权限不足不是空数据；报告已取得结果与缺口。',
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
  const output = String(item.aggregatedOutput || item.error?.message || '')
  if (/session\.lock/i.test(output) && /Permission denied|EACCES|拒绝访问/i.test(output)) return 'CLI 会话锁无写权限，请检查 Stable 锁目录与沙箱配置'
  if (/当前品牌无权访问|当前账号缺少权限码|没有权限，请联系管理员/.test(output)) return '数据权限不足，请确认目标数据集权限，不要继续枚举数据集'
  // Parse JSON responses so quoted source examples do not count as failures.
  for (const line of output.split(/\r?\n/)) {
    try {
      let value=JSON.parse(line.trim())
      for(let i=0;i<3 && typeof value==='string';i++) value=JSON.parse(value)
      if(value && typeof value==='object' && (value.success===false || value.succeed===false || typeof value.error==='string')) return '接口返回业务失败'
    } catch {}
  }
  if (item.exitCode != null && item.exitCode !== 0 || ['failed','declined','errored'].includes(item.status)) return '命令执行失败'
  return null
}
class RunProgress {
  constructor({ now = Date.now, idleMs = 5*60_000, toolMs = TOOL_WATCHDOG_MS, toolIdleMs = 2*60_000, permissionAudit = false } = {}) {
    this.permissionAudit = permissionAudit
    this.now=now; this.idleMs=idleMs; this.toolMs=toolMs; this.toolIdleMs=toolIdleMs; this.started=now(); this.lastActivity=this.started
    this.active=new Map(); this.failures=new Map(); this.help=new Map(); this.helpCount=0; this.completed=0; this.seen=new Set(); this.pausedAt=null
  }
  touch() { this.lastActivity=this.now() }
  start(id, command='', monitorOutput=false) {
    if(this.seen.has(id)) return null
    this.seen.add(id); this.touch()
    this.active.set(id,{started:this.now(),lastOutput:this.now(),monitorOutput,command:String(command)})
    if(/--help\b/.test(command)) {
      const key=String(command).trim(); const count=(this.help.get(key)||0)+1; this.help.set(key,count); this.helpCount++
      if(count>2 || this.helpCount>12) return '帮助查询重复或超过 12 次，已停止无效探索。请根据已有命令说明继续，或补充缺少的接口信息。'
    }
    return null
  }
  output(id) { const entry=this.active.get(id); if(entry){entry.lastOutput=this.now();this.touch()} }
  complete(id,item) {
    const entry=this.active.get(id)
    if(!entry) return null
    this.active.delete(id); this.completed++; this.touch()
    const failure=failureKind(item)
    if (!failure) {
      this.failures.delete('命令执行失败|'+entry.command);this.failures.delete('接口返回业务失败|'+entry.command)
      return null
    }
    // An explicit permissions inventory expects denials across different named
    // read-only commands. Parameters do not create a new retry budget.
    const auditCommand=this.permissionAudit && failure.startsWith('数据权限') && /crm-brand-cli/i.test(entry.command) ? entry.command.match(/\bquery-[a-z0-9-]+\b/i)?.[0]?.toLowerCase() : null
    const key=auditCommand ? failure+'|'+auditCommand : failure.startsWith('命令') || failure.startsWith('接口') ? failure+'|'+entry.command : failure
    const count=(this.failures.get(key)||0)+1;this.failures.set(key,count)
    if(count>=3) return failure+'；本轮已出现 3 次，已停止重复尝试。已完成文件保留，可修正问题后继续。'
    return null
  }
  check(waiting=false) {
    const now=this.now()
    if(waiting){this.pausedAt ??= now; return null}
    if(this.pausedAt!==null){const pause=now-this.pausedAt;for(const entry of this.active.values()){entry.started+=pause;entry.lastOutput+=pause}this.lastActivity+=pause;this.pausedAt=null}
    if([...this.active.values()].some(entry=>entry.monitorOutput && now-entry.lastOutput>=this.toolIdleMs)) return '工具连续 2 分钟没有返回输出，已停止等待。命令可能卡在启动或执行阶段，请检查工作目录与运行环境；已有文件保留。'
    if([...this.active.values()].some(entry=>now-entry.started>=this.toolMs)) return '单次工具执行超过 10 分钟未完成，已停止任务。请缩小查询范围或拆分步骤后继续。'
    if(!this.active.size && now-this.lastActivity>=this.idleMs) return '连续 5 分钟未收到模型或工具进展，已停止等待。请检查模型连接后继续，已有结果保留。'
    return null
  }
  detail(){return `已用时 ${Math.floor((this.now()-this.started)/60000)} 分钟；已完成 ${this.completed} 次命令；帮助查询 ${this.helpCount} 次。`}
}
module.exports={RunProgress,failureKind,EXECUTION_GUIDANCE,isPermissionAudit,TOOL_WATCHDOG_MS}
