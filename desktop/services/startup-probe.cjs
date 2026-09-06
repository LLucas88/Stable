'use strict'
const fs = require('node:fs')
function installStartupProbe(electron, getStore) {
  const { app, BrowserWindow, dialog } = electron
  const file = process.env.STABLE_STARTUP_PROBE
  let finished = false
  function report(result) {
    if (finished) return
    finished = true
    fs.writeFileSync(file, JSON.stringify({ ...result, appPath: app.getAppPath(), userData: app.getPath('userData'), versions: { node: process.versions.node, sqlite: process.versions.sqlite, electron: process.versions.electron } }, null, 2))
    console.log('STABLE_STARTUP_PROBE ' + JSON.stringify(result))
  }
  for (const method of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[method] = function () {}
  dialog.showErrorBox = (title, message) => report({ status: 'failed', title, message })
  app.whenReady().then(() => setTimeout(async () => {
    try {
      const store = getStore(), window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
      const renderer = window ? await window.webContents.executeJavaScript("Boolean(document.getElementById('root')?.children.length)") : false
      report({ status: store && renderer ? 'ready' : 'failed', renderer, conversations: store?.listConversations().length, messages: store?.db.prepare('SELECT count(*) n FROM messages').get().n, skills: store?.listSkills().length, enabledSkills: store?.listSkills().filter(s => s.enabled).length, journalMode: store?.db.prepare('PRAGMA journal_mode').get().journal_mode, integrity: store?.db.prepare('PRAGMA integrity_check').all() })
    } catch (error) { report({ status: 'failed', message: error.message }) }
    app.quit()
  }, 5000))
}
module.exports = { installStartupProbe }
