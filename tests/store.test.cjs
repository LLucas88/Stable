'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { DatabaseSync } = require('node:sqlite')
const { StableStore, DEFAULT_IDENTITY } = require('../desktop/services/store.cjs')

test('store persists resources, retrieval, workflow and messages', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-store-'))
  const store = new StableStore(root)
  try {
    assert.equal(store.getSetting('identity'), DEFAULT_IDENTITY)
    assert.equal(store.getSetting('theme'), 'dark')
    store.setSetting('theme', 'light')
    assert.equal(store.getSetting('theme'), 'light')
    const dataId = store.upsertData({ name: 'weekly.md', type: 'md', path: 'C:\\weekly.md', size: 42, text: '会员复购率需要提升，先观察第二单。' })
    assert.equal(store.listData().length, 1)
    assert.equal(store.retrieveData('复购率 第二单')[0].name, 'weekly.md')
    store.setDataEnabled(dataId, false)
    assert.equal(store.retrieveData('复购率').length, 0)

    const knowledgeId = store.addKnowledge({ name: '会员运营.md', path: 'C:\\Stable\\knowledge.md', size: 64, content: '# 会员运营\n先分析第二单转化，再设计复购实验。', summary: '会员运营方法' })
    assert.equal(store.listKnowledge()[0].name, '会员运营.md')
    assert.match(store.retrieveKnowledge('怎么分析会员第二单转化')[0].excerpt, /第二单转化/)
    store.setKnowledgeEnabled(knowledgeId, false)
    assert.equal(store.retrieveKnowledge('第二单转化').length, 0)
    assert.equal(store.removeKnowledge(knowledgeId).id, knowledgeId)

    const weeklySkillId = store.upsertSkill({ name: 'weekly-review', description: '会员周复盘', path: 'C:\\Stable\\skills\\weekly-review', content: '# 周复盘\n分析会员复购和第二单。' })
    assert.equal(store.retrieveSkills('请使用 weekly-review skill')[0].name, 'weekly-review')
    store.setSkillEnabled(weeklySkillId, false)
    assert.equal(store.retrieveSkills('weekly-review').length, 0)

    const reportId = store.saveReport({ name: '周报', path: 'C:\\Stable\\reports\\weekly.html', mode: 'builder', components: [{ id: 'title', type: 'text', variant: 'title', content: '周报' }], html: '<!doctype html><h1>周报</h1>' })
    assert.equal(store.listReports()[0].name, '周报')
    assert.equal(store.reportItem(reportId).components[0].content, '周报')

    const libraryId = store.addLibraryItem({ category: 'collection', kind: 'script', name: 'collect.cmd', description: 'CMD 脚本', path: 'C:\\Stable\\collect.cmd', extension: 'cmd', content: '' })
    assert.equal(store.listLibrary('collection')[0].name, 'collect.cmd')
    store.renameLibraryItem(libraryId, '每日会员采集')
    assert.equal(store.libraryItem(libraryId).name, '每日会员采集')
    assert.equal(store.libraryItem(libraryId).path, 'C:\\Stable\\collect.cmd')
    store.updateLibraryPath(libraryId, 'C:\\Stable\\data-library\\collection\\collect.cmd')
    assert.equal(store.libraryItem(libraryId).name, '每日会员采集')
    assert.equal(store.libraryItem(libraryId).path, 'C:\\Stable\\data-library\\collection\\collect.cmd')
    store.setLibraryRunResult(libraryId, 'completed', 'SCRIPT_OK')
    assert.equal(store.libraryItem(libraryId).lastOutput, 'SCRIPT_OK')
    store.saveMarkdown(libraryId, '# 说明', '说明')
    assert.equal(store.libraryItem(libraryId).content, '# 说明')

    const skillId = store.upsertSkill({ name: 'crm', description: 'CRM 分析', path: 'C:\\skills\\crm', content: '# CRM' })
    assert.equal(store.skillContent('crm').name, 'crm')
    store.setSkillEnabled(skillId, false)
    assert.equal(store.skillContent('crm'), undefined)

    const workflowId = store.saveWorkflow({ name: '周报', description: '生成周报', nodes: [
      { id: 'ai-1', type: 'ai', title: '生成', instruction: '写周报', position: { x: 80, y: 80 } },
      { id: 'out-1', type: 'output', title: '输出', outputName: '周报', position: { x: 380, y: 80 } },
    ], edges: [{ id: 'edge-1', source: 'ai-1', target: 'out-1' }] })
    assert.equal(store.workflow(workflowId).nodes[0].instruction, '写周报')
    assert.equal(store.workflow(workflowId).edges[0].target, 'out-1')
    const firstConversationId = store.activeConversationId()
    store.addMessage(firstConversationId, 'user', '开始', undefined, [
      { kind: 'attachment', name: '经营数据.xlsx', size: 2048, type: 'xlsx', path: 'C:\\source\\经营数据.xlsx', text: '不应保存' },
      { kind: 'data', id: 'data-1', name: '会员数据', size: 1024, type: 'xlsx', path: 'C:\\secret\\会员.xlsx', text: '不应保存' },
    ])
    store.addMessage(firstConversationId, 'assistant', '已开始', [{ id: 'context', runId: 'run-1', kind: 'context', title: '准备上下文', status: 'completed', time: 1 }])
    assert.deepEqual(store.listMessages().map((item) => item.role), ['user', 'assistant'])
    assert.deepEqual(store.listMessages()[0].attachments, [
      { kind: 'attachment', name: '经营数据.xlsx', size: 2048, type: 'xlsx', path: 'C:\\source\\经营数据.xlsx' },
      { kind: 'data', name: '会员数据', size: 1024, type: 'xlsx', id: 'data-1' },
    ])
    assert.equal(store.listMessages()[1].trace[0].title, '准备上下文')
    assert.equal(store.conversation(firstConversationId).title, '开始')

    const secondConversationId = store.createConversation()
    store.addMessage(secondConversationId, 'user', '分析第二份任务')
    store.updateConversationContext(secondConversationId, 'analysis', [dataId])
    store.updateConversationPermission(secondConversationId, 'auto')
    assert.deepEqual(store.listMessages(secondConversationId).map((item) => item.content), ['分析第二份任务'])
    assert.deepEqual(store.listMessages(firstConversationId).map((item) => item.role), ['user', 'assistant'])
    assert.equal(store.conversation(secondConversationId).capability, 'analysis')
    assert.equal(store.conversation(secondConversationId).permissionMode, 'auto')
    assert.equal(store.conversation(secondConversationId).collaboration, undefined)
    assert.deepEqual(store.conversation(secondConversationId).dataIds, [dataId])
    store.selectConversation(firstConversationId)
    assert.equal(store.activeConversationId(), firstConversationId)
    const runId = store.startRun('agent', null, '开始')
    store.finishRun(runId, 'completed', '完成', null)
    assert.equal(store.recentRuns(1)[0].status, 'completed')
    store.saveTeamProfile({ teamId: 'team-1', teamName: '运营团队', deviceId: 'device-a' })
    store.replaceTeamDevices([{ id: 'device-a', name: '设备 A', role: 'owner', capabilities: { skills: ['crm'] } }])
    assert.equal(store.teamProfile().teamName, '运营团队')
    assert.equal(store.listTeamDevices()[0].status, 'online')
    store.saveTeamTask({ id: 'task-1', direction: 'outbound', sourceDeviceId: 'device-a', targetDeviceId: 'device-b', sourceConversationId: firstConversationId, title: '远端分析', instruction: '生成摘要', context: { mode: 'minimal' }, status: 'waiting_approval' })
    store.addTeamEvent('task-1', 'created', '已发送')
    store.updateTeamTask('task-1', 'success', { result: '完成' })
    assert.equal(store.teamTask('task-1').result, '完成')
    assert.equal(store.teamTask('task-1').events[0].detail, '已发送')
    assert.equal(store.removeLibraryItem(libraryId).id, libraryId)
    assert.equal(store.removeReport(reportId).id, reportId)
  } finally {
    store.close()
    const reopened = new StableStore(root)
    assert.equal(reopened.getSetting('theme'), 'light')
    reopened.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy messages migrate into one isolated history conversation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-store-legacy-'))
  const database = new DatabaseSync(path.join(root, 'stable.db'))
  database.exec(`
    CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, trace_json TEXT, created_at TEXT NOT NULL);
    INSERT INTO messages(id,role,content,trace_json,created_at) VALUES('old-1','user','旧任务',NULL,'2026-08-01T00:00:00.000Z');
  `)
  database.close()
  const store = new StableStore(root)
  try {
    assert.equal(store.listConversations().length, 1)
    assert.equal(store.listConversations()[0].title, '历史对话 1')
    assert.equal(store.listConversations()[0].collaboration, undefined)
    assert.equal(store.listMessages()[0].content, '旧任务')
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('renamed script display name persists without changing its executable path', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-store-rename-'))
  const scriptPath = 'C:\\Stable\\collection\\start.cmd'
  let store = new StableStore(root)
  try {
    const id = store.addLibraryItem({ category: 'collection', kind: 'script', name: 'start.cmd', description: 'CMD 脚本', path: scriptPath, extension: 'cmd', content: '' })
    store.renameLibraryItem(id, '会员日报采集')
    store.close()
    store = new StableStore(root)
    assert.equal(store.libraryItem(id).name, '会员日报采集')
    assert.equal(store.libraryItem(id).path, scriptPath)
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('startup recovery clears stale running script, workflow and run-log states', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-store-recovery-'))
  const store = new StableStore(root)
  try {
    const libraryId = store.addLibraryItem({ category: 'processing', kind: 'script', name: 'wait.cmd', description: '', path: 'C:\\Stable\\wait.cmd', extension: 'cmd', content: '' })
    store.setLibraryRunResult(libraryId, 'running', '')
    const workflowId = store.saveWorkflow({ name: '等待流程', description: '', nodes: [], edges: [] })
    store.setWorkflowResult(workflowId, 'running', '')
    store.startRun('workflow', workflowId, '等待流程')
    store.recoverInterruptedRuns()
    assert.equal(store.libraryItem(libraryId).lastStatus, 'cancelled')
    assert.equal(store.listWorkflows()[0].lastStatus, 'cancelled')
    assert.equal(store.recentRuns(1)[0].status, 'cancelled')
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})
