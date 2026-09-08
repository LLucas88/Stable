'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {approvalNotification}=require('../desktop/services/approval-notification.cjs')
function fixture({minimized=true,persistent=true}={}) {
 const notices=[],decisions=[];let pending=true,opened=0,closed=0
 class Notification extends EventEmitter{static isSupported(){return true}constructor(options){super();this.options=options;notices.push(this)}show(){}close(){closed++}}
 const window=new EventEmitter();Object.assign(window,{isDestroyed:()=>false,isMinimized:()=>minimized,isVisible:()=>true})
 const dispose=approvalNotification({Notification,window,title:'审批',summary:'创建测试文件',persistent,pending:()=>pending,decide:d=>{decisions.push(d);pending=false;return true},open:()=>opened++})
 return {notices,decisions,window,dispose,minimize:()=>{minimized=true;window.emit('minimize')},expire:()=>{pending=false},stats:()=>({opened,closed})}
}
test('minimized native toast has authorization and three decision buttons',()=>{
 const f=fixture();assert.equal(f.notices[0].options.body,'创建测试文件')
 assert.deepEqual(f.notices[0].options.actions.map(x=>x.text),['允许一次','本次对话允许','拒绝'])
 f.notices[0].emit('action',{actionIndex:1});assert.deepEqual(f.decisions,['conversation']);assert.equal(f.stats().closed,1)
 f.notices[0].emit('action',{actionIndex:2});assert.equal(f.decisions.length,1)
})
test('visible window defers toast until minimize, does not redisplay on repeated minimize',()=>{
 const f=fixture({minimized:false});assert.equal(f.notices.length,0);f.minimize();f.minimize();assert.equal(f.notices.length,1)
 f.dispose();assert.equal(f.window.listenerCount('minimize'),0)
})
test('close and body click never authorize; stale actions cannot execute',()=>{
 const f=fixture();f.notices[0].emit('close');assert.equal(f.decisions.length,0)
 f.notices[0].emit('click');assert.equal(f.stats().opened,1)
 f.expire();f.notices[0].emit('action',{actionIndex:0});assert.equal(f.decisions.length,0)
})
test('once and denial route correctly; unsupported persistent approval is omitted',()=>{
 for(const index of [0,1]){const f=fixture({persistent:false});assert.equal(f.notices[0].options.actions.length,2);f.notices[0].emit('action',{},index);assert.equal(f.decisions[0],index===0?'once':'deny')}
})
test('two outstanding requests stay independent and invalid action indices are ignored',()=>{
 const a=fixture(),b=fixture();a.notices[0].emit('action',{actionIndex:99});assert.equal(a.decisions.length,0)
 a.notices[0].emit('action',{actionIndex:0});b.notices[0].emit('action',{actionIndex:2});assert.deepEqual(a.decisions,['once']);assert.deepEqual(b.decisions,['deny'])
})
