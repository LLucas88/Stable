'use strict'
const path = require('node:path')
const asar = require('@electron/asar')

function verifyPackagedDependencies(archive) {
  const files = new Set(asar.listPackage(archive).map(file => file.replace(/\\/g, '/').replace(/^\//, '')))
  const read = file => JSON.parse(asar.extractFile(archive, file.split('/').join(path.sep)).toString('utf8'))
  const queue = ['package.json'], visited = new Set(), missing = []
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index]
    if (visited.has(file)) continue
    visited.add(file)
    const pkg = read(file)
    for (const dependency of Object.keys(pkg.dependencies || {})) {
      let directory = path.posix.dirname(file), found
      while (true) {
        const candidate = path.posix.join(directory, 'node_modules', dependency, 'package.json')
        if (files.has(candidate)) { found = candidate; break }
        if (directory === '.') break
        directory = path.posix.dirname(directory)
      }
      if (found) queue.push(found)
      else if (!Object.hasOwn(pkg.optionalDependencies || {}, dependency)) missing.push(`${pkg.name}: ${dependency}`)
    }
  }
  if (missing.length) throw new Error(`Packaged runtime dependencies missing (external fallback is forbidden):\n${missing.join('\n')}`)
  console.log(`PACKAGED_DEPENDENCIES_PASS ${visited.size} packages`)
  return visited.size
}
module.exports = { verifyPackagedDependencies }
if (require.main === module) verifyPackagedDependencies(path.resolve(process.argv[2]))

