'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { canAutoApprove, approvalScope } = require('../desktop/services/codex-approval.cjs')
const { CodexHarnessRunner } = require('../desktop/services/codex-harness.cjs')

test('approval modes do not infer authorization from command text or legacy risk flags', () => {
  for (const toolName of ['Get-Content report.md', 'Remove-Item data -Recurse', 'git reset --hard HEAD', 'powershell -EncodedCommand AAAA', 'crm-brand-cli third login switch-brand', 'python analysis.py']) {
    for (const approvalRisk of ['safe', 'unknown', 'high', undefined]) {
      const event = { toolName, approvalRisk, danger: true }
      assert.equal(canAutoApprove('request', event), false)
      assert.equal(canAutoApprove('auto', event), false)
      assert.equal(canAutoApprove('full', event), true)
      assert.equal(canAutoApprove(undefined, event), false)
    }
  }
})

for (const mode of ['request', 'auto', 'full']) test('native approval remains pending until routed: ' + mode, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-approval-routing-'))
  const runner = new CodexHarnessRunner({userData: root, workspace: root, executable: process.execPath,
    executableArgs: [path.join(__dirname, 'fixtures/codex-approval-app-server.cjs')]})
  let requests = 0
  try {
    const answer = await runner.run('Remove-Item sensitive.txt', {model:'mock',providerId:'mock',baseURL:'https://unused.invalid'}, 'unused', 10000, event => {
      if (event.kind !== 'approval' || event.status !== 'running') return
      requests++
      assert.equal(event.approvalRisk, undefined)
      assert.equal(event.danger, undefined)
      assert.match(event.actionDigest, /^[a-f0-9]{64}$/)
      // Simulate a user/reviewer denial, or the selected full-access policy.
      assert.equal(runner.answerApproval(event.requestId, canAutoApprove(mode)), true)
      assert.equal(runner.answerApproval(event.requestId, true), false)
    }, 'workspace-write', [], {key: mode, permissionMode: mode})
    assert.equal(requests, 1)
    assert.equal(answer, mode === 'full' ? 'accept' : 'decline')
  } finally { fs.rmSync(root, {recursive:true,force:true}) }
})

test('approval still rejects a script changed while the user is deciding', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-approval-changed-'))
  fs.writeFileSync(path.join(root,'job.py'), 'print(1)')
  const runner = new CodexHarnessRunner({userData:root, workspace:root, executable:process.execPath,
    executableArgs:[path.join(__dirname,'fixtures/codex-approval-app-server.cjs')]})
  try {
    const answer = await runner.run('python job.py', {model:'mock',providerId:'mock',baseURL:'https://unused.invalid'}, 'unused', 10000, event => {
      if(event.kind!=='approval'||event.status!=='running')return
      fs.writeFileSync(path.join(root,'job.py'), 'print(2)')
      assert.equal(runner.answerApproval(event.requestId,true),false)
    }, 'workspace-write', [], {key:'changed'})
    assert.equal(answer,'decline')
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})

test('grants retain exact commands, working directories and permission scopes', () => {
  const method='item/commandExecution/requestApproval', p={cwd:__dirname,command:'one'}
  const scope=params=>approvalScope(method,params,{}).key
  assert.notEqual(scope(p),scope({...p,command:'two'}))
  assert.notEqual(scope(p),scope({...p,cwd:os.tmpdir()}))
  assert.notEqual(scope(p),scope({...p,additionalPermissions:{network:{enabled:true}}}))
})
