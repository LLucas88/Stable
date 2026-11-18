'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {EventEmitter}=require('node:events')
const {prepareUpdateWindow,acknowledgeUpdate}=require('../desktop/services/update-window.cjs')
const {createUpdateController}=require('../desktop/services/updater.cjs')
const fixture=()=>fs.mkdtempSync(path.join(os.tmpdir(),'stable-update-window-test-'))
test('observer is ready before silent install and restores environment on cancellation',async()=>{
  const userData=fixture(), prior=process.env.STABLE_UPDATE_PROGRESS_FILE
  let command, argv
  const handle=await prepareUpdateWindow({userData,version:'2.0',spawnProcess:(exe,args)=>{command=exe;argv=args;const child=new EventEmitter();child.unref=()=>{};fs.writeFileSync(path.join(args[args.indexOf('-Directory')+1],'ready'),'ready');return child}})
  assert.match(command,/WindowsPowerShell/);assert.ok(argv.includes('-STA'))
  assert.equal(process.env.STABLE_UPDATE_QUIET,'1')
  let calls;handle.install({quitAndInstall:(...args)=>calls=args});assert.deepEqual(calls,[true,true])
  const progress=process.env.STABLE_UPDATE_PROGRESS_FILE
  handle.cancel();assert.equal(fs.existsSync(path.join(path.dirname(progress),'cancel')),true)
  assert.equal(process.env.STABLE_UPDATE_PROGRESS_FILE,prior)
})
test('observer launch failure leaves the installed app running',async()=>{
  await assert.rejects(prepareUpdateWindow({userData:fixture(),version:'2',spawnProcess:()=>{throw Error('blocked')} }),/blocked/)
})
test('restart acknowledgement requires matching version and successful installation',()=>{
  const userData=fixture(),root=path.join(userData,'update-ui'),id=require('node:crypto').randomUUID(),dir=path.join(root,id)
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(root,'active.json'),JSON.stringify({id,version:'2',created:Date.now()}))
  fs.writeFileSync(path.join(dir,'progress'),'92|rollback_failed|failed|15')
  assert.equal(acknowledgeUpdate(userData,'2'),false)
  fs.writeFileSync(path.join(dir,'progress'),'100|complete|success|0\r\n')
  assert.equal(acknowledgeUpdate(userData,'1'),false)
  assert.equal(acknowledgeUpdate(userData,'2'),true)
  assert.equal(fs.existsSync(path.join(dir,'restarted')),true)
})
test('failed handoff and a task starting during handoff never launch an installer',async()=>{
  for(const failPrepare of [true,false]){
    const updater=new EventEmitter();let installs=0,cancels=0,guards=0
    updater.quitAndInstall=()=>installs++
    const controller=createUpdateController({autoUpdater:updater,isPackaged:true,currentVersion:'1',beforeInstall:async()=>{if(++guards===2)throw Error('task started')},prepareInstall:async()=>{if(failPrepare)throw Error('helper blocked');return {cancel:()=>cancels++,install:()=>installs++}}})
    updater.emit('update-downloaded',{version:'2'})
    await assert.rejects(controller.install(),failPrepare?/helper blocked/:/task started/)
    assert.equal(installs,0);assert.equal(controller.state().status,'downloaded')
    if(!failPrepare)assert.equal(cancels,1)
    controller.dispose()
  }
})
test('silent installer error cancels the observer and keeps error visible',async()=>{
  const updater=new EventEmitter();let cancels=0
  const controller=createUpdateController({autoUpdater:updater,isPackaged:true,currentVersion:'1',prepareInstall:async()=>({cancel:()=>cancels++,install:()=>updater.emit('error',Error('permission denied'))})})
  updater.emit('update-downloaded',{version:'2'});await controller.install()
  assert.equal(controller.state().status,'error');assert.equal(cancels,1)
})
test('real hidden Windows observer follows progress, failure and restart acknowledgement',{skip:process.platform!=='win32',timeout:35000},async()=>{
  const {spawn}=require('node:child_process');const userData=fixture();let child,dir,stderr=''
  const handle=await prepareUpdateWindow({userData,version:'2',spawnProcess:(exe,args,opts)=>{
    dir=args[args.indexOf('-Directory')+1]
    child=spawn(exe,[...args,'-Headless'],{...opts,detached:false,stdio:['ignore','ignore','pipe']});child.stderr.on('data',d=>stderr+=d);return child
  }})
  const wait=async predicate=>{const deadline=Date.now()+6000;while(Date.now()<deadline){if(predicate())return;await new Promise(r=>setTimeout(r,100))}throw Error('observer timeout '+stderr)}
  const observed=()=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'observed.json'),'utf8'))}catch{return {}}}
  try{
    fs.writeFileSync(path.join(dir,'progress'),'76|switching|running|0');await wait(()=>Math.abs(observed().width-207)<=1)
    assert.match(observed().text,/正在更新/)
    fs.writeFileSync(path.join(dir,'progress'),'92|healthcheck_rollback|failed_rolled_back|12');await wait(()=>observed().canClose===true)
    assert.match(observed().text,/旧版已恢复/)
    fs.writeFileSync(path.join(dir,'progress'),'100|complete|success|0');await wait(()=>/正在重启/.test(observed().text))
    const exited=new Promise(resolve=>child.once('exit',resolve))
    assert.equal(acknowledgeUpdate(userData,'2'),true)
    await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('observer did not exit')),4000).unref())])
    assert.equal(child.exitCode,0)
  }finally{handle.cancel();if(child.exitCode===null)child.kill()}
})
