'use strict'

function validateCompletedCount(count) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) throw new Error('无效的任务完成数量。')
  return count
}

// Fixed program with an integer-only argument, never model text or supplied JS.
function badgeScript(count) {
  validateCompletedCount(count)
  return `(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(32,32,31,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '600 ${count > 99 ? 24 : count > 9 ? 32 : 40}px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('${count > 99 ? '99+' : count}',32,33);
    return canvas.toDataURL('image/png');
  })()`
}

function createWindowPresence({ app, nativeImage, platform = process.platform, isInstalling = () => false }) {
  let quitting = false
  let window
  let count = 0
  let revision = 0
  const allowQuit = () => { quitting = true }
  app.on('before-quit', allowQuit)

  async function renderBadge() {
    const target = window
    const version = ++revision
    if (platform !== 'win32' || !target || target.isDestroyed()) return
    if (!count) { target.setOverlayIcon(null, ''); return }
    const value = count
    const png = await target.webContents.executeJavaScript(badgeScript(value))
    // A read/clear, newer completion or replaced window wins this race.
    if (version !== revision || target !== window || target.isDestroyed()) return
    target.setOverlayIcon(nativeImage.createFromDataURL(png), `${value} 个任务已完成，尚未查看`)
  }

  function attach(target) {
    window = target
    target.on('close', (event) => {
      if (quitting || isInstalling()) return
      event.preventDefault()
      target.minimize()
    })
    target.on('query-session-end', allowQuit)
    target.on('session-end', allowQuit)
    target.on('closed', () => { if (window === target) { window = undefined; revision++ } })
    const refresh = () => { void renderBadge().catch(() => {}) }
    target.on('taskbar-button-created', refresh)
    target.webContents.on('did-finish-load', refresh)
  }

  async function setCompletedCount(value) {
    count = validateCompletedCount(value)
    await renderBadge()
    return count
  }

  return { attach, allowQuit, setCompletedCount }
}

function registerCompletedCountIpc(ipcMain, getWindow, presence) {
  ipcMain.handle('stable:appearance:completedCount', (event, payload) => {
    const target = getWindow()
    if (!target || target.isDestroyed() || event.sender !== target.webContents || event.senderFrame !== target.webContents.mainFrame) {
      throw new Error('任务数量只能由主窗口更新。')
    }
    return presence.setCompletedCount(payload?.count)
  })
}

module.exports = { badgeScript, createWindowPresence, registerCompletedCountIpc, validateCompletedCount }
