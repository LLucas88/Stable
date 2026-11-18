'use strict'

// User intent is explicit. Runtime/provider failures must not become cancellation
// just because their cleanup also aborts the SDK or their text mentions a stop.
function cancelledError(message = '任务已停止。') {
  return Object.assign(new Error(message), { code: 'STABLE_RUN_CANCELLED' })
}
function isCancelled(error, control) {
  return control?.cancelled === true || error?.code === 'STABLE_RUN_CANCELLED'
}
module.exports = { cancelledError, isCancelled }
