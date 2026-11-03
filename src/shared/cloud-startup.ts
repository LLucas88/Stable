import type { BootstrapData } from '../types'

// Recovery must settle in the UI even when a main-process IPC reply is lost.
export function recoverCloudStartup(
  startup: () => Promise<BootstrapData>,
  complete: (value: BootstrapData) => void,
  fail: (reason: unknown) => void,
  timeoutMs = 35_000,
) {
  let active = true
  const timer = setTimeout(() => {
    if (!active) return
    active = false
    fail(new Error('恢复登录超时，请点击“重新连接”；也可清除本机登录后重新登录。'))
  }, timeoutMs)
  void Promise.resolve().then(startup).then(value => {
    if (!active) return
    active = false
    clearTimeout(timer)
    if (value.cloud.status === 'checking') fail(new Error('登录状态尚未恢复，请点击“重新连接”。'))
    else complete(value)
  }, reason => {
    if (!active) return
    active = false
    clearTimeout(timer)
    fail(reason)
  })
  return () => { active = false; clearTimeout(timer) }
}
