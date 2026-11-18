'use strict'

const STARTUP_REASONS = {
  config_file_invalid: 'Claude 配置文件不是有效 JSON；请按下方路径修复配置后再运行，重复发送无法修复。',
  sandbox_required_unavailable: '当前策略要求沙箱，但本机无法启动所需沙箱；请补齐运行环境或由管理员调整策略。',
  initialize_not_first: 'Claude 初始化协议顺序错误；请检查运行时启动器，不能靠重试模型请求解决。',
  managed_settings_invalid: '管理员策略无效或未提供允许使用的模型；请检查管理配置。',
  provider_not_allowed: '管理员策略不允许当前模型服务；请选择允许的服务或联系管理员。',
  org_pin_api_key_conflict: '管理员要求的登录方式与当前 API 凭据冲突；请核对组织登录配置。',
  org_verify_failed: '无法验证登录所属组织；请检查网络和登录状态。',
  org_pin_mismatch: '当前登录组织不符合管理员要求；请切换到获准的组织。',
  remote_settings_required_unavailable: '无法取得必须加载的组织策略；请检查网络后再试。',
  org_config_required_unavailable: '无法加载组织要求的配置；请检查网络或代理后再试。',
  org_config_refused: '组织拒绝提供所需配置；请重新登录或联系管理员。',
  gateway_signin_required: '模型网关要求重新登录；请恢复登录后再运行。',
  gateway_access_denied: '模型网关拒绝当前账户访问；请检查账户权限。',
  proxy_invalid: '代理配置不是完整有效的 URL；请修正代理配置。',
  temp_dir_unusable: 'Claude 临时目录无法安全创建或访问；请检查目录权限和可用空间。',
  cwd_unavailable: '任务工作目录不存在或无法读取；请恢复目录或选择可访问的工作区。',
  shell_tool_missing: 'Claude 找不到可用的 Windows 命令运行时；请检查 Stable 内置 Git Bash。',
  session_held_by_background: '此会话仍被后台运行占用；请等待或停止原运行后再继续。',
  worktree_resume_refused: '原工作树未通过恢复安全检查；请检查下方原因后重新选择工作区。',
  worktree_unverified: '暂时无法验证原工作树；请检查目录是否可用。',
  cli_version_too_old: 'Claude 运行时版本已不满足服务要求；请更新 Stable 运行时。',
  bypass_root: 'Claude 不允许以当前系统身份绕过权限检查；请使用正常权限模式。',
}

function startupFailure(reason, detail = '') {
  if (typeof reason !== 'string' || !reason) return null
  return Object.assign(new Error(`${STARTUP_REASONS[reason] || 'Claude 启动失败，请检查运行环境。'}（${reason}）${detail ? '\n' + detail : ''}`), {
    code: 'CLAUDE_STARTUP_FAILURE', startupFailureReason: reason,
  })
}

function sdkDiagnostic(message) {
  if (message?.type !== 'system') return null
  if (message.subtype === 'informational' && typeof message.content === 'string') {
    return { kind: 'notice', title: message.level === 'warning' ? '运行时提醒' : '运行时信息', detail: message.content, level: message.level }
  }
  if (message.subtype !== 'session_writes_lost') return null
  const lost = Array.isArray(message.lost) ? message.lost : []
  const transcriptLost = lost.includes('transcript') || !lost.length
  const cause = message.error_code === 'ENOSPC' ? '磁盘空间不足' : message.error_code === 'EDQUOT' ? '磁盘配额已用尽' : `存储错误（${message.error_code || '未知'}）`
  const target = transcriptLost ? 'SDK 会话记录' : '运行时配置'
  return { kind: 'persistence', transcriptLost, title: '运行记录未完整保存', detail: `${cause}，${target}未完整保存。${transcriptLost ? '本轮回答仍有效；下次将从 Stable 本地对话历史重建上下文。' : '本轮回答仍有效，请检查磁盘后再继续。'}` }
}

// The SDK closes stdin only after the input iterator ends and the run becomes
// idle. close() is an abort, not a transcript-flush acknowledgement. Consume
// the same iterator to EOF with an absolute deadline (even busy streams cannot
// extend it); a pending next() is always observed, including late rejection.
function settleWithin(promise, timeoutMs, signal) {
  return new Promise(resolve => {
    let finished = false
    const finish = result => {
      if (finished) return
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(result)
    }
    const aborted = () => finish({ state: 'aborted' })
    const timer = setTimeout(() => finish({ state: 'timeout' }), Math.max(0, timeoutMs))
    if (signal?.aborted) aborted()
    else signal?.addEventListener('abort', aborted, { once: true })
    Promise.resolve(promise).then(value => finish({ state: 'settled', value }), error => finish({ state: 'error', error }))
  })
}

async function drainSdkMessages(iterator, onMessage, { timeoutMs = 5000, signal } = {}) {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    const remaining = deadline - performance.now()
    if (remaining <= 0) return { state: 'timeout' }
    const next = await settleWithin(Promise.resolve().then(() => iterator.next()), remaining, signal)
    if (next.state !== 'settled') return next
    if (next.value.done) return { state: 'complete' }
    onMessage(next.value.value)
  }
}

module.exports = { startupFailure, sdkDiagnostic, settleWithin, drainSdkMessages }
