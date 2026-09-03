'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { appendArtifactPaths, artifactSnapshot, changedArtifacts, deliveryRequest, revisedDelivery, referencedExistingArtifacts, runWithDeliveryChecks } = require('../desktop/services/delivery.cjs')

test('acknowledged directions revise delivery without dropping unchanged requirements', () => {
  const excel = deliveryRequest('请导出 Excel')
  assert.deepEqual(revisedDelivery(excel, '请用中文回答'), excel)
  assert.deepEqual(revisedDelivery(excel, '不要生成文件，只文字回答'), { type: 'text', extensions: [] })
  assert.deepEqual(revisedDelivery(excel, '改为 CSV'), deliveryRequest('生成 CSV'))
  assert.ok(revisedDelivery(excel, '另外生成 PDF').extensions.includes('.xlsx'))
  assert.ok(revisedDelivery(excel, '另外生成 PDF').extensions.includes('.pdf'))
})

test('steered delivery verifies the new format, excludes untouched old files, and retains direction on retry', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-steered-delivery-'))
  try {
    const existing = path.join(root, 'old.csv'); writeFileSync(existing, 'old')
    const created = path.join(root, 'result.csv')
    const original = deliveryRequest('请生成 Excel')
    let current = original; let calls = 0
    const result = await runWithDeliveryChecks({
      workspace: root, delivery: original, prompt: '生成 Excel', getDelivery: () => current,
      getPrompt: () => '用户最新要求：改为 CSV',
      execute: async (prompt) => {
        calls += 1
        if (calls === 1) { current = revisedDelivery(original, '改为 CSV'); return '开始处理' }
        assert.match(prompt, /最新要求：改为 CSV/)
        writeFileSync(created, 'new'); return '已生成 CSV'
      },
    })
    assert.equal(calls, 2)
    assert.equal(result.status, 'completed')
    assert.deepEqual(result.artifacts, [created])
    calls = 0
    const text = await runWithDeliveryChecks({ workspace: root, delivery: original, prompt: 'test', getDelivery: () => ({ type: 'text', extensions: [] }), execute: async () => { calls++; return '按新要求，仅说明处理方法。' } })
    assert.equal(calls, 1)
    assert.equal(text.status, 'completed')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('delivery classifier keeps Q&A as text and gates explicit file creation', () => {
  assert.deepEqual(deliveryRequest('HTML 是什么？'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('怎么生成一个 HTML 页面？'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('你用这个 markdown 的数据做一个 html 吧'), { type: 'artifact', extensions: ['.html', '.htm'] })
  assert.deepEqual(deliveryRequest('请导出一份 Excel 工作簿'), { type: 'artifact', extensions: ['.xlsx', '.xls'] })
  assert.deepEqual(deliveryRequest('How to create an HTML page?'), { type: 'text', extensions: [] })
  assert.deepEqual(deliveryRequest('Please create an HTML page'), { type: 'artifact', extensions: ['.html', '.htm'] })
})

test('verified explicit reuse can deliver an unchanged file but never an unrelated old file', () => {
  const file = path.resolve('workspace', 'existing.xlsx')
  const before = new Map([[file, '123:100']])
  assert.deepEqual(referencedExistingArtifacts('已完成', before, before), [])
  assert.deepEqual(referencedExistingArtifacts(`计划复用已有文件，尚未检查\n${file}`, before, before), [])
  assert.deepEqual(referencedExistingArtifacts(`复用已有文件，已检查\n${file}.bak`, before, before), [])
  assert.deepEqual(referencedExistingArtifacts(`复用已有文件，已检查\n${file}`, before, before), [file])
})

test('dataset permission failure stops automatic retries and retains the explanation as failed delivery', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-blocked-'))
  try {
    let calls = 0
    const result = await runWithDeliveryChecks({ workspace: root, delivery: deliveryRequest('请导出 Excel'), prompt: 'test', execute: async () => { calls += 1; return 'FAIL_BIZ_04: 当前品牌无权访问该数据集；尚未生成 Excel。' } })
    assert.equal(calls, 1)
    assert.equal(result.status, 'failed')
    assert.match(result.answer, /FAIL_BIZ_04/)
    assert.match(result.answer, /平台管理员/)
    assert.deepEqual(result.artifacts, [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('missing input is preserved without retry; a plan still retries and never claims completion', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-input-'))
  try {
    let calls = 0
    const base = { workspace: root, delivery: deliveryRequest('请导出 Excel'), prompt: 'test' }
    const blocked = await runWithDeliveryChecks({ ...base, execute: async () => { calls += 1; return '请提供源文件再生成 Excel。' } })
    assert.equal(calls, 1)
    assert.equal(blocked.status, 'failed')
    calls = 0
    const unfinished = await runWithDeliveryChecks({ ...base, execute: async () => { calls += 1; return '我计划下一步生成文件。' } })
    assert.equal(calls, 3)
    assert.equal(unfinished.status, 'failed')
    assert.match(unfinished.answer, /我计划下一步/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('delivery accepts a verified existing file without modifying its timestamp or retrying', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-reuse-'))
  try {
    const file = path.join(root, 'existing.xlsx')
    writeFileSync(file, 'fixture')
    const before = artifactSnapshot(root, ['.xlsx'])
    let calls = 0
    const result = await runWithDeliveryChecks({ workspace: root, delivery: deliveryRequest('请导出 Excel'), prompt: 'test', execute: async () => { calls += 1; return `复用已有文件，已检查符合要求。\n${file}` } })
    assert.equal(calls, 1)
    assert.equal(result.status, 'completed')
    assert.deepEqual(result.reused, [file])
    assert.deepEqual(artifactSnapshot(root, ['.xlsx']), before)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a genuinely generated artifact succeeds even if the answer mentions a resolved earlier failure', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-created-'))
  try {
    const file = path.join(root, 'new.xlsx')
    const result = await runWithDeliveryChecks({ workspace: root, delivery: deliveryRequest('请导出 Excel'), prompt: 'test', execute: async () => { writeFileSync(file, 'fixture'); return '之前 FAIL_BIZ_04；按用户确认的来源完成文件。' } })
    assert.equal(result.status, 'completed')
    assert.deepEqual(result.artifacts, [file])
  } finally { rmSync(root, { recursive: true, force: true }) }
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
