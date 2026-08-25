'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  capabilitySet,
  isTerminal,
  parseCollaborationPlan,
  selectTeamDevice,
  shouldAutoApprove,
} = require('../desktop/services/team-coordination.cjs')

const devices = [
  { id: 'local', status: 'online', role: 'owner', capabilities: { tools: ['Stable Agent'] } },
  { id: 'busy', status: 'online', role: 'member', capabilities: { skills: ['HTML'], dataCount: 2 } },
  { id: 'idle', status: 'online', role: 'admin', capabilities: { skills: ['HTML'], scripts: ['clean.cmd'] } },
  { id: 'offline', status: 'offline', role: 'member', capabilities: { skills: ['HTML'] } },
]

test('capability routing respects requirements, online state and current load', () => {
  assert.deepEqual([...capabilitySet(devices[2])].sort(), ['script:clean.cmd', 'skill:HTML'])
  const selected = selectTeamDevice(devices, ['skill:HTML'], { localDeviceId: 'local', loadByDevice: { busy: 2, idle: 0 } })
  assert.equal(selected.id, 'idle')
  assert.equal(selectTeamDevice(devices, ['knowledge'], { localDeviceId: 'local' }), undefined)
})

test('trusted approval modes are explicit and capability scoped', () => {
  assert.equal(shouldAutoApprove({ approvalMode: 'ask' }, 'device-a'), false)
  assert.equal(shouldAutoApprove({ approvalMode: 'team' }, 'device-a'), true)
  assert.equal(shouldAutoApprove({ approvalMode: 'trusted', trustedDeviceIds: ['device-a'] }, 'device-a'), true)
  assert.equal(shouldAutoApprove({ approvalMode: 'trusted', trustedCapabilities: ['skill:HTML'] }, 'device-b', ['skill:HTML']), true)
  assert.equal(shouldAutoApprove({ approvalMode: 'trusted', trustedCapabilities: ['skill:HTML'] }, 'device-b', ['script:clean.cmd']), false)
})

test('collaboration plan accepts fenced JSON, clamps to three and requires parallel work', () => {
  const plan = parseCollaborationPlan('```json\n{"summary":"并行","subtasks":[{"title":"A","instruction":"研究 A"},{"title":"B","instruction":"研究 B"},{"title":"C","instruction":"研究 C"},{"title":"D","instruction":"研究 D"}]}\n```', 3)
  assert.equal(plan.subtasks.length, 3)
  assert.equal(plan.subtasks[0].title, 'A')
  assert.throws(() => parseCollaborationPlan({ subtasks: [{ title: 'A', instruction: '只有一个' }] }), /至少需要两个/)
})

test('terminal status detection matches root wait semantics', () => {
  assert.equal(isTerminal('success'), true)
  assert.equal(isTerminal('cancelled'), true)
  assert.equal(isTerminal('running'), false)
  assert.equal(isTerminal('synthesizing'), false)
})
