const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events')
const {sendIpc,confirmRestart}=require('../desktop/services/dev-ipc.cjs')
const {createDevReload}=require('../desktop/services/dev-reload.cjs')
const {createFingerprints}=require('../scripts/source-fingerprints.cjs')
const {closeStoreOnQuit}=require('../desktop/services/store-shutdown.cjs')
const {createWatchChangeQueue}=require('../scripts/watch-change-queue.cjs')
const {validateWatchSources}=require('../scripts/validate-watch-source.cjs')
test('metadata notifications and identical rewrites do not trigger restart',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-watch-test-')),file=path.join(root,'service.cjs')
 fs.writeFileSync(file,'module.exports=1');const tracker=createFingerprints(root)
 assert.equal(tracker.changed(file),false);fs.utimesSync(file,new Date(),new Date());assert.equal(tracker.changed(file),false)
 fs.writeFileSync(file,'module.exports=1');assert.equal(tracker.changed(file),false)
 fs.writeFileSync(file,'module.exports=2');assert.equal(tracker.changed(file),true);assert.equal(tracker.changed(file),false)
 fs.unlinkSync(file);assert.equal(tracker.changed(file),true);assert.equal(tracker.changed(file),false)
 const dependency=path.join(root,'node_modules','cached.js');fs.mkdirSync(path.dirname(dependency));fs.writeFileSync(dependency,'cache');assert.equal(tracker.changed(dependency),false)
})
test('broken IPC pipes report false without killing either process',async()=>{
 assert.equal(await sendIpc({connected:false},{}),false)
 assert.equal(await sendIpc({connected:true,send:(_m,cb)=>cb(Object.assign(Error('write EPIPE'),{code:'EPIPE'}))},{}),false)
 assert.equal(await sendIpc({connected:true,send:()=>{throw Error('closed')}},{}),false)
})
test('restart waits for matching parent acknowledgement and rejects disconnect',async()=>{
 const target=new EventEmitter();target.connected=true;target.send=(_m,cb)=>cb()
 const pending=confirmRestart(target,7,1000)
 target.emit('message',{type:'stable:dev:restart-confirmed',id:6})
 target.emit('message',{type:'stable:dev:restart-confirmed',id:7});assert.equal(await pending,true)
 const failed=confirmRestart(target,8,1000);target.emit('disconnect');assert.equal(await failed,false)
 assert.equal(target.listenerCount('message'),0)
})
test('no parent acknowledgement means no application exit',async()=>{
 let quits=0
 const service=createDevReload({prepare:async()=>{},reload:()=>{},restart:()=>quits++,send:()=>true,confirmRestart:async()=>false})
 service.receive({type:'stable:dev:change',id:1,action:'restart'});await service.apply(1)
 assert.equal(quits,0);service.dispose()
})

test('launch covers already observed source edits even when debounce validation finishes afterwards',()=>{
 const changes=createWatchChangeQueue(),observed=changes.observe()
 changes.beginLaunch()
 assert.equal(changes.enqueue('restart',observed),false)
 assert.equal(changes.take(),null)
})

test('a replacement process covers queued edits but retains changes observed after launch',()=>{
 const changes=createWatchChangeQueue()
 changes.enqueue('restart',changes.observe());const old=changes.take()
 changes.enqueue('restart',changes.observe());changes.beginLaunch()
 assert.equal(changes.take(),null)
 changes.restore(old);assert.equal(changes.take(),null,'late IPC failure cannot resurrect a covered revision')
 changes.enqueue('restart',changes.observe());assert.equal(changes.take().action,'restart')
})

test('late failed reload send cannot downgrade a newer queued backend restart',()=>{
 const changes=createWatchChangeQueue()
 changes.enqueue('reload');const old=changes.take()
 changes.enqueue('restart',changes.observe());const newest=changes.state().pending.id
 changes.restore(old)
 assert.deepEqual(changes.take(),{id:newest,action:'restart'})
})

test('slow backend validation after a renderer build publishes a strictly newer notification',()=>{
 const changes=createWatchChangeQueue(),backend=changes.observe()
 changes.enqueue('reload');const renderer=changes.take()
 changes.enqueue('restart',backend);const validated=changes.take()
 assert.equal(validated.action,'restart');assert(validated.id>renderer.id)
})

test('changed JSON must parse before restart can be offered; BOM is accepted and repair clears the failure',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-watch-json-')),file=path.join(root,'design-presets.json')
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true})})
 fs.writeFileSync(file,'\uFEFF{"valid":true}')
 assert.equal(validateWatchSources([file]).ok,true)
 fs.writeFileSync(file,'{"private-fixture-value":,}')
 const invalid=validateWatchSources([file]);assert.equal(invalid.ok,false);assert.equal(invalid.file,file)
 assert(!invalid.detail.includes('private-fixture-value'),'diagnostics do not expose JSON contents')
 fs.writeFileSync(file,'{"repaired":true}')
 assert.equal(validateWatchSources([file]).ok,true)
})

test('source validation blocks JavaScript parse failures without executing a module',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-watch-syntax-')),file=path.join(root,'service.cjs'),sideEffect=path.join(root,'must-not-exist.txt')
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true})})
 fs.writeFileSync(file,'module.exports = {')
 const invalid=validateWatchSources([file])
 assert.equal(invalid.ok,false);assert.match(invalid.detail,/SyntaxError/)
 fs.writeFileSync(file,`require('node:fs').writeFileSync(${JSON.stringify(sideEffect)},'must not execute')`)
 assert.equal(validateWatchSources([file]).ok,true);assert.equal(fs.existsSync(sideEffect),false)
})
test('database remains open throughout cancellable quit, closes once at will-quit',()=>{
 const app=new EventEmitter(),events=[];let open=true
 closeStoreOnQuit(app,()=>({recoverInterruptedRuns:()=>{assert.equal(open,true);events.push('recover')},close:()=>{open=false;events.push('close')}}))
 app.emit('before-quit',{preventDefault(){}});assert.equal(open,true)
 app.emit('before-quit',{});assert.equal(open,true)
 app.emit('will-quit');app.emit('will-quit');assert.equal(open,false);assert.deepEqual(events,['recover','close'])
})
