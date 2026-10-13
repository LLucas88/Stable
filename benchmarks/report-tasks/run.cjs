'use strict'

// Launched only by the explicit `run --live --allow-bash` command. All browser
// windows use Stable's existing browser service with hidden capture hosts.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { spawnSync } = require('node:child_process')
const bench = require('./benchmark.cjs')
const { requestBudget } = require('./request-budget.cjs')
const args = bench.options(['run', ...process.argv.slice(2)])
bench.requireLive(args)
const run = path.resolve(args.run), data = path.resolve(args.data)
const config = bench.readJSON(path.resolve(args.config))
const expected = bench.checkData(data)
if (fs.existsSync(run)) throw Error('run 目录已经存在')
const model = Object.fromEntries(['providerId', 'model', 'baseURL', 'contextWindow', 'maxOutputTokens', 'reasoningSelection'].filter(key => config.model?.[key] !== undefined).map(key => [key, config.model[key]]))
const endpoint = new URL(model.baseURL)
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !model.model) throw Error('模型配置必须包含实际模型 ID 与无凭据的 HTTPS baseURL')
const timeout = config.timeoutMs ?? 1200000, maxRequests = config.maxRequestsPerCase ?? 60
if (!Number.isSafeInteger(timeout) || timeout < 1000 || !Number.isSafeInteger(maxRequests) || maxRequests < 1) throw Error('超时和请求上限必须是正整数')
const skills = (config.skills || []).map(skill => ({ name: String(skill.name), path: fs.realpathSync(skill.path) }))
const secret = process.env.STABLE_BENCH_API_KEY
const redact = value => JSON.parse(JSON.stringify(value).split(secret).join('[REDACTED]'))
fs.mkdirSync(run, { recursive: true })
const electron = require('electron')
electron.app.setPath('userData', path.join(run, 'electron'))
electron.app.disableHardwareAcceleration()
electron.app.on('window-all-closed', () => {})
electron.app.commandLine.appendSwitch('disable-background-networking')
const { ClaudeHarnessRunner } = require('../../desktop/services/claude-harness.cjs')
const { BuiltinTools } = require('../../desktop/services/builtin-tools.cjs')
const { BrowserSessionService } = require('../../desktop/services/browser-session.cjs')
let active, browserSession
async function execute() {
  await electron.app.whenReady()
  const settings = new Map()
  browserSession = new BrowserSessionService({ electron, store: { getSetting: key => settings.get(key), setSetting: (key, value) => settings.set(key, value) }, getWindow: () => null })
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: bench.repo, encoding: 'utf8', windowsHide: true }).stdout?.trim() || null
  bench.writeJSON(path.join(run, 'run.json'), {
    id: path.basename(run), createdAt: new Date().toISOString(), suite: bench.suite.version, codeCommit: commit,
    model, timeoutMs: timeout, maxRequestsPerCase: maxRequests, concurrency: 1,
    sdk: require('../../package.json').dependencies['@anthropic-ai/claude-agent-sdk'],
    platform: process.platform, release: os.release(), cpu: os.cpus()[0]?.model,
    skills: skills.map(skill => ({ ...skill, sha256: bench.hash(path.join(skill.path, 'SKILL.md')) })),
    inputHashes: Object.fromEntries(Object.entries(expected).map(([id, item]) => [id, item.sha256])),
    browser: 'Stable BrowserSessionService (hidden, software rendering, fresh profile per run)', profile: 'fresh SDK runtime per flow', permissions: 'explicit-native-bash-full-access', billingCost: null,
  })
  bench.writeJSON(path.join(run, 'oracle.json'), expected)
  bench.writeJSON(path.join(run, 'review.json'), bench.reviewTemplate())
  fs.mkdirSync(path.join(run, 'cases'))
  const flows = new Map()
  for (const item of bench.suite.cases) {
    const caseDir = path.join(run, 'cases', item.id); fs.mkdirSync(caseDir)
    let flow = flows.get(item.flow)
    if (!flow) {
      const root = path.join(run, 'flows', item.flow), workspace = path.join(root, 'workspace')
      fs.mkdirSync(path.join(workspace, 'input'), { recursive: true })
      fs.copyFileSync(path.join(__dirname, 'brief.md'), path.join(workspace, 'brief.md'))
      flow = { workspace, userData: path.join(root, 'runtime'), inputs: new Set(), blocked: false }
      flows.set(item.flow, flow)
    }
    if (flow.blocked) { bench.writeJSON(path.join(caseDir, 'record.json'), { status: 'blocked', error: '前置用例失败，不更换历史或跳过依赖重算分数' }); continue }
    const target = path.join(flow.workspace, 'input', item.dataset + '.xlsx')
    if (!flow.inputs.has(item.dataset)) { fs.copyFileSync(path.join(data, item.dataset + '.xlsx'), target); flow.inputs.add(item.dataset) }
    const toolInstances = [], events = [], tools = new Map()
    const budget = requestBudget(maxRequests)
    let firstOutputMs = null, checkpointInterrupted = false, error, status = 'completed'
    const started = Date.now(), responses = []
    const runner = new ClaudeHarnessRunner({
      userData: flow.userData, workspace: flow.workspace,
      environment: { ...process.env, STABLE_BENCH_API_KEY: '' },
      builtinTools: context => { const tools = new BuiltinTools({ ...context, electron, browserEnabled: true, browserSession }); toolInstances.push(tools); return tools },
      onModelRequest: () => budget.onRequest(),
    })
    active = runner
    const capture = event => {
      const clean = redact(event); events.push(clean)
      if (firstOutputMs === null && (event.kind === 'answer' && event.delta || event.kind === 'tool')) firstOutputMs = Date.now() - started
      if (event.kind === 'tool') {
        const key = `${event.sessionId || ''}:${event.id}`
        const prior = tools.get(key) || { name: event.toolName, start: event.time || Date.now() }
        tools.set(key, { ...prior, status: event.status, end: event.status !== 'running' ? event.time || Date.now() : null })
      }
      if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
      if (item.interruptAfterCheckpoint && !checkpointInterrupted && event.kind === 'tool' && event.toolName === 'Write' && event.status === 'completed' && fs.existsSync(path.join(flow.workspace, 'checkpoint.md'))) {
        checkpointInterrupted = true; runner.cancel()
      }
    }
    const session = { key: item.flow, cwd: flow.workspace, permissionMode: 'full', networkAccess: true, readableRoots: skills.map(skill => skill.path), automaticSkills: skills,
      globalInstructions: '这是报告任务 benchmark。只修改本轮工作目录内的文件，不读取目录外的评分文件、其他 run 或真实用户数据。无需询问常规排版选择，不安装任何依赖；可使用已提供的 stable_excel 和后台浏览器。过程与最终报告用中文。', }
    const prompt = bench.contract(item, expected[item.dataset].brand)
    bench.writeJSON(path.join(caseDir, 'prompt.json'), { prompt, origin: item.origin })
    try {
      if (item.interruptAfterCheckpoint) {
        try { responses.push(await runner.run(prompt, model, secret, timeout, capture, 'workspace-write', [], session)) }
        catch (failure) { if (!checkpointInterrupted) throw failure }
        if (!checkpointInterrupted) throw Error('未出现可控中断检查点，本例不能算续跑通过')
        responses.push(await runner.run('继续。保留 checkpoint.md 中的有效进度，完成 report.html 与 metrics.json，不重新开始无关任务。', model, secret, Math.max(1000, timeout - (Date.now() - started)), capture, 'workspace-write', [], session))
      } else responses.push(await runner.run(prompt, model, secret, timeout, capture, 'workspace-write', [], session))
    } catch (failure) { status = 'failed'; error = String(failure.message).split(secret).join('[REDACTED]') }
    finally { runner.cancel(); active = null; for (const tool of toolInstances) tool.dispose() }
    const inputsUnchanged = [...flow.inputs].every(id => fs.existsSync(path.join(flow.workspace, 'input', id + '.xlsx')) && bench.hash(path.join(flow.workspace, 'input', id + '.xlsx')) === expected[id].sha256)
    if (!inputsUnchanged) { status = 'failed'; error = '输入数据被修改' }
    try { bench.snapshot(flow.workspace, path.join(caseDir, 'artifacts')) }
    catch (failure) { status = 'failed'; error = failure.message }
    const requests = budget.used
    const durations = [...tools.values()].map(tool => ({ ...tool, durationMs: tool.end === null ? null : Math.max(0, tool.end - tool.start) }))
    bench.writeJSON(path.join(caseDir, 'record.json'), { status, error: error || null, inputsUnchanged, checkpointInterrupted,
      performance: { durationMs: Date.now() - started, firstOutputMs, requests, toolCalls: durations.length, toolFailures: durations.filter(tool => ['failed', 'denied', 'cancelled'].includes(tool.status)).length, compactions: events.filter(event => event.title === '上下文已自动压缩').length, billingTokens: null, billingCost: null }, tools: durations })
    fs.writeFileSync(path.join(caseDir, 'events.jsonl'), events.map(event => JSON.stringify(event)).join('\n') + '\n')
    bench.writeJSON(path.join(caseDir, 'responses.json'), redact(responses))
    flow.blocked = status !== 'completed'
    console.log(JSON.stringify({ case: item.id, status, requests, elapsedMs: Date.now() - started }))
  }
  bench.writeJSON(path.join(run, 'score-pending-review.json'), bench.score(run))
}
process.on('SIGINT', () => { active?.cancel(); browserSession?.dispose(); electron.app.exit(130) })
execute().then(() => { browserSession?.dispose(); electron.app.exit(0) }, error => { active?.cancel(); browserSession?.dispose(); console.error(String(error.message).split(secret).join('[REDACTED]')); electron.app.exit(1) })
