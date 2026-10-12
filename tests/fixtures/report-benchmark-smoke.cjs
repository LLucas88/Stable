'use strict'
// Offline orchestration check. The model runner is replaced before loading the
// production entrypoint; no upstream API or native Bash is invoked by this test.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const Module = require('node:module')
const bench = require('../../benchmarks/report-tasks/benchmark.cjs')
const args = bench.options(['run', ...process.argv.slice(2)])
const run = path.resolve(args.run)
process.env.STABLE_BENCH_API_KEY = 'offline-smoke-placeholder'
process.argv.push('--live', '--allow-bash')
let browserChecked = false
class FixtureRunner {
  constructor(options) { this.options = options }
  cancel() { this.cancelled = true }
  async run(prompt, model, key, timeout, publish, sandbox, images, session) {
    this.cancelled = false
    this.options.onModelRequest()
    fs.writeFileSync(path.join(run, 'SMOKE_ONLY.txt'), 'Synthetic orchestration fixture, NOT a model benchmark result. No API calls.\n')
    const workspace = session.cwd
    if (!browserChecked) {
      const page = path.join(workspace, 'smoke.html')
      fs.writeFileSync(page, '<html><body><h1>Offline browser smoke</h1></body></html>')
      const tools = this.options.builtinTools({ workspace, conversationId: session.key })
      const opened = await tools.execute({ requestId: 'open', name: 'stable_browser', approved: true, args: { action: 'open', url: page } }, sandbox)
      assert.match(opened.text || JSON.stringify(opened), /Offline browser smoke/)
      const screenshot = await tools.execute({ requestId: 'capture', name: 'stable_browser', approved: true, args: { action: 'screenshot' } }, sandbox)
      assert.match(screenshot.image, /^data:image\/png;base64,/)
      assert(screenshot.image.length > 100)
      browserChecked = true
    }
    const id = /input\/b.xlsx/.test(prompt) || session.key === 'resume-b' ? 'b' : 'a'
    const golden = bench.oracle(path.join(workspace, 'input', id + '.xlsx'), id === 'a' ? '虾姐蟹妹' : '齐品达')
    if (/先完成数据读取/.test(prompt)) {
      fs.writeFileSync(path.join(workspace, 'checkpoint.md'), 'Fixture checkpoint: keep confirmed progress')
      publish({ kind: 'tool', id: 'checkpoint', toolName: 'Write', status: 'running', time: Date.now() })
      publish({ kind: 'tool', id: 'checkpoint', toolName: 'Write', status: 'completed', time: Date.now() })
      assert(this.cancelled, 'the production runner must cancel on a completed checkpoint')
      throw Error('fixture controlled interruption')
    }
    if (session.key === 'resume-b') assert(fs.existsSync(path.join(workspace, 'checkpoint.md')))
    fs.writeFileSync(path.join(workspace, 'report.html'), '<html><body>' + `FIXTURE ONLY ${golden.brand} `.repeat(60) + '</body></html>')
    fs.writeFileSync(path.join(workspace, 'metrics.json'), JSON.stringify(golden))
    publish({ kind: 'answer', delta: 'Fixture complete', time: Date.now() })
    return 'FIXTURE ONLY — not a real model report'
  }
}
const load = Module._load
Module._load = function(request, parent, isMain) {
  if (request === '../../desktop/services/claude-harness.cjs') return { ClaudeHarnessRunner: FixtureRunner }
  return load.call(this, request, parent, isMain)
}
require('../../benchmarks/report-tasks/run.cjs')
