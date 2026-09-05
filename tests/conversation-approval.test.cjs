'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { CodexHarnessRunner } = require('../desktop/services/codex-harness.cjs')

test('once, deny and persistent category grants survive restart and remain conversation scoped', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-conversation-approval-'))
  let store = new StableStore(root)
  const a = store.activeConversationId(); const b = store.createConversation('second')
  const cli = path.resolve(__dirname, '../vendor/wending-cli')
  const options = { userData: root, workspace: path.join(root, 'workspace'), executable: process.execPath, executableArgs: [path.join(__dirname, 'fixtures/codex-approval-app-server.cjs')], trustedCli: { root: cli, environment: { PATH: cli } },
    hasConversationApproval: (id, key) => store.hasConversationApproval(id, key), grantConversationApproval: (id, key, label) => store.grantConversationApproval(id, key, label) }
  async function run(id, command, decision, expectedPrompts, permissionMode = 'request') {
    const runner = new CodexHarnessRunner(options); let prompts = 0
    const answer = await runner.run(command, { model: 'mock', providerId: 'mock', baseURL: 'https://unused.invalid' }, 'unused', 10000, (event) => {
      if (event.kind !== 'approval' || event.status !== 'running') return
      prompts++
      assert.equal(runner.answerApproval(event.requestId, decision !== 'deny', decision === 'conversation' ? 'conversation' : 'once'), true)
      assert.equal(runner.answerApproval(event.requestId, true), false, 'Resolved request must not be reusable')
    }, 'workspace-write', [], { key: id, permissionMode })
    assert.equal(prompts, expectedPrompts)
    assert.equal(answer, decision === 'deny' && expectedPrompts ? 'decline' : 'accept')
  }
  try {
    await run(a, 'crm-brand-cli --help', 'deny', 1)
    await run(a, 'crm-brand-cli --help', 'once', 1)
    await run(a, 'crm-brand-cli --help', 'conversation', 1)
    store.db.close(); store = new StableStore(root)
    await run(a, 'crm-brand-cli data-analysis --help', 'once', 0)
    await run(b, 'crm-brand-cli --help', 'once', 1)
    await run(a, 'crm-brand-cli member-marketing update-member-card-template', 'deny', 1)
    await run(a, 'unreviewed-tool --inspect', 'conversation', 1)
    await run(a, 'unreviewed-tool --inspect', 'once', 0)
    const python = path.join(cli, 'python/python.exe').replace(/'/g, "''")
    const dataScript = code => `@'\n${code}\n'@ | & '${python}' -I -X utf8 -`
    await run(a, dataScript('import json\nprint(json.load(open("input.json", encoding="utf-8-sig")))'), 'conversation', 1)
    store.db.close(); store = new StableStore(root)
    await run(a, dataScript('import json\nrows=json.load(open("second.json", encoding="utf-8-sig"))\nprint(len(rows))'), 'once', 0)
    await run(b, dataScript('print(2)'), 'once', 1)
    await run(a, dataScript('print(3)'), 'once', 1, 'full')
    await run(a, dataScript('import os\nos.remove("input.json")'), 'deny', 1)
    await run(a, dataScript('open("result.json","w").write("[]")'), 'deny', 1)
    store.clearMessages(a)
    await run(a, 'crm-brand-cli --help', 'once', 1)
    const key = 'a'.repeat(64); store.grantConversationApproval(b, key, 'test'); store.removeConversation(b)
    assert.equal(store.hasConversationApproval(b, key), false)
  } finally { store.db.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
