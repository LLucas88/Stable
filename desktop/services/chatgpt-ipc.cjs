'use strict'
function registerChatGPT({ ipcMain, account, guard, openExternal }) {
  for (const method of ['status', 'signIn', 'cancel', 'signOut', 'refreshModels', 'openUsage']) {
    ipcMain.handle(`stable:chatgpt:${method}`, async event => {
      guard(event)
      if (method === 'openUsage') { await openExternal('https://chatgpt.com/settings/usage'); return }
      if (method === 'status') return account.state()
      return account[method]()
    })
  }
}
module.exports = { registerChatGPT }
