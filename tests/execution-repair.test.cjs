'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-repair-'))
  const workspace = path.join(root, 'work'), outside = path.join(root, 'outside')
  fs.mkdirSync(workspace); fs.mkdirSync(outside)
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = { tool: (name, description, shape, handler) => ({ name, handler }), createSdkMcpServer: value => value }
  const review = {}
  const server = createClaudeTools({ sdk, workspace, review, requestApproval: async () => true, ...options })
  const invoke = async (name, args) => {
    const response = await server.tools.find(t => t.name === name).handler(args)
    if (response.isError) return { error: response.content[0].text }
    return JSON.parse(response.content[0].text)
  }
  return { root, workspace, outside, review, invoke }
}

test('bounded inspection paginates UTF-8 giant lines and JSON without losing content or following pointers through prototypes', async t => {
  const x = fixture(t, { sandboxMode: 'read-only' }), file = path.join(x.workspace, 'data.json')
  const value = { 'a/b~c': ['中文😀'.repeat(40000), null, 37], final: '结束' }
  const source = '\uFEFF' + JSON.stringify(value)
  fs.writeFileSync(file, source)
  let offset = 0, restored = '', pages = 0
  do {
    const result = await x.invoke('stable_inspect', { action: 'text', path: file, offset, bytes: 4096 })
    assert(!result.error, result.error); assert(result.bytes <= 4096)
    restored += result.text; offset = result.nextOffset; pages++
  } while (offset !== null)
  assert.equal(restored, source); assert(pages > 50)
  const preview = await x.invoke('stable_inspect', { action: 'json', path: file, pointer: '/a~1b~0c', limit: 2 })
  assert.equal(preview.length, 3); assert.equal(preview.nextOffset, 2)
  assert.equal(preview.entries[0].truncated, true); assert.equal(preview.entries[1].value, null)
  assert.equal((await x.invoke('stable_inspect', { action: 'json', path: file, pointer: '/a~1b~0c/2' })).value, 37)
  assert.match((await x.invoke('stable_inspect', { action: 'json', path: file, pointer: '/__proto__' })).error, /不存在/)
  assert.match((await x.invoke('stable_inspect', { action: 'text', path: file, bytes: 1 })).error, /4/)
  fs.writeFileSync(path.join(x.outside, 'private.txt'), 'PRIVATE')
  assert.match((await x.invoke('stable_inspect', { action: 'text', path: path.join(x.outside, 'private.txt') })).error, /超出/)
})

test('file enumeration keeps safe siblings available while explicitly excluding junctions and preserving pagination', async t => {
  const x = fixture(t)
  fs.writeFileSync(path.join(x.workspace, 'a.txt'), 'a'); fs.writeFileSync(path.join(x.workspace, 'z.txt'), 'z')
  fs.writeFileSync(path.join(x.outside, 'secret.txt'), 'secret')
  fs.symlinkSync(x.outside, path.join(x.workspace, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  const first = await x.invoke('stable_inspect', { action: 'list', path: '.', limit: 1 })
  assert.deepEqual(first.files, ['a.txt']); assert.equal(first.nextOffset, 1); assert.equal(first.complete, false)
  const second = await x.invoke('stable_inspect', { action: 'list', path: '.', limit: 1, offset: first.nextOffset })
  assert.deepEqual(second.files, ['z.txt']); assert.equal(second.nextOffset, null)
  assert.equal(second.excludedCount, 1); assert.equal(second.complete, false)
  assert.equal(second.excluded[0].reason, 'link-not-followed')
})

test('directory enumeration yields for cancellation, and JSON previews remain bounded for pathological keys', async t => {
  const x = fixture(t), controller = new AbortController()
  for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(x.workspace, `item-${i}.txt`), '')
  setImmediate(() => controller.abort())
  const { listFiles } = require('../desktop/services/local-inspection.cjs')
  await assert.rejects(listFiles({ path: x.workspace, pattern: '*.missing' }, { resolve: file => fs.realpathSync(file), signal: controller.signal }), /abort/i)
  const data = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['长'.repeat(1900) + i, '值'.repeat(10000)]))
  fs.writeFileSync(path.join(x.workspace, 'wide.json'), JSON.stringify(data))
  const result = await x.invoke('stable_inspect', { action: 'json', path: 'wide.json', limit: 100 })
  assert(Buffer.byteLength(JSON.stringify(result)) < 27000)
  assert(result.nextOffset > 0 && result.nextOffset < 100)
  assert(result.entries.every(e => e.keyTruncated && e.truncated))
})

test('limited delivery requires trusted user permission and cannot reclassify functional or measured defects', async t => {
  const basis = '当数据不足时，说明缺失信息，绝不编造数据。'
  const builtinTools = { execute: async () => ({ tabId: 't', epoch: 1, viewport: { width: 390 }, typography: { candidates: [{ label: 'title', lineCharacters: [4, 1] }] } }), cancel() {} }
  const x = fixture(t, { userInstructions: basis, builtinTools })
  const update = { check: '城市源表与汇总范围差额', category: 'data', status: 'limited', limitationBasis: basis, note: '明细未覆盖总额，已披露差额，不声称完成全量归因。' }
  const accepted = await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [update] })
  assert(!accepted.error, accepted.error); assert.equal(x.review.incomplete(), ''); assert.match(x.review.limitations(), /差额/)
  await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [{ check: '键盘操作', status: 'blocked', note: '尚未实测' }] })
  assert.match((await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [{ ...update, check: '键盘操作' }] })).error, /不能/)
  assert.match((await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [{ check: '键盘操作', category: 'data', status: 'open', note: '试图改类' }] })).error, /不能/)
  assert.match(x.review.incomplete(), /键盘/)
  const measured = await x.invoke('stable_browser', { action: 'audit', tabId: 't' })
  const risk = measured.reviewNotebook.checks.find(c => c.source)
  assert.match((await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [{ ...update, check: risk.check }] })).error, /不能/)
  const untrusted = fixture(t, { builtinTools })
  assert.match((await untrusted.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [update] })).error, /用户明确/)
})

test('same-document anchor batching refreshes labels; reloads, cross-page and unproved navigation still stop', async () => {
  const { runBrowserBatch } = require('../desktop/services/claude-browser-batch.cjs')
  for (const mode of ['anchor', 'reload', 'other-page', 'no-document-proof']) {
    let view = { url: 'https://example.test/page', epoch: 1, documentEpoch: mode === 'no-document-proof' ? undefined : 1, controls: [{ label: '经营亮点', ref: 'old' }] }, count = 0
    const result = await runBrowserBatch({ tabId: 't', steps: [{ action: 'click', label: '经营亮点' }, { action: 'click', label: '经营亮点' }] }, {
      view: () => view, invoke: async args => {
        count++
        if (count === 2) assert.equal(args.ref, 'fresh')
        view = { ...view, epoch: 2, documentEpoch: mode === 'reload' ? 2 : view.documentEpoch,
          url: mode === 'other-page' ? 'https://example.test/other' : mode === 'reload' ? view.url : 'https://example.test/page#highlights', controls: [{ label: '经营亮点', ref: 'fresh' }] }
        return { content: [{ type: 'text', text: JSON.stringify(view) }] }
      },
    })
    assert.equal(count, mode === 'anchor' ? 2 : 1)
    assert.equal(Boolean(result.isError), mode !== 'anchor')
  }
})

test('data limitations are disclosed but never satisfy missing artifacts or incomplete required checks', async t => {
  const x = fixture(t), { runWithDeliveryChecks, deliveryRequest } = require('../desktop/services/delivery.cjs')
  const base = { workspace: x.workspace, prompt: 'report', execute: async () => '已有报告', maxAttempts: 1,
    getExecutionOutcome: () => ({ status: 'completed_with_limitations', limitations: '城市原始数据缺失' }) }
  const complete = await runWithDeliveryChecks({ ...base, delivery: { type: 'text', extensions: [] } })
  assert.equal(complete.status, 'completed'); assert.match(complete.answer, /城市原始数据缺失/)
  const missing = await runWithDeliveryChecks({ ...base, delivery: deliveryRequest('生成 HTML 报告') })
  assert.equal(missing.status, 'failed')
  const blocked = await runWithDeliveryChecks({ ...base, delivery: { type: 'text', extensions: [] }, getExecutionOutcome: () => ({ status: 'incomplete', reason: '键盘未验收', limitations: '城市原始数据缺失' }) })
  assert.equal(blocked.status, 'failed'); assert.match(blocked.reason, /键盘/)
})

test('isolated Python imports sibling modules after standard library even with inspect.py/json.py collisions', { skip: process.platform !== 'win32' }, t => {
  const x = fixture(t), { bundledPython, pythonGuidance } = require('../desktop/services/claude-python.cjs')
  const python = bundledPython(); assert(python)
  const bootstrap = pythonGuidance(python).match(/```python\n([\s\S]*?)\n```/)[1]
  for (const name of ['inspect', 'json']) fs.writeFileSync(path.join(x.workspace, name + '.py'), 'raise RuntimeError("SHADOWED_STDLIB")\n')
  fs.writeFileSync(path.join(x.workspace, 'charts_fixture.py'), 'VALUE = 42\n')
  const script = path.join(x.workspace, 'main.py')
  fs.writeFileSync(script, bootstrap + '\nimport inspect, json, openpyxl, charts_fixture\nassert charts_fixture.VALUE == 42\nassert inspect.isfunction(lambda: 1)\nprint(json.dumps({"ok": True}))\n')
  const result = require('node:child_process').spawnSync(python, ['-I', '-X', 'utf8', script], { cwd: x.workspace, windowsHide: true, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /"ok": true/)
})

test('existing Excel reader preserves duplicate columns, empty sheets and null cells without manufacturing zeroes', async t => {
  const x = fixture(t), { executeExcel } = require('../desktop/services/excel-tool.cjs')
  const dependencyRoot = path.resolve(__dirname, '../vendor/agent-tools')
  const invoke = args => executeExcel({ workspace: x.workspace, dependencyRoot, args })
  await invoke({ action: 'create', output: 'source.xlsx', sheets: [{ name: '空表', rows: [] }, { name: '重复表头', rows: [['城市', '营收', '营收'], ['甲', null, 7]] }] })
  const empty = await invoke({ action: 'read', path: 'source.xlsx', sheet: '空表' })
  assert.deepEqual(empty.rows, [])
  const data = await invoke({ action: 'read', path: 'source.xlsx', sheet: '重复表头' })
  assert.deepEqual(data.rows.map(r => r.values), [['城市', '营收', '营收'], ['甲', null, 7]])
})
