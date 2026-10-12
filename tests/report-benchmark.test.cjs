'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const XLSX = require('xlsx')
const bench = require('../benchmarks/report-tasks/benchmark.cjs')

function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-benchmark-'))
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }) })
  return dir
}
function workbook(offset = 0, duplicate = false) {
  const headers = ['记录类型', '分类_品牌名'], values = ['明细', '测试品牌']
  bench.metrics.forEach((key, index) => { headers.push(key, key.split('_')[0] + '_月环比'); values.push(100 + index, (index - 7) / 100) })
  const rows = [...Array.from({ length: offset }, (_, index) => ['元数据' + index]), headers, ['汇总', '总计', ...values.slice(2)], values]
  if (duplicate) rows.push(values)
  return { SheetNames: [bench.sheetName], Sheets: { [bench.sheetName]: XLSX.utils.aoa_to_sheet(rows) } }
}
function expected() { return bench.extractOracle(workbook(6), '测试品牌') }
function correctFiles(dir, golden = expected()) {
  fs.writeFileSync(path.join(dir, 'report.html'), '<!doctype html><html><body><main>' + '报告测试内容'.repeat(100) + '</main></body></html>')
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(golden))
  return golden
}
const record = { status: 'completed', inputsUnchanged: true, performance: { durationMs: 300 } }
const fullReview = { evidence: 'manual-check.txt: test fixture evidence, not a model result', gates: bench.rubric.gates.map(() => true), scores: Object.fromEntries(bench.rubric.manual.map(row => [row.id, row.max])) }

test('oracle finds real headers at row 1 or 7 and uses brand detail once', () => {
  for (const offset of [0, 6]) {
    const value = bench.extractOracle(workbook(offset), '测试品牌')
    assert.equal(value.headerRow, offset + 1)
    assert.equal(value.dataRow, offset + 3)
    assert.equal(value.facts['全量_净G'].value, 100)
    assert.equal(value.facts['全量_订单量'].mom, -.06)
    assert.deepEqual(value.highlights.slice(0, 2), ['会员_净客单', '会员_MAC'])
    assert.deepEqual(value.issues.slice(0, 2), ['全量_净G', '全量_订单量'])
  }
  assert.throws(() => bench.extractOracle(workbook(0, true), '测试品牌'), /唯一/)
  assert.throws(() => bench.extractOracle(workbook(), '错误品牌'), /唯一/)
})

test('all correct machine results remain pending until evidenced manual review', t => {
  const dir = root(t), golden = correctFiles(dir)
  const pending = bench.evaluateCase(bench.suite.cases[0], record, dir, golden)
  assert.equal(pending.automatic, 50)
  assert.equal(pending.total, null)
  assert.equal(pending.passed, null)
  const reviewed = bench.evaluateCase(bench.suite.cases[0], record, dir, golden, fullReview, 'Tester')
  assert.equal(reviewed.total, 100)
  assert.equal(reviewed.passed, true)
  assert.equal(bench.evaluateCase(bench.suite.cases[0], record, dir, golden, { ...fullReview, evidence: '' }, 'Tester').total, null)
})

test('wrong metric, percent scale, brand, gates or changed source cannot pass', t => {
  const dir = root(t), golden = correctFiles(dir)
  const evaluate = (r = record, review = fullReview) => bench.evaluateCase(bench.suite.cases[0], r, dir, golden, review, 'Tester')
  for (const mutate of [value => value.facts['全量_净G'].value *= 2, value => value.facts['全量_净G'].mom *= 100, value => value.brand = '上一品牌']) {
    const actual = structuredClone(golden); mutate(actual)
    fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(actual))
    assert.equal(evaluate().passed, false)
  }
  correctFiles(dir)
  assert.equal(evaluate({ ...record, inputsUnchanged: false }).passed, false)
  assert.equal(evaluate(record, { ...fullReview, gates: [false, true, true, true] }).passed, false)
  assert.equal(bench.evaluateCase(bench.suite.cases.at(-1), record, dir, golden, fullReview, 'Tester').passed, false)
})

test('missing, failed and blocked cases are never silently excluded from aggregation', t => {
  const dir = root(t)
  bench.writeJSON(path.join(dir, 'run.json'), { id: 'test-only' })
  bench.writeJSON(path.join(dir, 'oracle.json'), { a: expected(), b: expected() })
  fs.mkdirSync(path.join(dir, 'cases'))
  let result = bench.score(dir)
  assert.equal(result.cases.length, 6)
  assert.equal(result.macroAverage, null)
  for (const item of bench.suite.cases) {
    const folder = path.join(dir, 'cases', item.id); fs.mkdirSync(folder)
    bench.writeJSON(path.join(folder, 'record.json'), { status: item.after ? 'blocked' : 'failed' })
  }
  result = bench.score(dir)
  assert.equal(result.macroAverage, 0)
  assert.equal(result.passRate, 0)
})

test('dry plan is read only and input hash changes are rejected', t => {
  const dir = root(t), data = path.join(dir, 'data'); fs.mkdirSync(data)
  for (const id of ['a', 'b']) fs.writeFileSync(path.join(data, id + '.xlsx'), 'hash-only fixture ' + id)
  bench.writeJSON(path.join(data, 'oracle.json'), Object.fromEntries(['a', 'b'].map(id => [id, { ...expected(), sha256: bench.hash(path.join(data, id + '.xlsx')) }])))
  const result = bench.plan(data)
  assert.equal(result.apiCalls, 0)
  assert.equal(result.status, 'not_run')
  assert.equal(result.cases.length, 6)
  assert.equal(fs.readdirSync(data).length, 3)
  fs.appendFileSync(path.join(data, 'a.xlsx'), 'changed')
  assert.throws(() => bench.plan(data), /已改变/)
})

test('live execution needs both explicit flags and a key; known argument paths parse safely', () => {
  assert.throws(() => bench.requireLive({}), /--live/)
  assert.throws(() => bench.requireLive({ live: true, 'allow-bash': true }, {}), /环境变量/)
  assert.doesNotThrow(() => bench.requireLive({ live: true, 'allow-bash': true }, { STABLE_BENCH_API_KEY: 'test-only' }))
  assert.equal(bench.options(['plan', '--data', 'D:/测试 数据']).data, 'D:/测试 数据')
})

test('snapshot excludes inputs and does not overwrite existing results', t => {
  const dir = root(t), workspace = path.join(dir, 'work'), target = path.join(dir, 'snapshot')
  fs.mkdirSync(workspace); fs.mkdirSync(path.join(workspace, 'input'))
  fs.writeFileSync(path.join(workspace, 'input', 'a.xlsx'), 'private input')
  fs.writeFileSync(path.join(workspace, 'report.html'), 'first')
  bench.snapshot(workspace, target)
  assert.equal(fs.existsSync(path.join(target, 'input')), false)
  fs.writeFileSync(path.join(workspace, 'report.html'), 'next')
  assert.equal(fs.readFileSync(path.join(target, 'report.html'), 'utf8'), 'first')
  assert.throws(() => bench.snapshot(workspace, target), /EEXIST/)
  assert.throws(() => bench.regularFile(target, '../work/report.html'), /超出/)
})
