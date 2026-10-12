'use strict'

const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../..')
const suite = require('./suite.json'), rubric = require('./rubric.json')
const metrics = ['全量', '新客', '老客', '会员'].flatMap(group => ['净G', '订单量', 'MAC', '净客单'].map(name => `${group}_${name}`))
const sheetName = 'T2-经营概览-品牌汇总'
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }
function regularFile(root, name) {
  const file = path.resolve(root, name)
  if (!inside(path.resolve(root), file) || !inside(fs.realpathSync(root), fs.realpathSync(file)) || !fs.statSync(file).isFile()) throw Error('文件超出目录或不是普通文件：' + name)
  return file
}
function oracle(file, brand) {
  const XLSX = require('xlsx')
  const workbook = XLSX.readFile(file, { cellDates: false })
  return { ...extractOracle(workbook, brand), sha256: hash(file) }
}
function extractOracle(workbook, brand) {
  const XLSX = require('xlsx')
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw Error('缺少 ' + sheetName)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, range: 0 })
  const header = rows.findIndex(row => row[0] === '记录类型' && row.includes('全量_净G'))
  if (header < 0) throw Error('未找到真实表头')
  const brandColumn = rows[header].indexOf('分类_品牌名')
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => index > header && row[0] === '明细' && row[brandColumn] === brand)
  if (matches.length !== 1) throw Error('品牌明细必须唯一，不能把汇总和明细重复相加')
  const { row, index } = matches[0], facts = {}
  for (const key of metrics) {
    const column = rows[header].indexOf(key)
    if (column < 0 || !String(rows[header][column + 1]).endsWith('_月环比') || !Number.isFinite(row[column]) || !Number.isFinite(row[column + 1])) throw Error('指标或相邻环比无效：' + key)
    facts[key] = { value: row[column], mom: row[column + 1], cell: XLSX.utils.encode_cell({ r: index, c: column }), momCell: XLSX.utils.encode_cell({ r: index, c: column + 1 }) }
  }
  const rank = positive => metrics.filter(key => positive ? facts[key].mom > 0 : facts[key].mom < 0).sort((a, b) => positive ? facts[b].mom - facts[a].mom : facts[a].mom - facts[b].mom).slice(0, 5)
  return { brand, sheet: sheetName, headerRow: header + 1, dataRow: index + 1, facts, highlights: rank(true), issues: rank(false), sheets: workbook.SheetNames.map(name => ({ name, range: workbook.Sheets[name]['!ref'] || null })) }
}
function prepare(sources, target) {
  if (fs.existsSync(target)) throw Error('数据快照目录已存在，请使用新目录，避免覆盖基准')
  const captured = Object.fromEntries(['a', 'b'].map(id => {
    const source = sources[id]
    if (!source?.path || !source.brand) throw Error('缺少数据源 ' + id)
    return [id, oracle(source.path, source.brand)]
  }))
  fs.mkdirSync(target, { recursive: true })
  for (const id of ['a', 'b']) fs.copyFileSync(sources[id].path, path.join(target, id + '.xlsx'), fs.constants.COPYFILE_EXCL)
  writeJSON(path.join(target, 'oracle.json'), captured)
  writeJSON(path.join(target, 'provenance.json'), { createdAt: new Date().toISOString(), sources, sha256: Object.fromEntries(Object.entries(captured).map(([id, value]) => [id, value.sha256])) })
  return captured
}
function checkData(data) {
  const expected = readJSON(regularFile(data, 'oracle.json'))
  for (const id of ['a', 'b']) if (hash(regularFile(data, id + '.xlsx')) !== expected[id]?.sha256) throw Error('数据快照已改变：' + id)
  return expected
}
function contract(item, brand) {
  return `${item.prompt}\n\n本轮数据：input/${item.dataset}.xlsx；品牌：${brand}。初次生成时遵循 brief.md，后续修改保留未要求改变的内容。\n`
    + '交付 report.html，可使用相对路径本地资源；不要改写输入工作簿。报告目录、卡片和交互遵循 brief.md。\n'
    + `为 benchmark 校验另外保存 metrics.json，此文件不显示在报告页面：{brand, sheet:${JSON.stringify(sheetName)}, facts:{指标名:{value,mom,cell,momCell}}, highlights:[指标名], issues:[指标名]}。\n`
    + `facts 必须包含 ${metrics.join('、')}，使用原始单位与小数比例（8.29% 写 0.0829），cell/momCell 为所取品牌明细单元格。不可把汇总与明细相加，同名月环比列与左边指标配对。\n`
    + 'highlights/issues 分别是这 16 项中正增长按涨幅、负增长按跌幅排序的前 5 项（不足 5 项全部返回）。报告可分析其他指标，JSON 只用于统一核对，不能代替页面展示。'
}
function reviewTemplate() {
  return { reviewer: '', cases: Object.fromEntries(suite.cases.map(item => [item.id, { evidence: '', gates: rubric.gates.map(() => null), scores: Object.fromEntries(rubric.manual.map(row => [row.id, null])) }])) }
}
function plan(data, config = {}) {
  const expected = checkData(data)
  return { status: 'not_run', apiCalls: 0, suite: suite.version, model: config.model || null, cases: suite.cases.map(item => ({ ...item, inputSha256: expected[item.dataset].sha256, prompt: contract(item, expected[item.dataset].brand), output: ['report.html', 'metrics.json'] })), contextRegression: suite.contextRegression }
}
function readArtifact(directory, name) { const file = regularFile(directory, name); if (fs.statSync(file).size > 20_000_000) throw Error('文件超过评分读取上限'); return fs.readFileSync(file, 'utf8') }
function evaluateCase(item, record, directory, expected, review, reviewer) {
  if (!record) return { id: item.id, state: 'not_run', automatic: null, manual: null, total: null, passed: null }
  if (record.status !== 'completed') return { id: item.id, state: record.status, automatic: 0, manual: 0, total: 0, passed: false, reason: record.error || null }
  const checks = [], add = (name, passed, points) => { checks.push({ name, passed: Boolean(passed), points: passed ? points : 0, max: points }); return passed }
  let html = '', actual
  try { html = readArtifact(directory, 'report.html') } catch {}
  try { actual = JSON.parse(readArtifact(directory, 'metrics.json')) } catch {}
  add('HTML 文件存在且包含非空内容（不等于浏览器已验收）', html.length > 300 && /<(?:html|body|main|section|div)\b/i.test(html), 5)
  add('JSON 品牌、工作表、16 项指标完整', actual?.brand === expected.brand && actual?.sheet === expected.sheet && metrics.every(key => actual?.facts?.[key]), 5)
  let numeric = 0, sources = 0
  for (const key of metrics) {
    const fact = expected.facts[key], result = actual?.facts?.[key]
    for (const field of ['value', 'mom']) {
      const correct = Number.isFinite(result?.[field]) && Math.abs(result[field] - fact[field]) <= (field === 'mom' ? 0.000001 : Math.max(0.000001, Math.abs(fact[field]) * 1e-8))
      checks.push({ name: key + '.' + field, passed: correct, actual: result?.[field] ?? null, expected: fact[field] })
      numeric += Number(correct)
    }
    sources += Number(result?.cell === fact.cell && result?.momCell === fact.momCell)
  }
  const factPoints = 30 * numeric / (metrics.length * 2), sourcePoints = 5 * sources / metrics.length
  const ranked = ['highlights', 'issues'].every(key => JSON.stringify(actual?.[key]) === JSON.stringify(expected[key]))
  add('涨跌幅前 5 项排序', ranked, 5)
  const automatic = Math.round((checks.reduce((sum, check) => sum + (check.points || 0), 0) + factPoints + sourcePoints) * 100) / 100
  const reviewed = Boolean(reviewer?.trim() && review?.evidence?.trim() && review?.gates?.length === rubric.gates.length && review.gates.every(value => typeof value === 'boolean') && rubric.manual.every(row => Number.isFinite(review?.scores?.[row.id]) && review.scores[row.id] >= 0 && review.scores[row.id] <= row.max))
  const manual = reviewed ? rubric.manual.reduce((sum, row) => sum + review.scores[row.id], 0) : null
  const hardPass = record.inputsUnchanged === true && (item.id !== 'resume-b' || record.checkpointInterrupted === true) && numeric === metrics.length * 2 && actual?.brand === expected.brand && html.length > 300
  const total = reviewed ? Math.round((automatic + manual) * 100) / 100 : null
  return { id: item.id, state: reviewed ? 'reviewed' : 'needs_review', automatic, manual, total, passed: reviewed ? hardPass && review.gates.every(Boolean) && total >= rubric.passThreshold : null, hardPass, checks, numeric: { correct: numeric, total: metrics.length * 2, points: factPoints }, sources: { correct: sources, total: metrics.length, points: sourcePoints }, performance: record.performance, evidence: review?.evidence || null }
}
function score(run, review = {}) {
  const manifest = readJSON(regularFile(run, 'run.json'))
  const expected = readJSON(regularFile(run, 'oracle.json'))
  const result = suite.cases.map(item => {
    const folder = path.join(run, 'cases', item.id)
    let record
    try { record = readJSON(regularFile(folder, 'record.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    return evaluateCase(item, record, path.join(folder, 'artifacts'), expected[item.dataset], review.cases?.[item.id], review.reviewer)
  })
  const complete = result.every(row => row.total !== null)
  return { runId: manifest.id, suite: suite.version, status: complete ? 'reviewed' : 'incomplete', cases: result, macroAverage: complete ? Math.round(result.reduce((sum, row) => sum + row.total, 0) / result.length * 100) / 100 : null, passRate: complete ? result.filter(row => row.passed).length / result.length : null, billingCost: null }
}
function snapshot(source, target) {
  fs.mkdirSync(target)
  let bytes = 0, files = 0
  const visit = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (['input', '.git', 'node_modules'].includes(entry.name)) continue
      const sourceFile = path.join(from, entry.name), targetFile = path.join(to, entry.name)
      if (entry.isSymbolicLink()) throw Error('输出中含链接，拒绝跟随：' + entry.name)
      if (entry.isDirectory()) { fs.mkdirSync(targetFile); visit(sourceFile, targetFile) }
      else if (entry.isFile()) {
        bytes += fs.statSync(sourceFile).size
        if (++files > 2000 || bytes > 100_000_000) throw Error('输出快照超过 2000 个文件或 100MB')
        fs.copyFileSync(sourceFile, targetFile, fs.constants.COPYFILE_EXCL)
      }
    }
  }
  visit(source, target)
}
function options(argv) {
  const result = { command: argv[0] || 'help' }
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw Error('参数需要使用 --name value')
    const name = argv[i].slice(2)
    result[name] = ['live', 'allow-bash'].includes(name) ? true : argv[++i]
    if (result[name] === undefined) throw Error('参数缺少值：' + name)
  }
  return result
}
function requireLive(args, env = process.env) {
  if (!args.live || !args['allow-bash']) throw Error('真实运行必须显式指定 --live --allow-bash；prepare、plan、score 不调用 API')
  if (!env.STABLE_BENCH_API_KEY) throw Error('缺少 STABLE_BENCH_API_KEY 环境变量')
}
async function main() {
  const args = options(process.argv.slice(2))
  const resolve = name => { if (!args[name]) throw Error('缺少 --' + name); return path.resolve(args[name]) }
  if (args.command === 'prepare') {
    const result = prepare(readJSON(resolve('sources')), resolve('data'))
    console.log(JSON.stringify({ status: 'prepared', data: resolve('data'), inputs: Object.fromEntries(Object.entries(result).map(([id, item]) => [id, { sha256: item.sha256, headerRow: item.headerRow, metrics: Object.keys(item.facts).length }])) }, null, 2))
  } else if (args.command === 'plan') {
    const result = plan(resolve('data'), args.config ? readJSON(resolve('config')) : {})
    if (args.output) writeJSON(resolve('output'), result)
    console.log(JSON.stringify({ status: result.status, apiCalls: 0, cases: result.cases.map(item => item.id), output: args.output || null }, null, 2))
  } else if (args.command === 'score') {
    const result = score(resolve('run'), args.review ? readJSON(resolve('review')) : {})
    if (args.output) writeJSON(resolve('output'), result)
    console.log(JSON.stringify(result, null, 2))
  } else if (args.command === 'run') {
    requireLive(args)
    checkData(resolve('data'))
    const run = resolve('run')
    if (fs.existsSync(run)) throw Error('run 目录已存在；每次使用新目录，不覆盖结果')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawnSync(require('electron'), [path.join(__dirname, 'run.cjs'), '--data', resolve('data'), '--config', resolve('config'), '--run', run, '--live', '--allow-bash'], { cwd: repo, env, stdio: 'inherit', windowsHide: true })
    if (child.error) throw child.error
    process.exitCode = child.status ?? 1
  } else if (args.command === 'context-check') {
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=automatically compacts', 'tests/claude-sdk-integration.cjs'], { cwd: repo, encoding: 'utf8', windowsHide: true })
    const output = { type: 'local-sdk-fixture', realApiCalls: 0, passed: result.status === 0, stdout: result.stdout, stderr: result.stderr }
    if (args.output) writeJSON(resolve('output'), output)
    console.log(JSON.stringify({ type: output.type, realApiCalls: 0, passed: output.passed, output: args.output || null }))
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } else console.log('Commands: prepare --sources FILE --data NEW_DIR | plan --data DIR [--config FILE] [--output FILE] | run --data DIR --config FILE --run NEW_DIR --live --allow-bash | score --run DIR [--review FILE] [--output NEW_FILE] | context-check [--output NEW_FILE]')
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { repo, suite, rubric, metrics, sheetName, readJSON, writeJSON, hash, regularFile, oracle, extractOracle, prepare, checkData, contract, plan, reviewTemplate, evaluateCase, score, snapshot, options, requireLive }
