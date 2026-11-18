'use strict'

// Only structured tool envelopes have failure semantics. Never parse returned
// text: it may be a source file, an example response, or a historical error log.
function toolResultFailed(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.isError === true || value.ok === false || value.success === false || value.succeed === false) return true
  if (value.ok === true || value.success === true || value.succeed === true) return false
  return typeof value.error === 'string' ? Boolean(value.error.trim()) : Boolean(value.error && typeof value.error === 'object' && Object.keys(value.error).length)
}

function repeatError(message) { return Object.assign(new Error(message), { code: 'STABLE_REPEAT_BLOCKED' }) }
function toolCallSignature(name, input) {
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value
  return require('node:crypto').createHash('sha256').update(JSON.stringify([name, sort(input)])).digest('hex')
}
module.exports = { toolResultFailed, repeatError, toolCallSignature }
