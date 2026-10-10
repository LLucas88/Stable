'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { canAutoApprove, approvalScope } = require('../desktop/services/tool-approval.cjs')

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

test('grants retain exact commands, working directories and permission scopes', () => {
  const method='item/commandExecution/requestApproval', p={cwd:__dirname,command:'one'}
  const scope=params=>approvalScope(method,params,{}).key
  assert.notEqual(scope(p),scope({...p,command:'two'}))
  assert.notEqual(scope(p),scope({...p,cwd:os.tmpdir()}))
  assert.notEqual(scope(p),scope({...p,additionalPermissions:{network:{enabled:true}}}))
})

test('WSL absolute script arguments retain byte-sensitive approval fingerprints', { skip: process.platform !== 'win32' }, () => {
  const { linuxPath } = require('../desktop/services/wsl-sandbox.cjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-wsl-approval-')), file = path.join(root, 'job.py')
  try {
    fs.writeFileSync(file, 'print(1)')
    const params = { command: `python3 '${linuxPath(file)}'`, cwd: root }
    const first = approvalScope('claude/tool', params, {}, { workspace: root }).key
    fs.writeFileSync(file, 'print(2)')
    assert.notEqual(first, approvalScope('claude/tool', params, {}, { workspace: root }).key)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('Git Bash absolute script paths invalidate approval when the script changes', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-bash-approval-')), file = path.join(root, 'job.py')
  try {
    fs.writeFileSync(file, 'print(1)')
    const bashPath = '/' + file[0].toLowerCase() + file.slice(2).replace(/\\/g, '/')
    const params = { command: `python '${bashPath}'`, cwd: root }
    const first = approvalScope('claude/tool', params, {}, { workspace: root }).key
    fs.writeFileSync(file, 'print(2)')
    assert.notEqual(first, approvalScope('claude/tool', params, {}, { workspace: root }).key)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
