'use strict'

const { readdirSync } = require('node:fs')
const path = require('node:path')
const { removeWithoutFollowingLinks } = require('./safe-remove.cjs')

function staleInstallPaths(execPath) {
  const installDir = path.resolve(path.dirname(execPath))
  const parent = path.dirname(installDir)
  const prefix = `${path.basename(installDir)}.__stable_`
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && /^(?:previous|failed|next)_[0-9A-Za-z.-]+$/.test(entry.name.slice(prefix.length)))
    .map((entry) => path.join(parent, entry.name))
    .filter((candidate) => path.dirname(candidate) === parent && candidate !== installDir)
}

function cleanupStaleInstalls(execPath) {
  const removed = []
  for (const candidate of staleInstallPaths(execPath)) {
    try {
      removeWithoutFollowingLinks(candidate)
      removed.push(candidate)
    } catch { /* antivirus or a previous process may still hold the rollback directory */ }
  }
  return removed
}

module.exports = { cleanupStaleInstalls, staleInstallPaths }
