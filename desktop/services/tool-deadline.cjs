'use strict'

const TOOL_EXECUTION_MS = 9 * 60_000
// Stable's handlers wait for host approvals internally. Execution is bounded
// separately below, so the SDK transport must not consume that approval wait.
const STABLE_MCP_TRANSPORT_MS = 24 * 60 * 60_000
function executionTimeout(value) {
  return Number.isFinite(value) && value > 0 ? Math.min(value, TOOL_EXECUTION_MS) : TOOL_EXECUTION_MS
}
async function withToolDeadline(signal, timeoutMs, operation) {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const timeout = Object.assign(new Error('单次工具执行超时，已请求终止该操作；任务仍可继续。先检查已有结果及可能发生的写入，再修复、拆分步骤或换方案，不原样重复。'), { code: 'STABLE_TOOL_TIMEOUT' })
  const timer = setTimeout(() => controller.abort(timeout), executionTimeout(timeoutMs))
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  try {
    // Await actual settlement. Racing the promise would allow a timed-out
    // writer to keep changing files while the model starts another operation.
    const result = await operation(combined)
    combined.throwIfAborted()
    return result
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw timeout
    throw error
  } finally { clearTimeout(timer) }
}
module.exports = { TOOL_EXECUTION_MS, STABLE_MCP_TRANSPORT_MS, executionTimeout, withToolDeadline }
