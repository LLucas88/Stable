'use strict'
const { app } = require('electron')
const path = require('node:path')
const args = process.argv.slice(2)
const index = args.indexOf('--user-data')
if (index < 0 || !args[index + 1]) { console.error('缺少 --user-data。'); app.exit(1) }
else {
  app.setName(require('../package.json').name)
  app.setPath('userData', path.resolve(args[index + 1]))
  if (!app.requestSingleInstanceLock({ stableMaintenance: true })) {
    console.error('Stable 正在使用此数据目录。请先退出该客户端，再运行技能安装；数据库未修改。')
    app.exit(2)
  } else {
    app.whenReady().then(() => require('./install-ops-skills.cjs').install(args))
      .then(() => { app.releaseSingleInstanceLock(); app.exit(0) })
      .catch(error => { console.error(error.stack); app.releaseSingleInstanceLock(); app.exit(1) })
  }
}
