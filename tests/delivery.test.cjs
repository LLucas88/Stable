'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { appendArtifactPaths, artifactSnapshot, changedArtifacts, deliveryRequest } = require('../desktop/services/delivery.cjs')

test('delivery classifier keeps Q&A as text and gates explicit file creation', () => {
  assert.deepEqual(deliveryRequest('HTML 是什么？'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('怎么生成一个 HTML 页面？'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('你用这个 markdown 的数据做一个 html 吧'), { type: 'artifact', extensions: ['.html', '.htm'] })
  assert.deepEqual(deliveryRequest('请导出一份 Excel 工作簿'), { type: 'artifact', extensions: ['.xlsx', '.xls'] })
  assert.deepEqual(deliveryRequest('How to create an HTML page?'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('Please create an HTML page'), { type: 'artifact', extensions: ['.html', '.htm'] })
})

test('delivery verifier reports only new or modified target artifacts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-delivery-'))
  try {
    mkdirSync(path.join(root, 'outputs'))
    const existing = path.join(root, 'outputs', 'existing.html')
    writeFileSync(existing, '<h1>before</h1>')
    const before = artifactSnapshot(root, ['.html'])
    const created = path.join(root, 'outputs', 'result.html')
    writeFileSync(created, '<h1>result</h1>')
    const changed = changedArtifacts(before, artifactSnapshot(root, ['.html']))
    assert.deepEqual(changed, [created])
    assert.match(appendArtifactPaths('已完成。', changed), new RegExp(created.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
