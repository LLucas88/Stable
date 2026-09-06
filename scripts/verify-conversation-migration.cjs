 'use strict'
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite')
const {StableStore}=require('../desktop/services/store.cjs')
function fingerprints(db,columns){const result={};for(const [table,names] of Object.entries(columns)){const hash=createHash('sha256');let count=0;for(const row of db.prepare(`SELECT ${names.map(n=>'"'+n+'"').join(',')} FROM ${table} ORDER BY id`).iterate()){hash.update(JSON.stringify(row));count++}result[table]={count,digest:hash.digest('hex')}}return result}
function verifyMigration(sourceRoot,outputRoot){
 const source=fs.realpathSync(sourceRoot),output=path.resolve(outputRoot),relative=path.relative(source,output)
 if(!relative||!relative.startsWith('..')&&!path.isAbsolute(relative))throw Error('演练输出必须位于原数据目录之外。')
 if(fs.existsSync(output))throw Error('演练输出目录必须是新目录，避免覆盖数据。')
 const db=new DatabaseSync(path.join(source,'stable.db'),{readOnly:true});let copy
 try{
  const columns=Object.fromEntries(['conversations','messages'].map(table=>[table,db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).filter(name=>name!=='seq')]))
  const before=fingerprints(db,columns);fs.mkdirSync(output,{recursive:true});db.exec(`VACUUM INTO '${path.join(output,'stable.db').replace(/'/g,"''")}'`)
  let mappings=0;const sessions=path.join(source,'codex','sessions')
  if(fs.existsSync(sessions))for(const entry of fs.readdirSync(sessions,{withFileTypes:true})){if(!entry.isDirectory()||entry.isSymbolicLink())continue;const pointer=path.join(sessions,entry.name,'stable-thread.json');if(!fs.existsSync(pointer)||fs.lstatSync(pointer).isSymbolicLink())continue;const target=path.join(output,'codex','sessions',entry.name);fs.mkdirSync(target,{recursive:true});fs.copyFileSync(pointer,path.join(target,'stable-thread.json'),fs.constants.COPYFILE_EXCL);mappings++}
  copy=new StableStore(output);const after=fingerprints(copy.db,columns),sourceAfter=fingerprints(db,columns)
  const report={sourceUntouched:JSON.stringify(before)===JSON.stringify(sourceAfter),recordsPreserved:JSON.stringify(before)===JSON.stringify(after),before,after,mappingCount:mappings,integrity:copy.db.prepare('PRAGMA integrity_check').get().integrity_check}
  fs.writeFileSync(path.join(output,'migration-report.json'),JSON.stringify(report,null,2));if(!report.sourceUntouched||!report.recordsPreserved||report.integrity!=='ok')throw Error('迁移演练一致性核验失败，原数据未替换。');return report
 }finally{copy?.close();db.close()}
}
if(require.main===module){const [source,output]=process.argv.slice(2);if(!source||!output){console.error('用法：node scripts/verify-conversation-migration.cjs <数据目录> <全新演练目录>');process.exitCode=1}else try{console.log(JSON.stringify(verifyMigration(source,output),null,2))}catch(error){console.error(error.message);process.exitCode=1}}
module.exports={verifyMigration}
