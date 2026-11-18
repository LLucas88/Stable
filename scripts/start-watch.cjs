'use strict'
const {spawn}=require('node:child_process')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'..')
const {sendIpc}=require('../desktop/services/dev-ipc.cjs')
const {createFingerprints}=require('./source-fingerprints.cjs')
const {createWatchChangeQueue}=require('./watch-change-queue.cjs')
const {validateWatchSources}=require('./validate-watch-source.cjs')
const logDir=path.join(root,'qa-artifacts','watch-logs')
fs.mkdirSync(logDir,{recursive:true})
const logFile=path.join(logDir,`${Date.now()}-${process.pid}.jsonl`)
function record(event,data={}){try{fs.appendFileSync(logFile,JSON.stringify({time:new Date().toISOString(),event,...data})+'\n')}catch{}}
const profileArgument=process.argv.find(a=>a.startsWith('--stable-user-data='))
const profile=profileArgument?path.resolve(profileArgument.slice(19)):path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'stable-desktop')
let child,buildWatcher,sourceWatcher,debounce,stopping=false,restarting=false,lastMessage='',built=false,ready=false,buildFailed=false,building=false,sourceRevision=0,validatedSourceRevision=0,sourceError='',backendDirty=false
const changes=createWatchChangeQueue()
const changed=new Set()
function flushChanges(){
  // Keep forwarding newer revisions during the handshake. The child must be
  // able to invalidate a click made before the latest edit, rather than quit
  // and queue a redundant restart for the replacement process.
  if(child?.connected&&ready){const request=changes.take();if(!request)return;const message=sourceError||(sourceRevision>validatedSourceRevision?'源码正在检查，暂不应用变更。':buildFailed?'界面构建失败，请修复后再应用变更。':building?'界面正在构建，暂不应用变更。':'');record('change-request',{...request,blocked:Boolean(message)});void sendIpc(child,{type:'stable:dev:change',...request,blocked:Boolean(message),message}).then(ok=>{if(!ok){changes.restore(request);record('ipc-send-failed',request);console.error('[watch] 通信暂时中断，未强制退出应用。')}})}
}
function request(action,id){
  changes.enqueue(action,id);flushChanges()
}
function launch(){
  if(sourceRevision>validatedSourceRevision||building||buildFailed){restarting=true;record('launch-waiting-for-validation');return}
  const env={...process.env,STABLE_DEV_WATCH:'1',STABLE_CLOUD_ENABLED:process.env.STABLE_CLOUD_ENABLED||'1'}
  for(const name of ['ELECTRON_RUN_AS_NODE','STABLE_QA_USER_DATA','STABLE_QA_CAPTURE','STABLE_QA_PAGE'])delete env[name]
  restarting=false;ready=false
  const launchRevision=changes.beginLaunch()
  backendDirty=false
  child=spawn(require('electron'),['.',`--stable-user-data=${profile}`],{cwd:root,env,stdio:['inherit','inherit','inherit','ipc'],windowsHide:true,detached:true})
  record('launch',{pid:child.pid,revision:launchRevision})
  let pendingRestartId
  child.on('message',message=>{
    if(message?.type==='stable:dev:restart-request'){
      if(message.id!==changes.state().revision||sourceRevision>validatedSourceRevision||building||buildFailed){record('restart-not-ready',{id:message.id});console.log('[watch] 代码或构建仍有变更，保留当前应用；检查完成后请再次点击重启应用。');return}
      pendingRestartId=message.id;restarting=true;record('restart-confirmed',{id:message.id})
      void sendIpc(child,{type:'stable:dev:restart-confirmed',id:message.id}).then(ok=>{if(!ok&&pendingRestartId===message.id){restarting=false;record('restart-confirmation-failed')}})
    }
    if(message?.type==='stable:dev:ready'){ready=true;console.log('[watch] 测试应用就绪。');flushChanges()}
    if(message?.type==='stable:dev:applying'&&message.action==='restart')restarting=true
    if(message?.type==='stable:dev:waiting'){
      if(pendingRestartId===message.id){pendingRestartId=undefined;restarting=false;flushChanges()}
      if(message.message!==lastMessage){lastMessage=message.message;record('waiting',{message:lastMessage});console.log('[watch] 等待安全更新：'+lastMessage)}
    }
    if(message?.type==='stable:dev:applied'){lastMessage='';console.log('[watch] '+(message.action==='restart'?'正在应用已确认的变更并重启…':'界面已刷新。'))}
  })
  child.on('error',error=>{record('child-error',{code:error.code,message:error.message});console.error('[watch] '+error.message);if(!['EPIPE','ERR_IPC_CHANNEL_CLOSED'].includes(error.code))void stop()})
  child.on('exit',(code,signal)=>{record('exit',{code,signal,restarting});child=null;ready=false;if(restarting&&!stopping)launch();else{console.log(`[watch] 应用已退出（code=${code}, signal=${signal||'无'}）。诊断日志：${logFile}`);void stop()}})
}
async function stop(){
  if(stopping)return
  stopping=true;clearTimeout(debounce);sourceWatcher?.close();await buildWatcher?.close()
  record('watch-stopped')
  // Do not force-kill an application that may own an active task or the database.
  if(child?.connected)child.disconnect()
  child?.unref();process.exitCode=0
}
async function main(){
  process.chdir(root)
  console.log('[watch] 本地数据库目录：'+profile)
  console.log('[watch] 诊断日志：'+logFile)
  console.log('[watch] 正在构建。界面改动自动刷新；主进程改动请在应用内点击重启应用。保持此终端打开。')
  const fingerprints=createFingerprints(path.join(root,'desktop'))
  sourceWatcher=fs.watch(path.join(root,'desktop'),{recursive:true},(_event,file)=>{
    if(!file||! /\.(cjs|js|json|ps1|md|html|css|txt)$/i.test(file))return
    const absolute=path.join(root,'desktop',file)
    try{if(!fingerprints.changed(absolute))return}catch(error){record('watch-read-failed',{file,code:error.code});return}
    sourceRevision=changes.observe();backendDirty=true;sourceError='';record('source-changed',{file,revision:sourceRevision});changed.add(absolute);clearTimeout(debounce)
    // Raw writes revoke the previous click before debounce and syntax checking.
    request('restart',sourceRevision)
    debounce=setTimeout(()=>{
      debounce=null
      const validation=validateWatchSources(changed)
      if(!validation.ok){sourceError='主进程源码有语法或 JSON 错误，修复后才能重启应用。';console.error('[watch] 源码未通过检查，保留当前应用。\n'+validation.detail);request('restart',sourceRevision);return}
      changed.clear();sourceError='';validatedSourceRevision=sourceRevision;request('restart',sourceRevision);if(built&&!child&&!stopping)launch()
    },700)
  })
  const {build}=await import('vite')
  buildWatcher=await build({configLoader:'runner',build:{watch:{},emptyOutDir:false}})
  buildWatcher.on('event',event=>{
    if(event.code==='START'){buildFailed=false;building=true;request(backendDirty?'restart':'reload')}
    if(event.code==='ERROR'){buildFailed=true;console.error('[watch] 构建失败，保留当前界面。',event.error.message);request(backendDirty?'restart':'reload')}
    if(event.code==='END'){
      building=false
      if(buildFailed)return
      if(process.argv.includes('--check')){console.log('[watch] WATCH_BUILD_READY');void stop();return}
      if(!built){built=true;launch()}else if(!child&&!stopping)launch();else request('reload')
    }
  })
}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop())
if(require.main===module)main().catch(error=>{console.error(error);void stop();process.exitCode=1})
