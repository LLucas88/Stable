'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { StableStore } = require('../desktop/services/store.cjs')
const { ClaudeHarnessRunner } = require('../desktop/services/claude-harness.cjs')
const sdk = {
  tool: (name, _description, _shape, handler) => ({ name, handler }), createSdkMcpServer: value => value,
  query({ prompt, options }) {
    return { close() {}, async *[Symbol.asyncIterator]() {
      const message = (await prompt[Symbol.asyncIterator]().next()).value
      yield { type: 'system', subtype: 'init', mcp_servers: [{ name: 'stable', status: 'connected' }] }
      const command = message.message.content[0].text
      const result = await options.canUseTool('Bash', { command })
      yield { type: 'result', subtype: 'success', result: result.behavior === 'deny' ? 'decline' : 'accept' }
    } }
  },
}
test('Claude conversation grants persist, bind exact command and permission scope, and are revoked on clear', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-grants-')), workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace); let store = new StableStore(root)
  t.after(() => { store.close(); assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  const a = store.activeConversationId(), b = store.createConversation('other')
  async function run(id, command, decision, expectedPrompts, networkAccess = true) {
    const runner = new ClaudeHarnessRunner({ userData: root, workspace, sdk, executable: process.execPath,
      hasConversationApproval: (id, key) => store.hasConversationApproval(id, key), grantConversationApproval: (id, key, label) => store.grantConversationApproval(id, key, label) })
    let prompts = 0
    const result = await runner.run(command, { model: 'fixture', baseURL: 'https://fixture.invalid' }, 'fixture', 3000, event => {
      if (event.kind !== 'approval' || event.status !== 'running') return
      prompts++; runner.answerApproval(event.requestId, decision !== 'deny', decision === 'conversation' ? 'conversation' : 'once')
    }, 'workspace-write', [], { key: id, networkAccess })
    assert.equal(prompts, expectedPrompts); assert.equal(result, expectedPrompts && decision === 'deny' ? 'decline' : 'accept')
  }
  await run(a, 'pwd', 'deny', 1)
  await run(a, 'pwd', 'once', 1)
  await run(a, 'pwd', 'conversation', 1)
  store.close(); store = new StableStore(root)
  await run(a, 'pwd', 'once', 0)
  await run(a, 'ls', 'deny', 1)
  await run(a, 'pwd; pwd', 'deny', 1)
  await run(b, 'pwd', 'deny', 1)
  store.clearMessages(a)
  await run(a, 'pwd', 'once', 1)
})
