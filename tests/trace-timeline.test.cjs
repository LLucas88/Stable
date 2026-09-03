'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTraceTimeline, traceItemStatus, savedTraceStatus, traceActionLabel } = require('../src/trace-timeline.ts')
const item = (id, time, props = {}) => ({ id, runId: 'r1', kind: 'status', title: id, status: 'completed', time, ...props })

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
