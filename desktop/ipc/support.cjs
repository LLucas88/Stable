'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { collectDiagnostics, recordRecovery } = require('../services/support-diagnostics.cjs')
function registerSupportIpc({ ipcMain, dialog, shell, getWindow, userData, app, cloudAccount, updateController }) {
  const rollbackFile = path.join(path.dirname(app.getPath('exe')), 'Rollback-Stable.ps1')
  const rollbackAvailable = () => {
    try { return app.isPackaged && fs.lstatSync(rollbackFile).isFile() && !fs.lstatSync(rollbackFile).isSymbolicLink() } catch { return false }
  }
  ipcMain.handle('stable:support:recovery', () => ({ rollbackAvailable: rollbackAvailable() }))
  ipcMain.handle('stable:support:open-rollback', () => {
    if (!rollbackAvailable()) throw Error('当前安装没有回退脚本，请联系管理员获取完整修复包。')
    shell.showItemInFolder(rollbackFile) // Locate only; never restore from a running client.
    return true
  })
  ipcMain.handle('stable:cloud:diagnostic', (_event, phase) => {
    if (phase !== 'startup_failed') return false
    recordRecovery(path.join(userData, 'logs/cloud-recovery.jsonl'), { phase, version: app.getVersion() })
    return true
  })
  ipcMain.handle('stable:support:export', async () => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: '导出脱敏诊断报告', defaultPath: 'Stable-diagnostics.json',
      filters: [{ name: 'JSON 诊断报告', extensions: ['json'] }], properties: ['showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return null
    const report = collectDiagnostics({ userData, version: app.getVersion(), cloudStatus: cloudAccount?.publicState().status, updateStatus: updateController.state().status })
    await fs.promises.writeFile(result.filePath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 })
    return { path: result.filePath }
  })
}
module.exports = { registerSupportIpc }
