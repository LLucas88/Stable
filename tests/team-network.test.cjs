'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { TeamNetwork, decodeInvite } = require('../desktop/services/team-network.cjs')

function waitFor(events, predicate, timeout = 2_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const value = events.find(predicate)
      if (value) { clearInterval(timer); resolve(value) }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('event timeout')) }
    }, 10)
  })
}

test('local Team relay discovers devices and routes AI Work messages', async () => {
  const hostEvents = []; const memberEvents = []
  const host = new TeamNetwork({ onEvent: (event) => hostEvents.push(event), capabilities: () => ({ skills: ['report'] }) })
  const member = new TeamNetwork({ onEvent: (event) => memberEvents.push(event), capabilities: () => ({ scripts: ['clean.cmd'] }) })
  try {
    const profile = await host.create({ teamName: '测试团队', deviceName: '设备 A', port: 0, deviceIdentity: { id: 'device-a', key: 'key-a' } })
    assert.equal(decodeInvite(profile.inviteCode).teamName, '测试团队')
    await member.join({ inviteCode: profile.inviteCode, deviceName: '设备 B', deviceIdentity: { id: 'device-b', key: 'key-b' } })
    const roster = await waitFor(hostEvents, (event) => event.type === 'roster' && event.devices.length === 2)
    assert.deepEqual(roster.devices.map((item) => item.id).sort(), ['device-a', 'device-b'])
    host.send('device-b', { type: 'task:create', taskId: 'task-1', instruction: '生成摘要' })
    const request = await waitFor(memberEvents, (event) => event.type === 'route' && event.payload?.taskId === 'task-1')
    assert.equal(request.sourceDeviceId, 'device-a')
    member.send('device-a', { type: 'task:result', taskId: 'task-1', result: '完成' })
    const result = await waitFor(hostEvents, (event) => event.type === 'route' && event.payload?.type === 'task:result')
    assert.equal(result.payload.result, '完成')
  } finally {
    await member.close()
    await host.close()
  }
})

test('local Team relay routes a conversation snapshot and its manual decision', async () => {
  const hostEvents = []; const memberEvents = []
  const host = new TeamNetwork({ onEvent: (event) => hostEvents.push(event) })
  const member = new TeamNetwork({ onEvent: (event) => memberEvents.push(event) })
  try {
    const profile = await host.create({ teamName: '对话共享', deviceName: '设备 A', port: 0, deviceIdentity: { id: 'share-a', key: 'share-key-a' } })
    await member.join({ inviteCode: profile.inviteCode, deviceName: '设备 B', deviceIdentity: { id: 'share-b', key: 'share-key-b' } })
    await waitFor(hostEvents, (event) => event.type === 'roster' && event.devices.length === 2)

    host.send('share-b', { type: 'conversation:offer', offerId: 'offer-a', title: '复盘对话', messages: [{ role: 'user', content: '问题' }, { role: 'assistant', content: '回答' }] })
    const offer = await waitFor(memberEvents, (event) => event.type === 'route' && event.payload?.type === 'conversation:offer')
    assert.equal(offer.sourceDeviceId, 'share-a')
    assert.equal(offer.payload.messages.length, 2)

    member.send('share-a', { type: 'conversation:decision', offerId: 'offer-a', title: '复盘对话', allowed: true })
    const decision = await waitFor(hostEvents, (event) => event.type === 'route' && event.payload?.type === 'conversation:decision')
    assert.equal(decision.sourceDeviceId, 'share-b')
    assert.equal(decision.payload.allowed, true)
  } finally {
    await member.close()
    await host.close()
  }
})

test('relay queues a task for an offline device and delivers it after reconnect', async () => {
  const hostEvents = []; const firstMemberEvents = []; const reconnectedEvents = []
  const host = new TeamNetwork({ onEvent: (event) => hostEvents.push(event) })
  const firstMember = new TeamNetwork({ onEvent: (event) => firstMemberEvents.push(event) })
  const reconnected = new TeamNetwork({ onEvent: (event) => reconnectedEvents.push(event) })
  try {
    const profile = await host.create({ teamName: '离线恢复', deviceName: '主设备', port: 0, deviceIdentity: { id: 'queue-host', key: 'host-key' } })
    await firstMember.join({ inviteCode: profile.inviteCode, deviceName: '执行设备', deviceIdentity: { id: 'queue-worker', key: 'worker-key' } })
    await waitFor(hostEvents, (event) => event.type === 'roster' && event.devices.length === 2)
    await firstMember.close()
    await waitFor(hostEvents, (event) => event.type === 'roster' && event.devices.length === 1)

    host.send('queue-worker', { type: 'task:create', taskId: 'queued-task', instruction: '恢复后执行' })
    const queued = await waitFor(hostEvents, (event) => event.type === 'delivery-queued' && event.taskId === 'queued-task')
    assert.equal(queued.targetDeviceId, 'queue-worker')

    await reconnected.join({ inviteCode: profile.inviteCode, deviceName: '执行设备', deviceIdentity: { id: 'queue-worker', key: 'worker-key' } })
    const delivered = await waitFor(reconnectedEvents, (event) => event.type === 'route' && event.payload?.taskId === 'queued-task')
    assert.equal(delivered.sourceDeviceId, 'queue-host')
  } finally {
    await reconnected.close()
    await firstMember.close()
    await host.close()
  }
})
