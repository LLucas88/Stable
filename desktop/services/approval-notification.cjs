'use strict'

// One in-memory notification per live approval. Never interprets close as consent.
function approvalNotification({ Notification, window, title, summary, persistent, pending, decide, open }) {
  const decisions = persistent ? ['once', 'conversation', 'deny'] : ['once', 'deny']
  const labels = { once: '允许一次', conversation: '本次对话允许', deny: '拒绝' }
  let notice, disposed = false, shown = false
  const show = () => {
    if (disposed || shown || !pending() || window.isDestroyed() || (!window.isMinimized() && window.isVisible())) return
    if (!Notification.isSupported()) return
    try {
      notice = new Notification({ title: `Stable · ${title}`, body: summary, timeoutType: 'never', actions: decisions.map(decision => ({ type: 'button', text: labels[decision] })) })
      notice.on('action', (event, legacyIndex) => {
        const index = event?.actionIndex ?? legacyIndex
        if (disposed || !Number.isInteger(index) || !decisions[index] || !pending()) return
        try { if (decide(decisions[index])) dispose() } catch { open() }
      })
      notice.on('click', () => { if (!disposed && pending()) open() })
      notice.on('failed', () => {})
      notice.show(); shown = true
    } catch {} // The existing in-app approval remains available.
  }
  function dispose() {
    if (disposed) return
    disposed = true
    window.removeListener('minimize', show); window.removeListener('hide', show)
    try { notice?.close() } catch {}
  }
  window.on('minimize', show); window.on('hide', show)
  show()
  return dispose
}
module.exports = { approvalNotification }
