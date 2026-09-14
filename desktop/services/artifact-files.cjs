'use strict'
const { resolveWorkspaceEntry } = require('./preview.cjs')
function existingArtifactFiles(paths, roots) {
  if (!Array.isArray(paths)) return []
  return [...new Set(paths.slice(0, 100))].filter(value => {
    if (typeof value !== 'string' || value.length > 4096) return false
    try { resolveWorkspaceEntry(value, roots, { fileOnly: true }); return true } catch { return false }
  })
}
module.exports = { existingArtifactFiles }
