'use strict'
// Opt-in release configuration. Use only after production download and migration acceptance.
const pkg = require('../package.json')
module.exports = {
  ...pkg.build,
  files: [...pkg.build.files, '!desktop/plugins/*.zip'],
  extraMetadata: { ...pkg.build.extraMetadata, stableSkillDelivery: 'cloud' },
  afterPack: async context => {
    // Deliberately retain dependency verification while omitting the bundled-skill copy.
    require('../scripts/verify-packaged-dependencies.cjs').verifyPackagedDependencies(require('node:path').join(context.appOutDir, 'resources/app.asar'))
    const fs = require('node:fs'), path = require('node:path')
    if (fs.existsSync(path.join(context.appOutDir, 'resources/filtered-skills'))) throw Error('Cloud skill build contains stale bundled resources. Use a clean output directory.')
  },
  directories: { ...pkg.build.directories, output: `release-${pkg.version}-cloud-skills` },
}
