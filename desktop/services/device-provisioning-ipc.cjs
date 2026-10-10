'use strict'
const { readFileSync, writeFileSync, statSync } = require('node:fs')
const { DeviceProvisioning } = require('./device-provisioning.cjs')
function registerDeviceProvisioning({ ipcMain, dialog, getWindow, store, secrets, registry }) {
  const service = new DeviceProvisioning({ store, secrets, registry })
  const guard = event => {
    const window = getWindow()
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许访问设备配置。')
    if (registry.cloudCatalog()) throw new Error('请在本地直连模式使用设备配置。')
  }
  const choose = async title => {
    const result = await dialog.showOpenDialog(getWindow(), { title, properties: ['openFile'], filters: [{ name: 'Stable 配置', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    if (statSync(result.filePaths[0]).size > 128 * 1024) throw new Error('配置文件过大。')
    return readFileSync(result.filePaths[0], 'utf8')
  }
  const save = async (title, defaultPath, create) => {
    const result = await dialog.showSaveDialog(getWindow(), { title, defaultPath, filters: [{ name: 'Stable 配置', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, await create(), { encoding: 'utf8', mode: 0o600 })
    return { canceled: false }
  }
  let busy = false
  const handle = (name, callback) => ipcMain.handle(`stable:provisioning:${name}`, async (event, payload) => {
    guard(event)
    if (busy) throw new Error('请等待当前设备配置操作完成。')
    busy = true
    try { return await callback(payload || {}) } finally { busy = false }
  })
  handle('identity', () => service.identity())
  handle('request', () => save('导出本机申请（新申请会替换旧申请）', 'device.stable-request.json', () => service.request()))
  handle('issue', async payload => {
    const text = await choose('选择接收设备生成的申请')
    if (text === null) return { canceled: true }
    const request = service.validateRequest(text)
    const result = await dialog.showMessageBox(getWindow(), { type: 'question', title: '核对接收设备', message: '请与接收者核对设备指纹', detail: request.deviceFingerprint, buttons: ['取消', '指纹一致，生成配置包'], defaultId: 0, cancelId: 0 })
    if (result.response !== 1) return { canceled: true }
    return save('保存设备专属加密配置包', 'device.stable-config.json', () => service.issue(text, payload.modelId, payload.apiKey))
  })
  handle('import', async payload => {
    const text = await choose('导入本机专属加密配置包')
    if (text === null) return { canceled: true }
    return { canceled: false, ...await service.import(text, payload.issuerFingerprint) }
  })
}
module.exports = { registerDeviceProvisioning }
