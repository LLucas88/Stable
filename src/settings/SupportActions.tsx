import { useEffect, useState } from 'react'

export function DiagnosticExport() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save() {
    setBusy(true); setMessage('')
    try {
      const result = await window.stable.support.exportDiagnostics()
      if (result) setMessage(`已保存：${result.path}`)
    } catch { setMessage('导出失败，请选择可写入的文件夹后重试。') }
    finally { setBusy(false) }
  }
  return <div className="support-diagnostics">
    <button className="button" type="button" disabled={busy} onClick={() => void save()}>{busy ? '正在导出…' : '导出脱敏诊断'}</button>
    <p>仅包含版本、连接阶段、耗时与错误码，不包含密码、令牌、账号或聊天内容。保存后可发给管理员。</p>
    {message && <p role="status">{message}</p>}
  </div>
}

export function UpdateRecovery() {
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('正在检查本机回退工具…')
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => window.stable.support.recovery()).then(value => {
      if (!active) return
      setAvailable(value.rollbackAvailable)
      setMessage(value.rollbackAvailable ? '检测到上次升级生成的回退脚本。' : '本机暂无回退脚本；首次安装或本地开发版不会生成。需要修复时请向管理员索取完整安装包。')
    }).catch(() => { if (active) setMessage('暂时无法检查回退工具，请导出诊断并联系管理员。') })
    return () => { active = false }
  }, [])
  return <section className="update-recovery" aria-label="更新故障恢复">
    <h3>更新故障恢复</h3>
    <p>{message}</p>
    <p>安装器会在升级前备份本机配置和聊天记录。新程序启动检查失败时会退回旧程序，不会因为云端断线而回退。</p>
    {available && <><button className="button" type="button" onClick={() => {
      void window.stable.support.openRollback().catch(() => setMessage('回退脚本已不可用，请联系管理员获取完整修复包。'))
    }}>定位回退脚本</button><p>请先退出所有 Stable，再按管理员指导运行脚本。手动回退会恢复升级前的数据；升级后新增的聊天会保留在恢复目录中，不会自动合并回旧记录。</p></>}
    <DiagnosticExport />
  </section>
}
