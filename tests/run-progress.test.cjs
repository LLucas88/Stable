const test=require('node:test'),assert=require('node:assert/strict')
const {RunProgress,failureKind}=require('../desktop/services/run-progress.cjs')
const {isPermissionAudit}=require('../desktop/services/run-progress.cjs')

test('explicit permission inventories count denials by command, not across datasets',()=>{
 assert.equal(isPermissionAudit('帮我看一下问鼎cli中打杂陈品牌有哪些命令有权限'),true)
 assert.equal(isPermissionAudit('查询会员数据'),false)
 const denied={exitCode:1,aggregatedOutput:'{"error":"当前品牌无权访问该数据集"}'}
 const audit=new RunProgress({permissionAudit:true}),normal=new RunProgress()
 for(let i=0;i<4;i++){
  const command='crm-brand-cli data-analysis query-test-'+i+' --page-size 1'
  audit.start('a'+i,command);assert.equal(audit.complete('a'+i,denied),null)
  normal.start('n'+i,command);assert.equal(Boolean(normal.complete('n'+i,denied)),i>=2)
 }
 for(let i=0;i<2;i++){
  audit.start('retry'+i,'crm-brand-cli data-analysis query-test-0 --page-size '+(i+2))
  assert.equal(Boolean(audit.complete('retry'+i,denied)),i===1)
 }
})
test('business failure is recognized despite exit zero, source examples are not',()=>{
 assert.equal(failureKind({exitCode:0,aggregatedOutput:JSON.stringify(JSON.stringify({success:false}))}),'接口返回业务失败')
 assert.equal(failureKind({exitCode:0,aggregatedOutput:'if (response.success === false) { return false }'}),null)
})
test('three repeated failures stop while successful work resets the command streak',()=>{
 const p=new RunProgress()
 for(let i=0;i<3;i++){p.start('f'+i,'query');const reason=p.complete('f'+i,{exitCode:0,aggregatedOutput:'{"success":false}'});assert.equal(Boolean(reason),i===2)}
 const q=new RunProgress();q.start('a','query');q.complete('a',{exitCode:1});q.start('b','query');q.complete('b',{exitCode:0});q.start('c','query');assert.equal(q.complete('c',{exitCode:1}),null)
})
test('help repeats are bounded and duplicate events do not spend budget',()=>{
 const p=new RunProgress();assert.equal(p.start('a','cli --help'),null);p.start('a','cli --help');assert.equal(p.helpCount,1)
 assert.equal(p.start('b','cli --help'),null);assert.match(p.start('c','cli --help'),/重复/)
 const q=new RunProgress();for(let i=0;i<12;i++)assert.equal(q.start(String(i),'cli '+i+' --help'),null);assert.match(q.start('13','cli other --help'),/12/)
})
test('watchdog distinguishes tools, model silence and approvals without timing real sleeps',()=>{
 let now=0;const p=new RunProgress({now:()=>now,idleMs:100,toolMs:200})
 p.start('a','long job');now=150;assert.equal(p.check(),null)
 p.check(true);now=1000;p.check(true);assert.equal(p.check(false),null)
 now=1051;assert.match(p.check(),/工具执行/)
 const q=new RunProgress({now:()=>now,idleMs:100});now+=99;assert.equal(q.check(),null);q.touch();now+=101;assert.match(q.check(),/模型/)
})
