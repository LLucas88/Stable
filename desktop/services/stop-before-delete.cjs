'use strict'
async function stopBeforeDelete(id, runners, cancel, timeout = 10000) {
  if (!runners.has(id)) return
  cancel(id)
  const deadline = Date.now() + timeout
  while (runners.has(id)) {
    if (Date.now() >= deadline) throw Error('任务仍在停止中，对话尚未删除，请稍后重试。')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
module.exports = { stopBeforeDelete }
