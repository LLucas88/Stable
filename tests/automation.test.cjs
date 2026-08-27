'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { computeNextRun, normalizeAutomationInput, parseProposalOutput } = require('../desktop/services/automation.cjs')
const { StableStore } = require('../desktop/services/store.cjs')

test('automation schedules calculate once, daily, weekly and short-month runs in local time', () => {
  const after = new Date(2026, 0, 30, 10, 0)
  assert.equal(new Date(computeNextRun({ type: 'daily', time: '09:00' }, after)).getDate(), 31)
  const weekly = new Date(computeNextRun({ type: 'weekly', time: '08:00', weekdays: [1] }, after))
  assert.equal(weekly.getDay(), 1)
  const monthly = new Date(computeNextRun({ type: 'monthly', time: '09:30', day: 31 }, new Date(2026, 0, 31, 10, 0)))
  assert.equal(monthly.getMonth(), 1)
  assert.equal(monthly.getDate(), 28)
  assert.equal(computeNextRun({ type: 'once', date: '2026-01-01', time: '09:00' }, after), undefined)
})

test('chat proposal parser accepts only a validated future automation object', () => {
  const now = new Date(2026, 7, 27, 8, 0)
  const value = parseProposalOutput('```json\n{"isAutomation":true,"title":"日报","prompt":"生成日报","schedule":{"type":"daily","time":"18:00"}}\n```', now)
  assert.equal(value.title, '日报')
  assert.equal(value.schedule.type, 'daily')
  assert.throws(() => normalizeAutomationInput({ title: '', prompt: 'x', schedule: { type: 'daily', time: '18:00' } }, now), /任务名称/)
})

test('store persists automation, claims one run and records its history', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-automation-'))
  const store = new StableStore(root)
  try {
    const item = store.createAutomation({ title: '测试任务', prompt: '输出 OK', schedule: { type: 'daily', time: '18:00' } })
    assert.equal(item.enabled, true)
    assert.equal(store.conversation(item.conversationId).permissionMode, 'full')
    const claimed = store.startAutomationRun(item.id, true, new Date(2026, 7, 27, 12, 0))
    assert.ok(claimed?.runId)
    assert.equal(store.startAutomationRun(item.id, true), undefined)
    store.finishAutomationRun(item.id, claimed.runId, 'completed', 'OK', null)
    assert.equal(store.listAutomationRuns()[0].result, 'OK')
    assert.equal(store.listAutomations()[0].lastStatus, 'completed')
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})
