 'use strict'
function installWindowCloseChoice(window, app, ipcMain, settings) {
  let quitting = false, prompting = false
  window.closeChoiceManaged = true
  const channel = 'stable:window:closeDecision'
  const beforeQuit = () => { quitting = true }
  const act = choice => { if (choice === 'minimize') window.minimize(); else if (choice === 'quit') app.quit() }
  app.on('before-quit', beforeQuit)
  window.on('query-session-end', beforeQuit)
  window.on('session-end', beforeQuit)
  ipcMain.handle(channel, (event, value) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw Error('无效窗口请求')
    if (!prompting || !['minimize', 'quit', 'cancel'].includes(value?.choice)) throw Error('无效关闭选项')
    if (value.choice !== 'cancel') settings.set(value.remember === true ? value.choice : null)
    prompting = false
    act(value.choice)
    return true
  })
  window.on('closed', () => { app.removeListener('before-quit', beforeQuit); ipcMain.removeHandler(channel) })
  window.on('close', event => {
    if (quitting) return
    event.preventDefault()
    if (prompting) return
    const saved = settings.get()
    if (['minimize', 'quit'].includes(saved)) { act(saved); return }
    prompting = true
    window.webContents.send('stable:window:closeRequested')
  })
}
module.exports = { installWindowCloseChoice }
