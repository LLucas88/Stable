'use strict'
const fs=require('node:fs'),path=require('node:path')
const {DatabaseSync,backup}=require('node:sqlite')
const {StableStore}=require('../desktop/services/store.cjs')
const {CONFIG_FILE,inspectBundle,installBundle}=require('../desktop/services/tencenthub-skill-bundle.cjs')
async function install(args) {
  const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
  if(!option('--user-data'))throw Error('用法：node scripts/install-tencenthub-skills.cjs --user-data <Stable用户数据目录> [--source <已准备的包>]')
  const appPath=path.resolve(__dirname,'..'),userData=path.resolve(option('--user-data')),source=path.resolve(option('--source')||path.join(appPath,'.local/tencenthub/20260906'))
  inspectBundle(source)
  fs.mkdirSync(userData,{recursive:true})
  const databasePath=path.join(userData,'stable.db'),backupPath=path.join(appPath,'.local/skill-backups','stable-before-tencenthub-'+Date.now()+'.db')
  let backupCreated=false
  if(fs.existsSync(databasePath)){
    const db=new DatabaseSync(databasePath,{readOnly:true})
    try{
      const check=db.prepare('PRAGMA integrity_check').all()
      if(check.length!==1||check[0].integrity_check!=='ok')throw Error('现有数据库完整性检查未通过。')
      fs.mkdirSync(path.dirname(backupPath),{recursive:true});await backup(db,backupPath);backupCreated=true
    }finally{db.close()}
  }
  const store=new StableStore(userData)
  try{
    const result=installBundle(store,source)
    const config={version:1,bundlePath:path.relative(appPath,source),userData:path.relative(appPath,userData)}
    fs.writeFileSync(path.join(appPath,CONFIG_FILE),JSON.stringify(config,null,2)+'\n')
    const report={...result,userData,backupPath:backupCreated?backupPath:null,validation:'资源哈希、数据库登记及离线运行测试；不代表所有外部服务已连接'}
    fs.mkdirSync(path.join(appPath,'.local'),{recursive:true})
    fs.writeFileSync(path.join(appPath,'.local/tencenthub-installation.json'),JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify(report,null,2))
    return report
  }finally{store.close()}
}
module.exports={install}
if(require.main===module){
  const {spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=spawnSync(require('electron'),[path.join(__dirname,'tencenthub-installer-host.cjs'),...process.argv.slice(2)],{env,windowsHide:true,stdio:'inherit'})
  if(result.error)console.error(result.error.message)
  process.exitCode=result.status??1
}
