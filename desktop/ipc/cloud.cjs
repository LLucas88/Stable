'use strict'

function registerCloudIpc({ ipcMain, getCloudStartup, cloudAccount, bootstrap, requireText }) {
  ipcMain.handle('stable:cloud:startup', async () => { await getCloudStartup(); return bootstrap() })
  ipcMain.handle('stable:cloud:login', async (_event, payload) => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    await cloudAccount.login(requireText(payload?.username, '账号', 64), requireText(payload?.password, '密码', 128))
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:changePassword', async (_event, payload) => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    const currentPassword = requireText(payload?.currentPassword, '当前密码', 128)
    const newPassword = requireText(payload?.newPassword, '新密码', 128)
    if (newPassword.length < 12) throw new Error('新密码至少需要 12 个字符。')
    if (newPassword !== String(payload?.confirmPassword || '')) throw new Error('两次输入的新密码不一致。')
    await cloudAccount.changePassword(currentPassword, newPassword)
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:refresh', async () => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    // Reconnecting must also transition expired sessions back to sign-in.
    await cloudAccount.restore()
    return bootstrap()
  })
  ipcMain.handle('stable:cloud:logout', async () => {
    if (!cloudAccount) throw new Error('当前开发模式未启用 Stable Cloud。')
    await cloudAccount.logout()
    return bootstrap()
  })
}

module.exports = { registerCloudIpc }
