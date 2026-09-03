// Expected stop acknowledgements are state changes, not actionable errors.
// Keep this allowlist exact: a failure mentioning cancellation must still be shown.
export function taskErrorMessage(message: string): string {
  const detail = message.trim()
  if (/^(?:任务已(?:停止|取消)|脚本执行已取消)[。.!]?$/.test(detail)
    || detail === '已停止发送，消息仍保留在队列中。') return ''
  return message
}
