const test=require('node:test'),assert=require('node:assert/strict')
const {createDevReload}=require('../desktop/services/dev-reload.cjs')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('busy work delays refresh until ready and saves before refreshing',async()=>{
 let busy=true;const events=[]
 const service=createDevReload({prepare:async()=>{events.push('prepare');if(busy)throw Error('busy')},reload:()=>events.push('reload'),restart:()=>events.push('restart'),send:m=>events.push(m.type)})
 service.receive({type:'stable:dev:change',id:1,action:'reload'});await tick();assert.ok(!events.includes('reload'))
 busy=false;await service.attempt();assert.ok(events.includes('reload'));assert.equal(events.at(-1),'stable:dev:applied');service.dispose()
})
test('backend change dominates later renderer changes and never duplicates restart',async()=>{
 let busy=true,restarts=0
 const service=createDevReload({prepare:async()=>{if(busy)throw Error('unsaved')},reload:()=>assert.fail('must restart'),restart:()=>restarts++,send:()=>{}})
 service.receive({type:'stable:dev:change',id:1,action:'restart'});await tick()
 service.receive({type:'stable:dev:change',id:2,action:'reload'});await tick()
 busy=false;await service.attempt();assert.equal(restarts,0);await service.apply(2);await service.attempt();assert.equal(restarts,1);service.dispose()
})
test('newer edits during readiness invalidate the old request',async()=>{
 let release,reloads=0,restarts=0
 const service=createDevReload({prepare:()=>new Promise(r=>release=r),reload:()=>reloads++,restart:()=>restarts++,send:()=>{}})
 service.receive({type:'stable:dev:change',id:1,action:'reload'})
 service.receive({type:'stable:dev:change',id:2,action:'restart'})
 release();await tick();assert.equal(reloads,0)
 const pending=service.apply(2);release();await tick();release();await tick();release();await pending;assert.equal(restarts,1);service.dispose()
})
test('disconnected launcher cannot restart the app; malformed messages are ignored',async()=>{
 let applied=0,release
 const service=createDevReload({prepare:()=>new Promise(r=>release=r),reload:()=>applied++,restart:()=>applied++,send:()=>{}})
 service.receive({type:'evil',id:1,action:'restart'});assert.equal(release,undefined)
 service.receive({type:'stable:dev:change',id:1,action:'restart'});const applying=service.apply(1);service.dispose();release();await applying;await tick();assert.equal(applied,0)
})

test('backend edits only publish a notice; timers and attempt cannot prepare or restart without a click',async()=>{
 let prepared=0,restarts=0;const states=[]
 const service=createDevReload({prepare:async()=>prepared++,reload:()=>assert.fail('backend changes cannot reload'),restart:()=>restarts++,send:()=>true,onState:s=>states.push(s),intervalMs:5})
 try{
  for(let id=1;id<=6;id++)service.receive({type:'stable:dev:change',id,action:'restart'})
  await new Promise(r=>setTimeout(r,20));await service.attempt()
  assert.equal(prepared,0);assert.equal(restarts,0)
  assert.deepEqual(service.state(),{enabled:true,revision:6,action:'restart',applying:false,blocked:false,message:'主进程代码已更新，点击重启应用后生效。'})
  assert.equal(states.at(-1).revision,6)
  await service.apply(6);assert.equal(restarts,1);assert.equal(prepared,3)
  await assert.rejects(service.apply(6),e=>e.code==='DEV_RELOAD_STALE')
 }finally{service.dispose()}
})

test('stale and replayed revisions cannot authorize the latest code',async()=>{
 let restarts=0,prepared=0
 const service=createDevReload({prepare:async()=>prepared++,reload:()=>{},restart:()=>restarts++,send:()=>true})
 try{
  service.receive({type:'stable:dev:change',id:4,action:'restart'})
  service.receive({type:'stable:dev:change',id:3,action:'reload'})
  await assert.rejects(service.apply(3),e=>e.code==='DEV_RELOAD_STALE')
  assert.equal(service.state().revision,4);assert.equal(prepared,0);assert.equal(restarts,0)
 }finally{service.dispose()}
})

test('busy readiness consumes a manual click and does not silently restart when work finishes',async()=>{
 let busy=true,restarts=0
 const service=createDevReload({prepare:async()=>{if(busy)throw Error('busy task')},reload:()=>{},restart:()=>restarts++,send:()=>true})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'})
  const waiting=await service.apply(1);assert.match(waiting.message,/busy task/)
  busy=false;await service.attempt();assert.equal(restarts,0)
  await service.apply(1);assert.equal(restarts,1)
 }finally{service.dispose()}
})

test('new code arriving during manual prepare cancels that click and absorbs renderer changes',async()=>{
 let release,restarts=0,reloads=0
 const service=createDevReload({prepare:()=>new Promise(r=>release=r),reload:()=>reloads++,restart:()=>restarts++,send:()=>true})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'})
  const applying=service.apply(1)
  service.receive({type:'stable:dev:change',id:2,action:'reload'})
  release();await applying;await service.attempt()
  assert.equal(restarts,0);assert.equal(reloads,0);assert.equal(service.state().action,'restart')
  await assert.rejects(service.apply(1),e=>e.code==='DEV_RELOAD_STALE')
  const latest=service.apply(2);release();await tick();release();await tick();release();await latest;assert.equal(restarts,1)
 }finally{service.dispose()}
})

test('a change during the applying IPC acknowledgement cancels the older restart',async()=>{
 let release,restarts=0;const events=[]
 const service=createDevReload({prepare:async()=>{},reload:()=>{},restart:()=>restarts++,send:async m=>{events.push(m);if(m.type==='stable:dev:applying')await new Promise(r=>release=r);return true}})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'});const applying=service.apply(1);await tick()
  service.receive({type:'stable:dev:change',id:2,action:'restart'});release();await applying;await service.attempt()
  assert.equal(restarts,0);assert(events.some(e=>e.type==='stable:dev:waiting'&&e.id===1));assert.equal(service.state().revision,2)
 }finally{service.dispose()}
})

test('disconnect during manual preparation revokes the request and publishes disabled state',async()=>{
 let release,restarts=0;const states=[]
 const service=createDevReload({prepare:()=>new Promise(r=>release=r),reload:()=>{},restart:()=>restarts++,send:()=>true,onState:s=>states.push(s)})
 service.receive({type:'stable:dev:change',id:1,action:'restart'});const applying=service.apply(1);service.dispose();release();await applying
 assert.equal(restarts,0);assert.equal(states.at(-1).enabled,false);await assert.rejects(service.apply(1),e=>e.code==='DEV_RELOAD_STALE')
})

test('valid backend then invalid raw edit rejects both the old click and the blocked new revision',async()=>{
 let prepared=0,restarts=0
 const service=createDevReload({prepare:async()=>prepared++,reload:()=>{},restart:()=>restarts++,send:()=>true})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'})
  service.receive({type:'stable:dev:change',id:2,action:'restart',blocked:true,message:'源码正在检查'})
  await assert.rejects(service.apply(1),e=>e.code==='DEV_RELOAD_STALE')
  await assert.rejects(service.apply(2),e=>e.code==='DEV_RELOAD_BLOCKED')
  service.receive({type:'stable:dev:change',id:3,action:'restart',blocked:true,message:'源码语法错误'})
  await service.attempt();assert.equal(prepared,0);assert.equal(restarts,0)
  service.receive({type:'stable:dev:change',id:4,action:'restart',blocked:false})
  await service.attempt();assert.equal(restarts,0)
  await service.apply(4);assert.equal(restarts,1)
 }finally{service.dispose()}
})

test('raw invalid edit during the second readiness check revokes a confirmed restart',async()=>{
 let release,checks=0,restarts=0;const events=[]
 const service=createDevReload({prepare:async()=>{if(++checks===2)await new Promise(r=>release=r)},reload:()=>{},restart:()=>restarts++,send:m=>{events.push(m);return true}})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'});const applying=service.apply(1);await tick()
  service.receive({type:'stable:dev:change',id:2,action:'restart',blocked:true,message:'源码检查未完成'})
  release();await applying;await service.attempt()
  assert.equal(restarts,0);assert.equal(service.state().blocked,true);assert(events.some(e=>e.type==='stable:dev:waiting'&&e.id===1))
 }finally{service.dispose()}
})

test('renderer builds never refresh while blocked and successful pure frontend changes remain silent',async()=>{
 let reloads=0
 const service=createDevReload({prepare:async()=>{},reload:()=>reloads++,restart:()=>assert.fail('frontend must not restart'),send:()=>true})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'reload',blocked:true,message:'构建中'})
  await service.attempt();assert.equal(reloads,0)
  service.receive({type:'stable:dev:change',id:2,action:'reload',blocked:true,message:'构建失败'})
  await assert.rejects(service.apply(2),e=>e.code==='DEV_RELOAD_BLOCKED');assert.equal(reloads,0)
  service.receive({type:'stable:dev:change',id:3,action:'reload',blocked:false});await tick()
  assert.equal(reloads,1);assert.equal(service.state().message,'');assert.equal(service.state().action,null)
 }finally{service.dispose()}
})

test('a task becoming busy during applying IPC prevents exit and consumes the manual click',async()=>{
 let release,busy=false,restarts=0;const events=[]
 const service=createDevReload({prepare:async()=>{if(busy)throw Error('new task is busy')},reload:()=>{},restart:()=>restarts++,send:async m=>{events.push(m);if(m.type==='stable:dev:applying')await new Promise(r=>release=r);return true}})
 try{
  service.receive({type:'stable:dev:change',id:1,action:'restart'});const applying=service.apply(1);await tick()
  busy=true;release();await applying
  assert.equal(restarts,0);assert.match(service.state().message,/new task is busy/)
  assert(events.some(e=>e.type==='stable:dev:waiting'&&e.id===1))
  busy=false;await service.attempt();assert.equal(restarts,0)
 }finally{service.dispose()}
})
