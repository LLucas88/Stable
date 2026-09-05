'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { CodexHarnessRunner, sessionDirectory } = require('../desktop/services/codex-harness.cjs')
const { CODEX_BUILTIN_TOOLS } = require('../desktop/services/codex-builtin-tools.cjs')
const { canAutoApprove } = require('../desktop/services/codex-approval.cjs')
const model = { id: 'mock', providerId: 'mock', model: 'mock', baseURL: 'https://unused.example/v1' }

test('builtin schemas preserve nested Excel arguments in standard JSON Schema', () => {
  const schema = CODEX_BUILTIN_TOOLS.find((tool) => tool.name === 'stable_excel').inputSchema
  assert.deepEqual(schema.required, ['action'])
  assert.deepEqual(schema.properties.sheets.items.required, ['name', 'rows'])
  assert.deepEqual(schema.properties.sheets.items.properties.rows.items.items, {})
  assert.equal(schema.properties.action.required, undefined)
})

for (const mode of ['allow', 'deny', 'read-only', 'cancel']) test(`Codex browser call: ${mode}`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-codex-tools-'))
  let executed = 0; let disposed = 0; let approvals = 0
  const runner = new CodexHarnessRunner({ userData: root, workspace: path.join(root, 'workspace'), executable: process.execPath,
    executableArgs: [path.join(__dirname, 'fixtures/codex-tools-app-server.cjs')],
    builtinTools: () => ({ async execute(request, sandbox) { executed++; assert.equal(request.approved, true); assert.equal(sandbox, 'workspace-write'); return { clicked: 'e1' } }, dispose() { disposed++ } }),
  })
  try {
    const home = sessionDirectory(root, 'old'); fs.mkdirSync(home, { recursive: true })
    fs.writeFileSync(path.join(home, 'stable-thread.json'), JSON.stringify({ threadId: 'legacy', seeded: true, reasoningVersion: 1 }))
    const run = runner.run('NEXT', model, 'unused', 10000, (event) => {
      if (event.kind !== 'approval' || event.status !== 'running') return
      approvals++
      assert.equal(canAutoApprove('full', event), false)
      if (mode === 'cancel') runner.cancel()
      else assert.equal(runner.answerApproval(event.requestId, mode === 'allow'), true)
    }, mode === 'read-only' ? 'read-only' : 'workspace-write', [], { key: 'old', initialPrompt: 'RESTORED_HISTORY' })
    if (mode === 'cancel') await assert.rejects(run, /任务已停止/)
    else {
      const result = JSON.parse(await run)
      assert.equal(result.success, mode === 'allow')
      assert.match(result.contentItems[0].text, mode === 'allow' ? /clicked/ : mode === 'deny' ? /未批准/ : /只读/)
    }
    assert.equal(executed, mode === 'allow' ? 1 : 0)
    assert.equal(approvals, mode === 'read-only' ? 0 : 1)
    assert.ok(disposed >= 1)
    assert.equal(runner.approvals.size, 0)
    assert.equal(runner.steerReady, false)
    const recorded = JSON.parse(fs.readFileSync(path.join(home, 'fixture-start.json')))
    assert.equal(recorded.start.method, 'thread/start')
    assert.equal(recorded.start.params.dynamicTools.length, 2)
    assert.match(recorded.input[0].text, /RESTORED_HISTORY/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('steer distinguishes a definite RPC rejection from a missing acknowledgement', async () => {
  const runner = new CodexHarnessRunner({ workspace: __dirname })
  runner.steerReady = true; runner.threadId = 'thread'; runner.turnId = 'turn'
  for (const [code, expected] of [[-32600, -32600], [undefined, 'STEER_UNCERTAIN']]) {
    runner.rpc = { async request(method, params) { assert.equal(method, 'turn/steer'); assert.equal(params.expectedTurnId, 'turn'); throw Object.assign(new Error('failed'), { code }) } }
    await assert.rejects(runner.steer('new direction'), (error) => error.code === expected)
  }
})
