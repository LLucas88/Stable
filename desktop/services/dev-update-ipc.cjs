'use strict'

const inactiveState = () => ({ enabled: false, revision: 0, action: null, applying: false, blocked: false, message: '' })

function registerDevUpdateIpc({ ipcMain, getWindow, getController, enabled }) {
  function assertMainFrame(event) {
    const window = getWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw Error('此页面无权操作测试版更新。')
    }
  }
  ipcMain.handle('stable:development:state', event => {
    assertMainFrame(event)
    return enabled() ? getController()?.state() || inactiveState() : inactiveState()
  })
  ipcMain.handle('stable:development:apply', (event, payload) => {
    assertMainFrame(event)
    const controller = enabled() && getController()
    if (!controller || !controller.state().enabled) throw Error('源码监听器未连接，请重新运行测试启动命令。')
    if (!Number.isSafeInteger(payload?.revision) || payload.revision <= 0) throw Error('更新请求无效，请等待最新的更新提示。')
    return controller.apply(payload.revision)
  })
}

module.exports = { registerDevUpdateIpc }
