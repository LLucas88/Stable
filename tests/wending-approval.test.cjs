'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { classifyCodexApproval, approvalScope } = require('../desktop/services/codex-approval.cjs')
const { classifyWending } = require('../desktop/services/wending-approval.cjs')
const root = path.resolve(__dirname, '../vendor/wending-cli')
const trusted = { root, environment: { PATH: root } }
const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`
const wrap = (script) => [shell, '-NoProfile', '-Command', script].map(quote).join(' ')

test('bundled CLI classification verifies executable identity and separates help, reads and mutations', () => {
  const classify = (args) => classifyWending(['crm-brand-cli', ...args], __dirname, trusted)
  assert.equal(classify(['--help']).risk, 'safe')
  assert.equal(classify(['--version']).risk, 'safe')
  assert.equal(classify(['--json', 'third', 'login', 'switch-brand', '--help']).risk, 'safe')
  assert.equal(classify(['--json', 'third', 'login', 'login-record']).risk, 'safe')
  assert.equal(classify(['data-analysis', 'query-shop-category-flow', '--date', '20260904']).risk, 'safe')
  assert.equal(classify(['third', 'login', 'switch-brand', '--brand-id', '1']).risk, 'high')
  assert.equal(classify(['third', 'login', 'send-verify-code']).risk, 'high')
  assert.equal(classify(['member-marketing', 'update-member-card-template']).risk, 'high')
  assert.equal(classify(['unknown', 'query-something']).risk, 'unknown')
  assert.notEqual(classify(['third', 'login', 'auth', '--request-json', '--help']).risk, 'safe')
  assert.notEqual(classify(['data-analysis', 'get-today', '--date', '1 & evil']).risk, 'safe')
  assert.equal(classifyWending(['python', 'crm-work/crm-brand-cli.py', '--help'], __dirname, trusted).risk, 'unknown')
  assert.equal(classifyWending([path.join(root, 'python/python.exe'), '-B', '-X', 'utf8', '-m', 'crm_cli.cli', '--help'], __dirname, trusted).risk, 'safe')
  const spoof = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-cli-spoof-'))
  try {
    fs.writeFileSync(path.join(spoof, 'crm-brand-cli.cmd'), '@echo malicious')
    assert.equal(classifyWending(['crm-brand-cli', '--help'], __dirname, { root, environment: { PATH: `${spoof}${path.delimiter}${root}` } }).risk, 'unknown')
    assert.equal(classifyWending([path.join(spoof, 'crm-brand-cli.cmd'), '--help'], __dirname, trusted).risk, 'unknown')
  } finally { fs.rmSync(spoof, { recursive: true, force: true }) }
})

test('PowerShell CLI batches are safe only when every statement and argument is verified', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const assess = (script) => classifyCodexApproval('item/commandExecution/requestApproval', { command: wrap(script), cwd: __dirname }, __dirname, trusted)
  for (const script of ['crm-brand-cli --help', 'crm-brand-cli --help 2>&1 | Select-Object -First 60', 'crm-brand-cli --json third login list-brand --help; crm-brand-cli third login switch-brand --help', 'crm-brand-cli data-analysis get-today | Out-String']) {
    assert.equal((await assess(script)).risk, 'safe', script)
  }
  for (const script of ['crm-brand-cli --help; Remove-Item x', 'crm-brand-cli --help; python evil.py', "crm-brand-cli --help > '../outside.txt'", 'crm-brand-cli data-analysis get-today $(Write-Output danger)', 'python crm-work/crm-brand-cli.py --help']) {
    assert.notEqual((await assess(script)).risk, 'safe', script)
  }
})

test('conversation grant keys group known read commands but never broaden unknown invocations', () => {
  const known = classifyWending(['crm-brand-cli', 'data-analysis', 'get-today'], __dirname, trusted)
  const method = 'item/commandExecution/requestApproval'
  assert.equal(approvalScope(method, { cwd: __dirname, command: 'one' }, known).key, approvalScope(method, { cwd: __dirname, command: 'two' }, known).key)
  assert.notEqual(approvalScope(method, { cwd: __dirname }, known).key, approvalScope(method, { cwd: os.tmpdir() }, known).key)
  assert.notEqual(approvalScope(method, { command: 'python a.py' }, {}).key, approvalScope(method, { command: 'python b.py' }, {}).key)
  assert.notEqual(approvalScope('item/fileChange/requestApproval', { grantRoot: 'a' }, {}).key, approvalScope('item/fileChange/requestApproval', { grantRoot: 'b' }, {}).key)
})
