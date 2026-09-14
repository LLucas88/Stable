'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { TaskAlerts } = require('../desktop/services/task-alerts.cjs')

test('approval and input are immediate, deduplicated, and suppress idle warnings', () => {
  let time = 0; const sent = [], closed = []
  const alerts = new TaskAlerts({ now: () => time, notify: (id, kind) => { sent.push([id,kind]); return () => closed.push(id) } })
  alerts.start('a'); alerts.wait('a','request-1'); alerts.wait('a','request-1')
  time = 900000; alerts.tick()
  assert.deepEqual(sent, [['a','approval']])
  alerts.resolve('a','request-1'); assert.deepEqual(closed, ['a'])
  alerts.wait('a','request-2'); alerts.wait('a','question','input')
  assert.deepEqual(sent.slice(1), [['a','approval'],['a','input']])
  alerts.finish('a'); alerts.tick(); assert.equal(alerts.tasks.size,0)
})

test('three-minute watchdog tracks each task and resets only after progress', () => {
  let time = 0; const sent = []
  const alerts = new TaskAlerts({ now: () => time, notify: (...args) => sent.push(args) })
  alerts.start('a'); alerts.start('b'); time = 179999; alerts.progress('b'); alerts.tick()
  assert.equal(sent.length,0)
  time = 180000; alerts.tick(); alerts.tick(); assert.deepEqual(sent,[['a','stalled']])
  alerts.progress('a'); time = 359999; alerts.tick(); assert.deepEqual(sent.at(-1),['b','stalled'])
  alerts.finish('a'); alerts.finish('b'); time += 999999; alerts.tick(); assert.equal(sent.length,2)
})

test('new run disposes previous reminders; cancellation cannot generate delayed alerts', () => {
  let time=0, count=0, disposed=0
  const alerts=new TaskAlerts({now:()=>time,notify:()=>{count++;return ()=>disposed++}})
  alerts.start('a');alerts.wait('a','input','input');alerts.start('a')
  assert.equal(disposed,1)
  alerts.finish('a');time=999999;alerts.tick();alerts.wait('a','stale')
  assert.equal(count,1)
})
