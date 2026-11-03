'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createUpdateReadiness}=require('../desktop/services/update-readiness.cjs')
function fixture() {
  let handler, request, busy='', sends=0
  const contents={mainFrame:{},send:(_channel,value)=>{request=value;sends++}}
  const guard=createUpdateReadiness({ipcMain:{handle:(_name,fn)=>{handler=fn}},getWindow:()=>({isDestroyed:()=>false,webContents:contents}),blockers:()=>busy,timeoutMs:30})
  return {guard, busy:value=>{busy=value}, sends:()=>sends, reply:(result,spoof=false,id=request.id)=>handler({sender:spoof?{}:contents,senderFrame:contents.mainFrame},{id,result})}
}
test('tasks block before renderer checks and are rechecked after acknowledgement',async()=>{
  const f=fixture();f.busy('任务正在运行');await assert.rejects(f.guard(),/任务正在运行/);assert.equal(f.sends(),0)
  f.busy('');const pending=f.guard();f.busy('新的任务');f.reply('ready');await assert.rejects(pending,/新的任务/)
})
test('missing, invalid and forged readiness replies never permit installation',async()=>{
  const f=fixture(),pending=f.guard()
  assert.equal(f.reply('ready',true),false);await assert.rejects(pending,/未确认/)
  assert.equal(f.reply('ready'),false)
  const invalid=f.guard();f.reply('unknown');await assert.rejects(invalid,/未安全保存/)
  const ready=f.guard();f.reply('ready');await ready
})
