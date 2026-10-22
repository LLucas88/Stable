'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { traceGroupLabel, traceToolInput, traceToolIcon, latestTraceTool, groupTraceTimeline, buildTraceTimeline, traceItemStatus, savedTraceStatus, traceCommand, changesFiles, commandChangesFiles } = require('../src/trace-timeline.ts')
const item = (id, time, props = {}) => ({ id, runId: 'r', kind: 'tool', toolName: 'Write', title: id, status: 'completed', time, ...props })
test('timeline shows all actual tools, public text and pending approvals without changing stored trace', () => {
  const entries = [item('env',0,{id:'runtime-info',kind:'status'}),item('read',1,{toolName:'Read'}),item('browser',2,{toolName:'stable_browser'}),
    item('intro',3,{kind:'reasoning',eventType:'agent/answer',content:'生成报告'}),item('write',8,{startedAt:4,inputDetail:'{"file_path":"report.html"}'}),
    item('auto',5,{kind:'approval',automaticApproval:true}),item('failed-read',6,{toolName:'Read',status:'failed'}),item('approval',7,{kind:'approval',status:'running'}),
    item('final',9,{kind:'reasoning',eventType:'agent/answer',content:'完成'}),item('runtime',10,{kind:'status',status:'failed'})]
  const snapshot=JSON.stringify(entries)
  assert.deepEqual(buildTraceTimeline(entries,'完成').map(x=>x.id),['read','browser','intro','write','failed-read','approval','runtime'])
  assert.equal(JSON.stringify(entries),snapshot)
})
test('full command input survives output replacement and old truncated paths remain readable',()=>{
  const command="cat > report.html <<'EOF'\n"+'内容'.repeat(12000)+'\nEOF'
  assert.equal(traceCommand(item('bash',0,{toolName:'Bash',inputDetail:command,detail:'done'})),command)
  assert.equal(traceCommand(item('edit',0,{toolName:'Edit',inputDetail:'{"file_path":"report.html","new_string":"truncated'})),'Edit report.html')
  assert.doesNotThrow(()=>traceCommand(item('bad-json',0,{toolName:'Edit',inputDetail:String.raw`{"file_path":"C:\q\file"`})))
  assert.equal(traceCommand(item('exec',0,{toolName:'stable_exec',inputDetail:'{"command":"mv a b"}'})),'mv a b')
})
test('mutation classification distinguishes writes from reads and uncertain scripts',()=>{
  for(const command of ['rm old.html','mv a b','cp a b','mkdir output','cat >report.html <<EOF\nhello\nEOF','printf x >> report.html','sed -i s/a/b/ report.html','curl -o output.html https://example.com','python -c "from pathlib import Path; Path(\'a\').write_text(\'new\')"',"python <<'PY'\nopen('x', 'w').write('test')\nPY",'node -e "require(\'fs\').writeFileSync(\'x\',\'a\')"']) assert.equal(commandChangesFiles(command),true,command)
  for(const command of ['ls -la','cat report.html','python analyze.py','echo "rm old.html"','echo "hello > file"','grep Write report.html','echo x > /dev/null','ls 2>&1']) assert.equal(commandChangesFiles(command),false,command)
  assert.equal(changesFiles(item('excel-read',0,{toolName:'stable_excel',inputDetail:'{"action":"read"}'})),false)
  assert.equal(changesFiles(item('excel-write',0,{toolName:'stable_excel',inputDetail:'{"action":"update","path":"x.xlsx"}'})),true)
  assert.equal(changesFiles(item('mcp',0,{toolName:'mcp__files__write_file'})),true)
})
test('terminal runs clear running states without overriding failures',()=>{
  const running=item('tool',5,{status:'running'})
  for(const status of ['completed','failed','cancelled'])assert.equal(traceItemStatus(running,status),status)
  assert.equal(traceItemStatus(item('bad',1,{status:'failed'}),'completed'),'failed')
  assert.equal(savedTraceStatus([item('runtime',3,{status:'failed'})]),'failed')
  assert.deepEqual(buildTraceTimeline([item('runtime',5,{kind:'status',status:'failed'}),item('write',5)]).map(x=>x.id),['write','runtime'])
})


test('groups tool types within public-text boundaries with stable identities and no mutation', () => {
  const entries = [item('intro', 1, {kind:'reasoning',eventType:'agent/answer',content:'开始'}),
    item('edit1',2,{toolName:'Edit'}),item('write',3),item('edit2',4,{toolName:'apply_patch'}),
    item('next',5,{kind:'reasoning',eventType:'agent/answer',content:'下一步'}),item('edit3',6,{toolName:'Edit'}),
    item('approval',7,{kind:'approval',status:'running'}),item('edit4',8,{toolName:'Edit'})]
  const snapshot=JSON.stringify(entries), grouped=groupTraceTimeline(entries)
  assert.deepEqual(grouped.map(x=>x.kind==='group'?[x.label,x.items.map(i=>i.id)]:x.id),
    ['intro',['编辑文件',['edit1','edit2']],['写入文件',['write']],'next',['编辑文件',['edit3']],'approval',['编辑文件',['edit4']]])
  const appended=groupTraceTimeline([...entries,item('edit5',9,{toolName:'Edit'})])
  assert.deepEqual(appended.map(x=>x.id),grouped.map(x=>x.id))
  assert.equal(appended.at(-1).items.length,2)
  assert.equal(JSON.stringify(entries),snapshot)
  assert.deepEqual(groupTraceTimeline([]),[])
})

test('live tool inputs retain actual code and current tool uses start order',()=>{
  assert.equal(traceToolInput(item('edit',1,{toolName:'Edit',inputDetail:JSON.stringify({file_path:'a',old_string:'before',new_string:'first\nsecond'})})),'first\nsecond')
  assert.equal(traceToolInput(item('write',1,{inputDetail:JSON.stringify({content:'a\nb'})})),'a\nb')
  const params=JSON.stringify({action:'update',path:'a.xlsx'});assert.equal(traceToolInput(item('table',1,{toolName:'stable_excel',inputDetail:params})),params)
  assert.equal(traceToolIcon(item('edit',1,{toolName:'Edit'})),'edit');assert.equal(traceToolIcon(item('cmd',1,{toolName:'Bash'})),'terminal');assert.equal(traceToolIcon(item('write',1)),'write')
  assert.equal(latestTraceTool([item('old',99,{startedAt:1}),item('new',5,{startedAt:3}),item('text',10,{kind:'reasoning'})]).id,'new')
})


test('read-only Bash remains inspectable when the only public text is the final answer',()=>{
 const entries=[item('read',1,{toolName:'Bash',inputDetail:JSON.stringify({command:'cat report.html'})}),item('final',2,{kind:'reasoning',eventType:'agent/answer',content:'解释图表'})];
 assert.deepEqual(buildTraceTimeline(entries,'解释图表').map(i=>i.id),['read']);
 for(const [toolName,icon] of [['Read','read'],['Grep','search'],['stable_browser','browser']]) assert.equal(traceToolIcon(item('t',1,{toolName})),icon);
});


test('natural progress copy follows targets and keeps failed or stopped work explicit', () => {
  const read = item('read', 1, { toolName:'Read', inputDetail:JSON.stringify({file_path:'D:/reports/sales.html'}) })
  assert.equal(traceGroupLabel([read], 'completed'), '已查看 sales.html')
  assert.equal(traceGroupLabel([{...read,status:'running'}], 'running'), '正在查看 sales.html')
  assert.match(traceGroupLabel([{...read,status:'failed'}], 'completed'), /遇到问题/)
  assert.match(traceGroupLabel([{...read,status:'running'}], 'cancelled'), /已停止/)
  assert.match(traceGroupLabel([{...read,status:'running'}], 'completed'), /已结束/)
  assert.match(traceGroupLabel([read,{...read,id:'r2',status:'failed'}], 'completed'), /遇到问题/)
  assert.equal(traceGroupLabel([item('browser',2,{toolName:'stable_browser',inputDetail:'{"action":"screenshot"}'})], 'completed'), '已查看页面内容')
  assert.equal(traceGroupLabel([item('excel',2,{toolName:'stable_excel',inputDetail:'{"action":"read"}'})], 'completed'), '表格操作已完成')
})
