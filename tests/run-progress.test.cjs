const test=require('node:test'),assert=require('node:assert/strict')
const {RunProgress,failureKind}=require('../desktop/services/run-progress.cjs')
const path=require('node:path')

test('browser failures on distinct URLs do not stop the run, but repeating the same operation does',()=>{
 const p=new RunProgress()
 const fail=(id,url,action='open')=>{p.startTool({id,name:'stable_browser',args:{action,url}});return p.complete(id,{status:'failed',aggregatedOutput:'ERR_FAILED (-2)'})}
 assert.equal(fail('short','https://v.douyin.com/short'),null)
 assert.equal(fail('share','https://www.iesdouyin.com/share/video/1'),null)
 assert.equal(fail('video','https://www.douyin.com/video/1'),null)
 assert.equal(fail('retry','https://www.douyin.com/video/1'),null)
 const issue=fail('repeated','https://www.douyin.com/video/1#ignored')
 assert.match(issue,/浏览器操作失败/);assert.match(issue,/同一操作.*3 次/);assert.match(issue,/ERR_FAILED/);assert.doesNotMatch(issue,/命令执行失败/)
})

test('tool operation identity ignores ordering and descriptions, successful work clears only its own failures',()=>{
 const p=new RunProgress()
 p.startTool({id:'a',name:'WebFetch',args:{url:'https://source.example/',prompt:'First'}});p.complete('a',{status:'failed'})
 p.startTool({id:'b',name:'WebFetch',args:{prompt:'Different wording',url:'https://source.example/'}});p.complete('b',{status:'failed'})
 p.startTool({id:'c',name:'WebFetch',args:{url:'https://source.example/'}});assert.equal(p.complete('c',{status:'completed'}),null)
 p.startTool({id:'d',name:'WebFetch',args:{url:'https://source.example/'}});assert.equal(p.complete('d',{status:'failed'}),null)
 assert.match(p.detail(),/次工具调用/)
})

test('only a related file repair renews command failures, with a bounded repair budget',()=>{
 const workspace=path.resolve('retry-fixture'), script=path.join(workspace,'analyze.py')
 const p=new RunProgress({workspace});let id=0
 const fail=(output=`File "${script}", line 1\nTypeError: bad input`)=>{const key=String(++id);p.start(key,'python analyze.py');return p.complete(key,{status:'failed',aggregatedOutput:output})}
 assert.equal(fail(),null);assert.equal(fail(),null)
 p.recordFileChange(path.join(workspace,'notes.txt'))
 assert.match(fail(),/3 次/)
 p.recordFileChange(script)
 assert.equal(fail(),null)
 for(let i=0;i<5;i++){p.recordFileChange(script);assert.equal(fail(),null)}
 p.recordFileChange(script);assert.equal(fail(),null);assert.match(fail(),/3 次/)
})

test('repairs do not reset permission failures or unrelated same-basename paths',()=>{
 const workspace=path.resolve('retry-fixture'), script=path.join(workspace,'analyze.py')
 for(const output of [`Permission denied: "${script}"`,`File "${path.join(workspace,'other','analyze.py')}"`]){
  const p=new RunProgress({workspace})
  for(let i=0;i<3;i++){p.start('f'+i,'python other/analyze.py');const issue=p.complete('f'+i,{status:'failed',aggregatedOutput:output});assert.equal(Boolean(issue),i===2);p.recordFileChange(script)}
 }
})
const {isPermissionAudit}=require('../desktop/services/run-progress.cjs')

test('permission denials stay scoped to the actual operation in ordinary and inventory tasks',()=>{
 assert.equal(isPermissionAudit('帮我看一下问鼎cli中打杂陈品牌有哪些命令有权限'),true)
 assert.equal(isPermissionAudit('查询会员数据'),false)
 const denied={exitCode:1,aggregatedOutput:'{"error":"当前品牌无权访问该数据集"}'}
 const audit=new RunProgress({permissionAudit:true}),normal=new RunProgress()
 for(let i=0;i<4;i++){
  const command='crm-brand-cli data-analysis query-test-'+i+' --page-size 1'
  audit.start('a'+i,command);assert.equal(audit.complete('a'+i,denied),null)
  normal.start('n'+i,command);assert.equal(normal.complete('n'+i,denied),null)
 }
 for(let i=0;i<2;i++){
  audit.start('retry'+i,'crm-brand-cli data-analysis query-test-0 --page-size 1')
  assert.equal(Boolean(audit.complete('retry'+i,denied)),i===1)
 }
})
test('successful tool contents never become a failure merely because they describe errors',()=>{
 assert.equal(failureKind({exitCode:0,aggregatedOutput:JSON.stringify(JSON.stringify({success:false}))}),null)
 assert.equal(failureKind({status:'completed',toolName:'Read',aggregatedOutput:'历史错误：当前品牌无权访问，session.lock Permission denied'}),null)
 assert.equal(failureKind({status:'completed',aggregatedOutput:'{"success":true,"error":""}'}),null)
 assert.equal(failureKind({exitCode:0,aggregatedOutput:'if (response.success === false) { return false }'}),null)
})
test('three repeated failures stop while successful work resets the command streak',()=>{
 const p=new RunProgress()
 for(let i=0;i<3;i++){p.start('f'+i,'query');const reason=p.complete('f'+i,{exitCode:1,aggregatedOutput:'query failed'});assert.equal(Boolean(reason),i===2)}
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

test('tool silence is a notice instead of a failure; approval time remains excluded',()=>{
 let now=0;const p=new RunProgress({now:()=>now,toolIdleMs:120,toolMs:1000})
 p.start('a','write file',true);now=119;assert.equal(p.check(),null)
 p.output('a');now=200;assert.equal(p.check(),null)
 p.check(true);now=1200;assert.equal(p.check(false),null)
 now=1239;assert.equal(p.check(),null);assert.match(p.notice(),/没有据此判定失败/)
 p.complete('a',{exitCode:0});assert.equal(p.active.size,0)
})

test('only an unchanged failed operation is blocked; successful alternatives and other working directories remain available',()=>{
 const p=new RunProgress(),event={name:'Bash',args:{command:'python broken.py'},cwd:path.resolve('one')}
 for(let i=0;i<3;i++){p.startTool({...event,id:'f'+i});p.complete('f'+i,{status:'failed',aggregatedOutput:'original exception'})}
 assert.match(p.beforeTool(event),/original exception/)
 assert.equal(p.beforeTool({...event,args:{command:'python corrected.py'}}),null)
 assert.equal(p.beforeTool({...event,cwd:path.resolve('two')}),null)
 p.startTool({...event,id:'blocked',retryBlocked:true});p.complete('blocked',{status:'failed',retryBlocked:true,aggregatedOutput:'blocked'})
 assert.deepEqual([...p.failures.values()],[3])
 assert.match(p.guidance(),/本轮未取消/)
})

test('a real script change by any writer renews retries, while touching or unrelated changes do not',t=>{
 const fs=require('node:fs'),os=require('node:os')
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'stable-progress-repair-'))
 t.after(()=>{assert.equal(path.dirname(workspace),path.resolve(os.tmpdir()));fs.rmSync(workspace,{recursive:true,force:true})})
 const file=path.join(workspace,'broken.py');fs.writeFileSync(file,'before')
 const p=new RunProgress({workspace}),event={name:'Bash',args:{command:'python broken.py'}}
 for(let i=0;i<3;i++){p.startTool({...event,id:'f'+i});p.complete('f'+i,{status:'failed',aggregatedOutput:'TypeError'})}
 assert(p.beforeTool(event));fs.utimesSync(file,new Date(),new Date());assert(p.beforeTool(event))
 fs.writeFileSync(path.join(workspace,'other.py'),'unrelated');assert(p.beforeTool(event))
 fs.writeFileSync(file,'changed by an approved script');assert.equal(p.beforeTool(event),null)
 assert.equal(p.failures.size,0)
})
