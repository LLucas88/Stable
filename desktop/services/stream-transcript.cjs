'use strict'

// Only visible assistant text is collected; private reasoning chunks never enter this stream.
function createStreamTranscript() {
  let current
  function flush() {
    const item = current
    current = undefined
    return item && item.content ? { ...item, status: 'completed' } : undefined
  }
  return {
    append(event) {
      const previous = current && current.id !== event.id ? flush() : undefined
      if (!current) current = {
        id: event.id, kind: 'reasoning', eventType: 'agent/answer', title: '过程输出',
        status: 'running', time: event.time, content: '',
      }
      current.content += String(event.delta || '')
      return previous
    },
    flush,
  }
}

module.exports = { createStreamTranscript }
