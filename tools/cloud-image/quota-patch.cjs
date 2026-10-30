'use strict'
// Apply the same narrowly scoped source patch in preparation and verification.
function patchImageRecovery(source) {
  const marker = 'export async function recoverStaleRequests('
  const start = source.indexOf(marker)
  if (start < 0) throw Error('Quota recovery anchor changed; review manually')
  const end = source.indexOf('\nfunction ', start)
  const before = source.slice(0, start), after = end < 0 ? '' : source.slice(end)
  let body = end < 0 ? source.slice(start) : source.slice(start, end)
  const guard = ' AND NOT EXISTS (SELECT 1 FROM gateway_image_jobs WHERE request_id = gateway_requests.id)'
  if (body.includes(guard)) return source
  for (const anchor of ["WHERE state = 'inflight' AND updated_at < ?", "WHERE id = ? AND state = 'inflight'"]) {
    if (!body.includes(anchor)) throw Error('Quota recovery predicate changed; review manually')
    body = body.replace(anchor, anchor + guard)
  }
  return before + body + after
}
module.exports = { patchImageRecovery }
