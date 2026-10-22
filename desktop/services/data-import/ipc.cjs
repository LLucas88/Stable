'use strict'
const path = require('node:path')
const os = require('node:os')

function registerDataImportIpc({ ipcMain, service, dialog, getWindow, agentState }) {
  ipcMain.handle('stable:workbuddy:state', () => service().state())
  ipcMain.handle('stable:workbuddy:activateConnector', (_event, payload) => service().activateConnector(payload?.id, payload?.config))
  ipcMain.handle('stable:workbuddy:scan', async (_event, payload) => {
    const provider = payload?.provider || 'workbuddy'
    if (!['workbuddy', 'codex'].includes(provider)) throw Error('不支持此应用。')
    let root = provider === 'workbuddy' ? path.join(os.homedir(), '.workbuddy') : null
    if (payload?.chooseDirectory === true) {
      const options = { title: provider === 'codex' ? '选择 Codex 数据目录（.codex）' : '选择 WorkBuddy 数据目录（.workbuddy）', properties: ['openDirectory'] }
      const result = await dialog.showOpenDialog(getWindow(), options)
      if (result.canceled || !result.filePaths[0]) return null
      root = result.filePaths[0]
    }
    return service().scan(root, provider)
  })
  ipcMain.handle('stable:workbuddy:detail', (_event, payload) => service().detail(payload?.token, payload?.id))
  ipcMain.handle('stable:workbuddy:import', (_event, payload) => service().importSelected(payload?.token, payload?.ids))
  ipcMain.handle('stable:workbuddy:continuationOptions', (_event, payload) => service().continuationOptions(payload?.id))
  ipcMain.handle('stable:workbuddy:continue', (_event, payload) => agentState(service().continueConversation(payload?.id, payload?.documentIds)))
}

module.exports = { registerDataImportIpc }
