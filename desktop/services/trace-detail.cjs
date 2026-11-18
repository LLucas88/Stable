'use strict'

// Keep both the command/context and the final exception. Browser snapshots and
// process logs often put the actionable failure after a large successful result.
function boundedDetail(value, limit = 8000) {
  const text = String(value ?? '')
  if (text.length <= limit) return text
  const marker = '\n…（中间输出已省略，保留开头与末尾）…\n'
  const head = Math.min(2000, Math.floor((limit - marker.length) / 4))
  return text.slice(0, head) + marker + text.slice(-(limit - marker.length - head))
}
module.exports = { boundedDetail }
