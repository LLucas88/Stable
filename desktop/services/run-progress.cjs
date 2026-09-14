'use strict'
const EXECUTION_GUIDANCE = [
  '执行预算：同一帮助命令只读取一次；整轮帮助查询不超过 12 次。禁止猜测或枚举数据集 ID。',
  '相同操作失败后必须根据新证据修正，不能重复碰运气。权限不足不是空数据；报告已取得结果与缺口。',
  '实时查询不得递归扫描磁盘寻找旧数据。只搜索任务提供或文档明确指出的目录。',
  '普通查询命令设 60 秒超时；较慢查询最多 180 秒。长任务拆成可观察的步骤，不在单条命令内批量探测或循环重试。',
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
  constructor({ now = Date.now, idleMs = 5*60_000, toolMs = 10*60_000, permissionAudit = false } = {}) {
    this.permissionAudit = permissionAudit
    this.now=now; this.idleMs=idleMs; this.toolMs=toolMs; this.started=now(); this.lastActivity=this.started
    this.active=new Map(); this.failures=new Map(); this.help=new Map(); this.helpCount=0; this.completed=0; this.seen=new Set(); this.pausedAt=null
  }
  touch() { this.lastActivity=this.now() }
  start(id, command='') {
    if(this.seen.has(id)) return null
    this.seen.add(id); this.touch()
    this.active.set(id,{started:this.now(),command:String(command)})
    if(/--help\b/.test(command)) {
      const key=String(command).trim(); const count=(this.help.get(key)||0)+1; this.help.set(key,count); this.helpCount++
      if(count>2 || this.helpCount>12) return '帮助查询重复或超过 12 次，已停止无效探索。请根据已有命令说明继续，或补充缺少的接口信息。'
    }
    return null
  }
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
    if(this.pausedAt!==null){const pause=now-this.pausedAt;for(const entry of this.active.values())entry.started+=pause;this.lastActivity+=pause;this.pausedAt=null}
    if([...this.active.values()].some(entry=>now-entry.started>=this.toolMs)) return '单次工具执行超过 10 分钟未完成，已停止任务。请缩小查询范围或拆分步骤后继续。'
    if(!this.active.size && now-this.lastActivity>=this.idleMs) return '连续 5 分钟未收到模型或工具进展，已停止等待。请检查模型连接后继续，已有结果保留。'
    return null
  }
  detail(){return `已用时 ${Math.floor((this.now()-this.started)/60000)} 分钟；已完成 ${this.completed} 次命令；帮助查询 ${this.helpCount} 次。`}
}
module.exports={RunProgress,failureKind,EXECUTION_GUIDANCE,isPermissionAudit}
