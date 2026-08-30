'use strict'

const pkg = require('../package.json')

module.exports = {
  ...pkg.build,
  directories: { ...pkg.build.directories, output: `release-${pkg.version}-update` },
  extraResources: (pkg.build.extraResources || []).filter((item) => item?.to !== 'runtime'),
  nsis: {
    ...pkg.build.nsis,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    runAfterFinish: false,
  },
  win: {
    ...pkg.build.win,
    artifactName: 'Stable-Update-${version}-x64.${ext}',
  },
}
