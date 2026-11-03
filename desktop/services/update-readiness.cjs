'use strict'
const { randomUUID } = require('node:crypto')

// A fresh renderer acknowledgement is required; missing/stale replies fail closed.
function createUpdateReadiness({ ipcMain, getWindow, blockers, timeoutMs = 5000 }) {
  const pending = new Map()
  ipcMain.handle('stable:update:prepared', (event, payload) => {
    const request = pending.get(payload?.id)
    if (!request || event.sender !== request.contents || event.senderFrame !== request.contents.mainFrame) return false
    pending.delete(payload.id)
    request.resolve(payload.result === 'ready' ? '' : payload.result === 'busy' ? '文件处理或消息编辑尚未完成，请处理后再次点击一键更新。' : '草稿尚未安全保存，请保存重要内容后再次点击一键更新。')
    return true
  })
  function assertIdle() {
    const message = blockers()
    if (message) throw Error(message)
  }
  return async () => {
    assertIdle()
    const window = getWindow()
    if (!window || window.isDestroyed()) throw Error('客户端界面尚未准备好，请稍后重试更新。')
    const id = randomUUID(), contents = window.webContents
    let timer
    try {
      const message = await new Promise(resolve => {
        pending.set(id, { contents, resolve })
        timer = setTimeout(() => resolve('界面未确认草稿保存，已暂停安装。请稍后再次点击一键更新。'), timeoutMs)
        contents.send('stable:update:prepare', { id })
      })
      if (message) throw Error(message)
      contents.session?.flushStorageData()
      assertIdle()
    } finally { clearTimeout(timer); pending.delete(id) }
  }
}
module.exports = { createUpdateReadiness }
