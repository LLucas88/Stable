'use strict'
// One queue per receipt directory (conversation), shared by recreated runners.
const queues = new Map()
function createQueue() {
  let active = 0, limit = 2
  const waiting = []
  const drain = () => {
    while (active < limit && waiting.length) {
      const item = waiting.shift()
      item.signal?.removeEventListener('abort', item.abort)
      if (item.signal?.aborted) { item.reject(item.signal.reason); continue }
      active++
      let released = false
      item.resolve(() => { if (!released) { released = true; active--; drain() } })
    }
  }
  return {
    serial() { limit = 1 },
    acquire(signal) {
      return new Promise((resolve, reject) => {
        signal?.throwIfAborted()
        const item = { resolve, reject, signal, abort: () => { const index = waiting.indexOf(item); if (index >= 0) waiting.splice(index, 1); reject(signal.reason) } }
        signal?.addEventListener('abort', item.abort, { once: true })
        waiting.push(item); drain()
      })
    },
  }
}
function imageQueue(directory) {
  if (!directory) return createQueue()
  if (!queues.has(directory)) queues.set(directory, createQueue())
  return queues.get(directory)
}
module.exports = { imageQueue }
