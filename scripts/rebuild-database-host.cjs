'use strict'
const { app } = require('electron'), path = require('node:path')
const profile = process.argv[2]
if (!profile) { console.error('Usage: electron scripts/rebuild-database-host.cjs <userData>'); app.exit(1) }
else {
  app.setName(require('../package.json').name); app.setPath('userData', path.resolve(profile))
  if (!app.requestSingleInstanceLock({ stableMaintenance: true })) { console.error('Stable 正在运行，未修改数据库。'); app.exit(2) }
  else app.whenReady().then(() => {
    const result = require('../desktop/services/database-rebuild.cjs').rebuildHealthyDatabase(app.getPath('userData'))
    console.log(JSON.stringify(result, null, 2)); app.releaseSingleInstanceLock(); app.exit(0)
  }).catch(error => { console.error(error.stack); app.releaseSingleInstanceLock(); app.exit(1) })
}
