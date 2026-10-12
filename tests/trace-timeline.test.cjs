'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { buildTraceTimeline, traceItemStatus, savedTraceStatus, traceCommand, changesFiles, commandChangesFiles } = require('../src/trace-timeline.ts')
const item = (id, time, props = {}) => ({ id, runId: 'r', kind: 'tool', toolName: 'Write', title: id, status: 'completed', time, ...props })
test('timeline only shows mutations, public text and pending approvals without changing stored trace', () => {
  const entries = [item('env',0,{id:'runtime-info',kind:'status'}),item('read',1,{toolName:'Read'}),item('browser',2,{toolName:'stable_browser'}),
    item('intro',3,{kind:'reasoning',eventType:'agent/answer',content:'生成报告'}),item('write',8,{startedAt:4,inputDetail:'{"file_path":"report.html"}'}),
    item('auto',5,{kind:'approval',automaticApproval:true}),item('failed-read',6,{toolName:'Read',status:'failed'}),item('approval',7,{kind:'approval',status:'running'}),
    item('final',9,{kind:'reasoning',eventType:'agent/answer',content:'完成'}),item('runtime',10,{kind:'status',status:'failed'})]
  const snapshot=JSON.stringify(entries)
  assert.deepEqual(buildTraceTimeline(entries,'完成').map(x=>x.id),['intro','write','approval','runtime'])
  assert.equal(JSON.stringify(entries),snapshot)
})
test('full command input survives output replacement and old truncated paths remain readable',()=>{
  const command="cat > report.html <<'EOF'\n"+'内容'.repeat(12000)+'\nEOF'
  assert.equal(traceCommand(item('bash',0,{toolName:'Bash',inputDetail:command,detail:'done'})),command)
  assert.equal(traceCommand(item('edit',0,{toolName:'Edit',inputDetail:'{"file_path":"report.html","new_string":"truncated'})),'Edit report.html')
  assert.doesNotThrow(()=>traceCommand(item('bad-json',0,{toolName:'Edit',inputDetail:String.raw`{"file_path":"C:\q\file"`})))
  assert.equal(traceCommand(item('exec',0,{toolName:'stable_exec',inputDetail:'{"command":"mv a b"}'})),'mv a b')
})
test('explicit mutations remain visible while reads and uncertain scripts stay hidden',()=>{
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
