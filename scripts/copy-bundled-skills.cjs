'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { inspectBundle } = require('../desktop/services/filtered-skill-bundle.cjs')

// electron-builder filters metadata even in extraResources. The locked bundle
// must retain every manifest entry, including .gitkeep and dependency metadata.
module.exports = async function copyBundledSkills(context) {
  const source = path.join(context.packager.projectDir, 'desktop/skills/filtered/bundle')
  const target = path.join(context.appOutDir, 'resources/filtered-skills')
  inspectBundle(source)
  fs.cpSync(source, target, { recursive: true })
  const result = inspectBundle(target)
  console.log(`Packaged skills verified: ${result.skills.length} skills, ${result.checkedFiles} files`)
}
