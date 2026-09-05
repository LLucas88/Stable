'use strict'
// Opt-in local acceptance driver: boots the real app, model and IPC unchanged.
// No mock provider, login automation, credential copying, or automatic approvals.
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'qa-artifacts/crm-acceptance-20260905/live')
fs.mkdirSync(output, { recursive: true })
app.setAppPath(root)
app.setName('stable-desktop')
app.setPath('userData', path.join(app.getPath('appData'), 'stable-desktop'))
let main, busy = false
const actions = {
  create: ['agent', 'create'], state: ['agent', 'state'], select: ['agent', 'select'],
  rename: ['agent', 'rename'], run: ['agent', 'run'], permission: ['agent', 'configurePermission'],
  binding: ['extensions', 'wendingBinding'], prepare: ['extensions', 'prepareWending'],
  answerApproval: ['agent', 'answerApproval'], cancel: ['agent', 'cancel'],
}
function save(id, value) {
  fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(value, null, 2), 'utf8')
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-finish-load', async () => {
    if (!window.webContents.getURL().startsWith('file:') || main) return
    try {
      const ready = await window.webContents.executeJavaScript('Boolean(window.stable?.agent?.run)')
      if (!ready) return
      main = window
      save('ready', { pid: process.pid, ready: true, realApp: true, time: new Date().toISOString() })
    } catch { /* Ignore auxiliary windows. */ }
  })
})
const timer = setInterval(async () => {
  if (!main || main.isDestroyed() || busy) return
  const request = path.join(output, 'request.json')
  if (!fs.existsSync(request)) return
  busy = true
  try {
    const command = JSON.parse(fs.readFileSync(request, 'utf8'))
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(command.id)) throw Error('Invalid request id')
    fs.unlinkSync(request)
    if (command.op === 'list') {
      const result = await main.webContents.executeJavaScript(`window.stable.bootstrap().then(s => ({conversations:s.conversations,activeConversationId:s.activeConversationId,models:s.models,runtimeReady:s.runtimeReady}))`)
      save(command.id, { status: 'completed', result })
    } else if (command.op === 'capture') {
      const loginVisible = await main.webContents.executeJavaScript('Boolean(document.querySelector("input[type=tel],input[autocomplete=one-time-code]"))')
      if (loginVisible) throw Error('Close login form before capturing the conversation')
      fs.writeFileSync(path.join(output, `${command.id}.png`), (await main.webContents.capturePage()).toPNG())
      save(command.id, { status: 'completed' })
    } else {
      const route = actions[command.op]
      if (!route || !Array.isArray(command.args)) throw Error('Unsupported acceptance action')
      const expression = `window.stable[${JSON.stringify(route[0])}][${JSON.stringify(route[1])}](...${JSON.stringify(command.args)})`
      save(command.id, { status: 'running', time: new Date().toISOString() })
      // Runs can wait for the user's approval. Keep other read-only requests responsive.
      main.webContents.executeJavaScript(expression).then(
        result => save(command.id, { status: 'completed', result }),
        error => save(command.id, { status: 'failed', error: error.message }),
      )
    }
  } catch (error) { save('driver-error', { message: error.message }) }
  finally { busy = false }
}, 500)
app.on('will-quit', () => clearInterval(timer))
require('../desktop/main.cjs')
