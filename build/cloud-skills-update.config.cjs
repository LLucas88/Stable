'use strict'
// The cloud resource policy also applies to the lightweight update artifact.
const update = require('./update-builder.config.cjs')
const cloud = require('./cloud-skills.config.cjs')
const pkg = require('../package.json')
module.exports = {
  ...update,
  files: cloud.files,
  extraMetadata: { ...update.extraMetadata, ...cloud.extraMetadata },
  afterPack: cloud.afterPack,
  directories: { ...update.directories, output: `release-${pkg.version}-cloud-skills-update` },
}
