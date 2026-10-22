'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { workflowGuidance } = require('../desktop/services/claude-workflow.cjs')
const cycle = (id, url = 'file:///report.html', failed = false) => [
  { role: 'assistant', tool_calls: [{ id, function: { name: 'mcp__stable__stable_browser', arguments: JSON.stringify({ action: 'open', url, width: 1440, height: 960 }) } }] },
  { role: 'tool', tool_call_id: id, content: failed ? 'Tool execution error: failed' : JSON.stringify({ tabId: 't', epoch: id, url }) },
]
test('repeated successful reopen emits advisory without skipping calls or changing history', () => {
  const input = [1, 2, 3].flatMap(i => cycle(String(i))), original = JSON.stringify(input)
  assert.match(workflowGuidance(input), /3 次/)
  assert.match(workflowGuidance(input), /不代表重复无效/)
  assert.equal(JSON.stringify(input), original)
})
test('different targets, incomplete, failed and compacted histories never invent repetition', () => {
  assert.equal(workflowGuidance([1, 2, 3].flatMap(i => cycle(String(i), `file:///${i}`))), '')
  assert.equal(workflowGuidance([1, 2, 3].flatMap(i => cycle(String(i), undefined, true))), '')
  assert.equal(workflowGuidance(cycle('last')), '')
  assert.equal(workflowGuidance([1, 2, 3].flatMap(i => cycle(String(i))).filter(m => m.role === 'assistant')), '')
})
test('user turn resets rework observations; SDK tool continuations do not', () => {
  const input = [1, 2, 3].flatMap(i => cycle(String(i)))
  assert.equal(workflowGuidance([...input, { role: 'user', content: 'new task' }, ...cycle('4')]), '')
})
test('large history advice is based on text, not base64 pixels, and claims no token measurement', () => {
  assert.match(workflowGuidance([{ role: 'assistant', content: 'x'.repeat(120001) }]), /历史文本/)
  assert.equal(workflowGuidance([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x'.repeat(200000) } }] }]), '')
})

test('screenshots without an acceptance checklist get a completion reminder, never fabricated passes', () => {
  const shots = [1, 2].flatMap(i => [
    { role: 'assistant', tool_calls: [{ id: String(i), function: { name: 'stable_browser', arguments: '{"action":"screenshot"}' } }] },
    { role: 'tool', tool_call_id: String(i), content: JSON.stringify({ tabId: 't', reviewNotebook: { checks: [] } }) },
  ])
  assert.match(workflowGuidance(shots), /尚无验收清单/)
  const withChecklist = structuredClone(shots)
  withChecklist.at(-1).content = JSON.stringify({ tabId: 't', reviewNotebook: { checks: [{ check: 'mobile', status: 'open' }] } })
  assert.equal(workflowGuidance(withChecklist), '')
})
