'use strict'
const path = require('node:path')
const { createHash } = require('node:crypto')

function executionWorkspace({ cwd, roots = [], fallback, key, platform = process.platform }) {
  const requested = path.resolve(cwd || fallback)
  const original = [...new Set([requested, ...roots.map(root => path.resolve(root))])]
  const isVolume = value => platform === 'win32' && path.parse(value).root === value
  if (!original.some(isVolume)) return { workspace: requested, writableRoots: original, readableRoots: original }
  const workspace = isVolume(requested)
    ? path.join(fallback, 'projects', createHash('sha256').update(String(key || requested)).digest('hex').slice(0, 24))
    : requested
  return { workspace, writableRoots: [...new Set([workspace, ...original.filter(root => !isVolume(root))])], readableRoots: [...new Set([workspace, ...original])] }
}
module.exports = { executionWorkspace }
