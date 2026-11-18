'use strict'

// Observe revisions when bytes change, before debounce/validation. A process
// launched later already loads those bytes; a delayed validation or IPC failure
// must not queue the same change again for the new process.
function createWatchChangeQueue() {
  let revision = 0, launchedThrough = 0, pending = null
  const merge = request => {
    if (request.id <= launchedThrough) return false
    pending = { id: Math.max(request.id, pending?.id || 0), action: request.action === 'restart' || pending?.action === 'restart' ? 'restart' : 'reload' }
    return true
  }
  return {
    observe() { return ++revision },
    enqueue(action, observedRevision = ++revision) {
      if (observedRevision <= launchedThrough) return false
      // Validation may finish after a renderer build published a newer id.
      // Give the notification a fresh id so the backend change cannot be
      // discarded by the child as a replay of that renderer notification.
      return merge({ id: ++revision, action })
    },
    restore(request) { return merge(request) },
    take() { const request = pending; pending = null; return request },
    beginLaunch() { launchedThrough = revision; pending = null; return launchedThrough },
    state() { return { revision, launchedThrough, pending: pending ? { ...pending } : null } },
  }
}
module.exports = { createWatchChangeQueue }
