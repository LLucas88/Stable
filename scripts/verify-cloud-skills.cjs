'use strict'
const fs = require('node:fs'), path = require('node:path')
const { extractPackage, verifyDirectory } = require('../desktop/services/skill-package.cjs')
async function main() {
  const root = path.resolve(process.argv[2] || '.local/cloud-skills'), catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'))
  const tempBase = path.resolve('.local/cloud-skills-verification'); fs.mkdirSync(tempBase, { recursive: true })
  const temp = fs.mkdtempSync(path.join(tempBase, 'verify-'))
  try {
    let files = 0
    for (const pkg of Object.values(catalog.packages)) {
      const target = await extractPackage(fs.readFileSync(path.join(root, 'packages', pkg.sha256 + '.zip')), temp, pkg)
      if (!verifyDirectory(target, pkg)) throw Error('Extracted package integrity mismatch')
      files += Object.keys(pkg.files).length
    }
    console.log(JSON.stringify({ verifiedPackages: Object.keys(catalog.packages).length, verifiedFiles: files, items: catalog.items.length }))
  } finally {
    if (path.dirname(path.resolve(temp)) !== tempBase) throw Error('Unexpected verification path')
    fs.rmSync(temp, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
