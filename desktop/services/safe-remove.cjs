'use strict'

const { lstatSync, readdirSync, rmSync, rmdirSync, unlinkSync } = require('node:fs')
const path = require('node:path')

// Electron's recursive rm can follow Windows junctions. Inspect every entry
// with lstat and unlink links before traversing directories.
function removeWithoutFollowingLinks(target) {
  let stats
  try { stats = lstatSync(target) }
  catch (error) { if (error?.code === 'ENOENT') return; throw error }
  if (stats.isSymbolicLink()) { unlinkSync(target); return }
  if (!stats.isDirectory()) { rmSync(target, { force: true }); return }
  for (const name of readdirSync(target)) removeWithoutFollowingLinks(path.join(target, name))
  rmdirSync(target)
}

module.exports = { removeWithoutFollowingLinks }
