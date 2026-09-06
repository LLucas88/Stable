'use strict'
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path')
const { StableStore } = require('../../desktop/services/store.cjs')
const { prepareLocalHistoryRecovery, finishLocalHistoryRecovery } = require('../../desktop/services/local-history-recovery.cjs')
const root = path.resolve(process.argv[2])
app.setPath('userData', process.argv[3] || path.join(root, 'current'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const manifestName = fs.existsSync(path.join(root, '.stable-history-recovery.json')) ? '.stable-history-recovery.json' : '.stable-history-recovery.applied.json'
  const targetId = JSON.parse(fs.readFileSync(path.join(root, manifestName), 'utf8')).preferredConversationId
  const source = new (require('node:sqlite').DatabaseSync)(path.join(root, '.stable-history-recovery.db'), { readOnly: true })
  const expectedMessages = source.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?').get(targetId).n
  source.close()
  const recovery = await prepareLocalHistoryRecovery({ appPath: root, userData: app.getPath('userData'), isPackaged: false })
  const store = new StableStore(app.getPath('userData'))
  try {
    const report = finishLocalHistoryRecovery(recovery, store)
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    const crm = store.listConversations().find(row => row.id === targetId)
    const result = { actualConversations: store.listConversations().length, targetMessages: crm ? store.listMessages(crm.id).length : 0, activeConversation: store.activeConversationId(), integrity: store.db.prepare('PRAGMA integrity_check').get().integrity_check, windowCreated: !window.isDestroyed(), recoveryApplied: Boolean(report) }
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    window.destroy()
    if (result.targetMessages !== expectedMessages || result.integrity !== 'ok') throw new Error('Verification failed')
  } finally { store.close() }
  app.exit(0)
}).catch(() => { console.error('HISTORY_CLIENT_VERIFICATION_FAILED'); app.exit(1) })