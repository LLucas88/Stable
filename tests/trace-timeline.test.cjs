'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTraceTimeline, groupTraceTimeline, traceItemStatus, savedTraceStatus, traceActionLabel } = require('../src/trace-timeline.ts')
const item = (id, time, props = {}) => ({ id, runId: 'r1', kind: 'status', title: id, status: 'completed', time, ...props })

test('verified runtime version is retained in the expandable execution details', () => {
  const entry = item('runtime-info', 1, { title: '执行环境', detail: 'Claude Agent SDK 0.3.296 · Claude Code 2.1.296 · WSL2 命令沙箱' })
  assert.deepEqual(buildTraceTimeline([entry]), [entry])
})

test('public summaries and tool calls interleave by start time even after tools finish', () => {
  const entries = [
    item('context', 0, { kind: 'context' }),
    item('tool', 8, { kind: 'tool', startedAt: 2, inputDetail: 'crm-brand-cli --help' }),
    item('summary', 1, { kind: 'reasoning', eventType: 'agent/answer', content: '先检查 CLI' }),
    item('summary-2', 3, { kind: 'reasoning', eventType: 'agent/answer', content: '检查命令参数' }),
    item('model', 4, { kind: 'reasoning', detail: '模型正在规划下一步动作' }),
    item('runtime', 9, { status: 'failed', detail: 'FAIL_BIZ_04' }),
  ]
  const rows = buildTraceTimeline(entries)
  assert.deepEqual(rows.map(({ id }) => id), ['summary', 'tool', 'summary-2', 'runtime'])
  assert.equal(rows[1].inputDetail, 'crm-brand-cli --help')
  assert.equal(entries[0].id, 'context', 'sorting must not mutate stored history')
})

test('final answer is not duplicated as a summary and blank commentary is omitted', () => {
  const entries = [
    item('a', 1, { eventType: 'agent/answer', content: '检查完成' }),
    item('blank', 2, { eventType: 'agent/answer', content: '  ' }),
    item('final', 3, { eventType: 'agent/answer', content: '这是最终答案。\n' }),
  ]
  assert.deepEqual(buildTraceTimeline(entries, '这是最终答案。').map(({ id }) => id), ['a'])
  assert.equal(buildTraceTimeline(entries).length, 2, 'live text remains visible until final handoff')
})

test('a terminal runtime update follows actions recorded in the same millisecond', () => {
  const entries = [item('runtime', 5, { status: 'failed' }), item('last-tool', 5, { kind: 'tool' })]
  assert.deepEqual(buildTraceTimeline(entries).map(({ id }) => id), ['last-tool', 'runtime'])
})

test('subagent activity and permission decisions remain readable inline', () => {
  const entries = [
    item('root', 0, { entity: 'agent', eventType: 'agent/start' }),
    item('descriptor', 1, { entity: 'agent', parentSessionId: 'root', eventType: 'agent/descriptor' }),
    item('child', 2, { entity: 'agent', parentSessionId: 'root', eventType: 'agent/start' }),
    item('child-tool', 3, { kind: 'tool', parentSessionId: 'root' }),
    item('approval', 4, { kind: 'approval', status: 'failed' }),
  ]
  assert.deepEqual(buildTraceTimeline(entries).map(({ id }) => id), ['child', 'child-tool', 'approval'])
})

test('terminal runs clear stale spinners without overriding actual failures', () => {
  const running = item('tool', 1, { status: 'running' })
  for (const status of ['completed', 'failed', 'cancelled']) assert.equal(traceItemStatus(running, status), status)
  assert.equal(traceItemStatus(item('failed', 1, { status: 'failed' }), 'completed'), 'failed')
  assert.equal(savedTraceStatus([item('runtime', 3, { status: 'failed' })]), 'failed')
  assert.equal(savedTraceStatus([item('runtime', 0, { status: 'running' }), item('complete', 5)]), 'completed')
})

test('action labels describe commands, file reads, searches and unknown tools', () => {
  assert.equal(traceActionLabel(item('a', 0, { kind: 'tool', title: '使用工具 pwsh' })), '运行了命令')
  assert.equal(traceActionLabel(item('a', 0, { kind: 'tool', toolName: 'read' })), '读取了文件')
  assert.equal(traceActionLabel(item('a', 0, { kind: 'tool', toolName: 'glob' })), '搜索了文件')
  assert.equal(traceActionLabel(item('a', 0, { kind: 'tool', toolName: 'crm-brand-cli' })), '调用了 crm-brand-cli')
  assert.equal(traceActionLabel(item('a', 0, { kind: 'approval', title: '你已批准本次操作' })), '你已批准本次操作')
})


test('full access approvals collapse into one expandable summary and other modes stay visible',()=>{
 const original=[item('auto1',1,{kind:'approval',automaticApproval:true,toolName:'read a'}),item('auto2',2,{kind:'approval',automaticApproval:true,toolName:'read b'}),item('manual',3,{kind:'approval'}),item('run-progress',4,{status:'running'})]
 const rows=buildTraceTimeline(original)
 assert.deepEqual(rows.map(x=>x.id),['automatic-approvals','manual','run-progress'])
 assert.match(rows[0].detail,/read a\nread b/);assert.equal(original.length,4)
})

test('consecutive operations share a goal group until the next public progress message', () => {
  const entries = [item('intro', 1, {eventType:'agent/answer',content:'探查数据源'}),
    item('excel1',2,{kind:'tool'}),item('excel2',3,{kind:'tool',status:'failed'}),
    item('next',4,{eventType:'agent/answer',content:'生成报告'}),item('write',5,{kind:'tool'})]
  const snapshot = JSON.stringify(entries)
  const groups = groupTraceTimeline(buildTraceTimeline(entries), 'running')
  assert.deepEqual(groups.map(g=>g.kind), ['text','actions','text','actions'])
  assert.deepEqual(groups[1].items.map(x=>x.id), ['excel1','excel2'])
  assert.equal(groups[1].items[1].status, 'failed')
  assert.equal(JSON.stringify(entries), snapshot)
  const updated = groupTraceTimeline(buildTraceTimeline([...entries,item('more',6,{kind:'tool'})]), 'running')
  assert.equal(updated[3].id, groups[3].id, 'streamed operations retain the group identity')
})

test('pending approvals remain outside folded groups, and completed histories have no pending notice', () => {
  const entries = [item('a',1,{kind:'tool'}),item('approval',2,{kind:'approval',status:'running'}),item('b',3,{kind:'tool',status:'running'})]
  assert.deepEqual(groupTraceTimeline(entries,'running').map(g=>g.kind), ['actions','notice','actions'])
  const finished = groupTraceTimeline(entries,'cancelled')
  assert.equal(finished.length,1);assert.equal(finished[0].items.length,3)
  assert.deepEqual(groupTraceTimeline([], 'completed'), [])
})

test('Stable command and spreadsheet calls receive concise activity labels', () => {
  assert.equal(traceActionLabel(item('exec',0,{kind:'tool',title:'使用工具 stable_exec'})), '运行了命令')
  assert.equal(traceActionLabel(item('excel',0,{kind:'tool',toolName:'stable_excel'})), '处理了表格')
  assert.equal(traceActionLabel(item('edit',0,{kind:'tool',toolName:'Edit'})), '编辑了文件')
})
