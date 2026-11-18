import { useState } from 'react'
import type { AgentTraceItem, AgentTraceStatus } from './types'

export function SdkTask({ item, status }: { item: AgentTraceItem; status: AgentTraceStatus }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const running = status === 'running' && item.status === 'running'
  const durationMs = item.taskUsage?.duration_ms ?? Math.max(0, (running ? Date.now() : item.time) - (item.startedAt ?? item.time))
  const label = running ? (item.taskBackground ? '后台运行中' : '运行中') : item.status === 'completed' ? '已完成' : item.status === 'failed' ? '失败' : '已停止'
  async function act(action: 'stop' | 'background') {
    if (pending || !running || !item.conversationId || !item.taskId) return
    setPending(true); setError('')
    try {
      const applied = await window.stable.agent.taskAction(item.conversationId, item.runId, item.taskId, action)
      if (!applied) setError('任务状态已变化，请等待最新进度。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setPending(false) }
  }
  return <div className="sdk-task" data-status={item.status}>
    <div><strong>{item.title}</strong><span className="sdk-task-state">{label}</span></div>
    <p>已运行 {Math.floor(durationMs / 1000)} 秒{item.taskUsage && ` · ${item.taskUsage.tool_uses} 次工具调用`}</p>
    {item.detail && <details><summary>进度与结果</summary><pre>{item.detail}</pre></details>}
    {running && item.conversationId && <div className="sdk-task-actions">
      {!item.taskBackground && item.taskToolUseId && ['local_bash', 'local_agent'].includes(item.taskType || '') && <button disabled={pending} onClick={() => void act('background')}>转入后台</button>}
      <button disabled={pending} onClick={() => void act('stop')}>停止此任务</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>
}
