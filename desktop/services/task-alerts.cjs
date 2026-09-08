'use strict'
const dismiss = close => { try { close() } catch {} }

// Main-process clock: keeps working while the renderer is hidden/throttled.
class TaskAlerts {
  constructor({ notify, now = Date.now, threshold = 180000 }) {
    this.notify = notify; this.now = now; this.threshold = threshold; this.tasks = new Map()
  }
  start(id) { this.finish(id); this.tasks.set(id, { last: this.now(), waiting: new Set(), stalled: false, notices: new Map() }) }
  progress(id) {
    const task = this.tasks.get(id)
    if (!task) return
    task.last = this.now()
    if (task.stalled) { const close = task.notices.get('stalled'); if (close) dismiss(close); task.notices.delete('stalled') }
    task.stalled = false
  }
  wait(id, key, kind = 'approval') {
    const task = this.tasks.get(id)
    if (!task || task.waiting.has(key)) return
    task.waiting.add(key)
    this.emit(id, task, kind, key)
  }
  resolve(id, key) {
    const task = this.tasks.get(id)
    if (!task) return
    task.waiting.delete(key)
    const close = task.notices.get(key)
    if (close) dismiss(close)
    task.notices.delete(key)
    this.progress(id)
  }
  emit(id, task, kind, key) {
    try {
      const close = key === undefined ? this.notify(id, kind) : this.notify(id, kind, key)
      if (typeof close === 'function') task.notices.set(key ?? 'stalled', close)
    } catch {} // A notification failure must never interrupt execution.
  }
  tick() {
    for (const [id, task] of this.tasks) {
      if (!task.waiting.size && !task.stalled && this.now() - task.last >= this.threshold) {
        task.stalled = true; this.emit(id, task, 'stalled')
      }
    }
  }
  finish(id) { const task = this.tasks.get(id); this.tasks.delete(id); task?.notices.forEach(dismiss) }
}

module.exports = { TaskAlerts }
