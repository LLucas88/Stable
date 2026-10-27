'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
const { BuiltinTools } = require('../desktop/services/builtin-tools.cjs')
test('Excel writes require approval at both MCP adapter and execution boundary', async t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-write-approval-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const builtin = new BuiltinTools({ workspace, networkAccess: false }); t.after(() => builtin.dispose())
  const sdk = { tool: (name, desc, shape, handler) => ({ name, handler }), createSdkMcpServer: x => x }
  let approvals = 0
  const server = createClaudeTools({ sdk, workspace, builtinTools: builtin, requestApproval: async () => { approvals++; return false } })
  for (const action of ['create', 'update']) {
    const args = { action, output: 'denied.xlsx', sheets: [{ name: 'test', rows: [[1]] }] }
    const result = await server.tools.find(t => t.name === 'stable_excel').handler(args)
    assert.equal(result.isError, true)
    await assert.rejects(builtin.execute({ requestId: action, name: 'stable_excel', args }, 'workspace-write'), /审批/)
    assert(!fs.existsSync(path.join(workspace, 'denied.xlsx')))
  }
  assert.equal(approvals, 2)
  const allowed = createClaudeTools({ sdk, workspace, builtinTools: builtin, requestApproval: async () => true })
  const result = await allowed.tools.find(t => t.name === 'stable_excel').handler({ action: 'create', output: 'allowed.xlsx', sheets: [{ name: 'test', rows: [[1]] }] })
  assert.equal(result.isError, undefined); assert(fs.existsSync(path.join(workspace, 'allowed.xlsx')))
})
