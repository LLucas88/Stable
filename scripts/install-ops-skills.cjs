'use strict'
const fs = require('node:fs'), path = require('node:path')
const { DatabaseSync, backup } = require('node:sqlite')
const { StableStore } = require('../desktop/services/store.cjs')
const { CONFIG_FILE, inspectBundle, installBundle } = require('../desktop/services/ops-skill-bundle.cjs')
async function install(args) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  if (!option('--source') || !option('--user-data')) throw Error('用法：node scripts/install-ops-skills.cjs --source <合并包目录> --user-data <Stable用户数据目录>')
  const appPath = path.resolve(__dirname, '..'), source = path.resolve(option('--source')), userData = path.resolve(option('--user-data'))
  const bundlePath = path.join(appPath, '.local', 'ops-skills', '20260906')
  const sourceBundle = inspectBundle(source)
  if (fs.existsSync(bundlePath)) {
    const installed = inspectBundle(bundlePath)
    if (JSON.stringify(installed.manifest) !== JSON.stringify(sourceBundle.manifest)) throw Error('已安装目录与输入版本不同；请保留旧目录并显式迁移。')
  } else {
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true })
    fs.cpSync(source, bundlePath, { recursive: true, errorOnExist: true, force: false })
  }
  const backupPath = path.join(appPath, '.local', 'skill-backups', 'stable-before-ops-' + Date.now() + '.db')
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  const databasePath = path.join(userData, 'stable.db')
  if (fs.existsSync(databasePath)) {
    const existing = new DatabaseSync(databasePath, { readOnly: true })
    try {
      const check = existing.prepare('PRAGMA integrity_check').all()
      if (check.length !== 1 || check[0].integrity_check !== 'ok') throw Error('当前数据库校验失败，已停止安装；请先修复历史数据。')
      await backup(existing, backupPath)
    } finally { existing.close() }
  }
  const store = new StableStore(userData)
  try {
    const result = installBundle(store, bundlePath, { applyPolicy: !args.includes('--preserve-preferences') })
    fs.writeFileSync(path.join(appPath, CONFIG_FILE), JSON.stringify({ version: 1, bundlePath: path.relative(appPath, bundlePath), policy: 'all-compatible-except-feishu' }, null, 2))
    fs.writeFileSync(path.join(appPath, '.local', 'ops-skill-installation.json'), JSON.stringify({ ...result, userData, backupPath, verified: 'source-hashes-and-database-registration', businessRuntimeTested: false }, null, 2))
    const rows = result.skills.map(s => ['|', s.category, '|', s.name, '|', s.uid, '|', s.enabled ? '启用' : '停用', '|', s.reason.replaceAll('|', '／'), '|'].join(' '))
    fs.writeFileSync(path.join(appPath, '.local', '运营技能安装清单.md'), '# Stable 运营技能安装清单\n\n主技能 ' + result.registered + ' 个版本；启用 ' + result.enabled + '，停用 ' + result.disabled + '。另有 3 个辅助技能随原包保留，仅作为参考依赖。\n\n“启用”表示已登记为可检索的方法流程，不代表所有代码示例、账号连接或外部服务均已验证。\n\n| 分类 | 技能 | 来源编号 | 状态 | 原因 / 范围 |\n|---|---|---|---|---|\n' + rows.join('\n') + '\n')
    console.log(JSON.stringify({ registered: result.registered, enabled: result.enabled, disabled: result.disabled, excludedFeishu: result.excludedFeishu, excludedUnavailable: result.excludedUnavailable, dependencyPending: result.skills.filter(s => s.status === 'dependency-pending').length, checkedFiles: result.checkedFiles, userData, bundlePath, backupPath }, null, 2))
  } finally { store.close() }
}
module.exports = { install }
if (require.main === module) {
  const { spawnSync } = require('node:child_process')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [path.join(__dirname, 'ops-skill-installer-host.cjs'), ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  process.exitCode = result.status ?? 1
}
