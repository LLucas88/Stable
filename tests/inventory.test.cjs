'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { asksForWorkbenchInventory, buildWorkbenchInventory, requestedWorkbenchAction, workbenchInventoryAnswer } = require('../desktop/services/inventory.cjs')

test('workbench inventory lists every local asset class without exposing the storage root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-inventory-'))
  try {
    mkdirSync(path.join(root, 'outputs'))
    writeFileSync(path.join(root, 'outputs', '周报.md'), '# 周报')
    const inventory = buildWorkbenchInventory({
      data: [{ name: '会员经营.xlsx', enabled: true }],
      library: [{ name: '每日会员采集', category: 'collection', lastStatus: 'completed' }],
      knowledge: [{ name: '方法.md', enabled: true }], skills: [{ name: '分析', enabled: false }],
      workflows: [{ name: '周报流程', lastStatus: null }], reports: [{ name: '月报', mode: 'builder' }], workspace: root,
    })
    assert.match(inventory, /会员经营\.xlsx（已启用）/)
    assert.match(inventory, /每日会员采集（数据采集 · 已完成）/)
    assert.match(inventory, /outputs[\\/]周报\.md（文件）/)
    assert.doesNotMatch(inventory, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(asksForWorkbenchInventory('我现在本地的工作台内容都有哪些？'), true)
    assert.equal(asksForWorkbenchInventory('工作区有没有数据清洗脚本？'), true)
    assert.equal(asksForWorkbenchInventory('分析本地数据的会员趋势'), false)
    const answer = workbenchInventoryAnswer(inventory)
    assert.match(answer, /名称与状态清单/)
    assert.doesNotMatch(answer, /stable-inventory-/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Stable resolves explicit native resource calls by saved name or a unique category', () => {
  const resources = {
    library: [
      { id: 'collect', name: '每日会员采集', kind: 'script', category: 'collection' },
      { id: 'clean', name: '会员经营情况', kind: 'script', category: 'cleaning' },
    ],
    workflows: [{ id: 'weekly', name: '周报流程' }],
    skills: [{ id: 'crm', name: '会员分析', enabled: true }],
  }
  assert.equal(requestedWorkbenchAction('运行会员经营情况', resources).item.id, 'clean')
  assert.equal(requestedWorkbenchAction('调用数据清洗脚本处理数据', resources).item.id, 'clean')
  assert.equal(requestedWorkbenchAction('执行周报流程', resources).type, 'workflow')
  assert.equal(requestedWorkbenchAction('使用会员分析 Skill', resources).type, 'skill')
  assert.equal(requestedWorkbenchAction('工作区有没有数据清洗脚本', resources), null)
})
