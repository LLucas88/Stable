'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { classifyCodexApproval, canAutoApprove, splitCommand, checkPaths } = require('../desktop/services/codex-approval.cjs')
const method = 'item/commandExecution/requestApproval'
const shellQuote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`
const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const command = (script) => [executable, '-NoProfile', '-Command', script].map(shellQuote).join(' ')

test('approval display argv round-trips quotes and never ignores trailing tokens', () => {
  const script = '$f="数据\\测试.md"; Select-String -Path "$f" -Pattern "A店|summary"'
  assert.deepEqual(splitCommand(command(script)), [executable, '-NoProfile', '-Command', script])
  assert.deepEqual(splitCommand('"C:\\\\Windows\\\\powershell.exe" -Command "Get-Content \'D:\\\\report.md\'"'), ['C:\\Windows\\powershell.exe', '-Command', "Get-Content 'D:\\report.md'"])
  assert.equal(splitCommand('powershell.exe -Command "unfinished'), null)
  assert.equal(splitCommand(`${command(script)} ; evil`).length, 6)
})

test('full mode only automatically approves verified safe operations; request mode still asks', () => {
  for (const risk of ['safe', 'unknown', 'high']) {
    assert.equal(canAutoApprove('full', { approvalRisk: risk, danger: risk === 'high' }), risk === 'safe')
    assert.equal(canAutoApprove('request', { approvalRisk: risk }), false)
    assert.equal(canAutoApprove('auto', { approvalRisk: risk }), false)
  }
  assert.equal(canAutoApprove('full', { danger: true }), false)
})

test('PowerShell assessment handles screenshot reads and workspace editing without executing code', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-approval-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'report.md'), 'original')
  const assess = (script, extra = {}) => classifyCodexApproval(method, { command: command(script), cwd: workspace, ...extra }, workspace)
  try {
    for (const script of [
      '$f="report.md"; Select-String -Path "$f" -Pattern "A店|B店|C店|sales|summary|校验" -Context 2,2 -ErrorAction SilentlyContinue | Select-Object -First 40 | Format-List',
      "Get-ChildItem -Path . -Force -Directory | Where-Object { $_.Name -like '.*' } | Select-Object Name,LastWriteTime | Format-Table -AutoSize",
      "Write-Host '--- input ---'; Get-Content -LiteralPath 'report.md'",
      "Set-Content -LiteralPath 'summary.json' -Value '{\"total\":260}'",
      "Add-Content -LiteralPath 'sales.csv' -Value 'C店,30'",
      "New-Item -Path 'outputs' -ItemType Directory",
      "'report text' | Out-File -FilePath 'report.md' -Encoding utf8",
      "Write-Output 'Remove-Item -Recurse -Force is text, not a command'",
      "Get-Item -LiteralPath 'qa-activity-effect-raw.json','qa-activity-product-raw.json' | Select-Object FullName,Length,LastWriteTime; Get-Content -LiteralPath 'qa-activity-effect-raw.json' -Raw -Encoding UTF8 | Select-Object -First 1",
      "Get-Content -LiteralPath 'report.md','sales.csv' -Encoding UTF8",
    ]) {
      const result = await assess(script)
      assert.equal(result.risk, 'safe', `${script}: ${JSON.stringify(result)}`)
      assert.equal(canAutoApprove('full', { approvalRisk: result.risk }), true)
    }
    for (const script of [
      "Get-Content 'report.md'; Remove-Item -Recurse -Force .",
      "Set-Content -LiteralPath '../outside.txt' -Value 'changed'",
      "Get-Content -LiteralPath '.env'",
      "Get-Content -LiteralPath '.ssh/id_rsa'",
      'git reset --hard HEAD',
      "Get-Content -LiteralPath 'report.md','.env'",
      "Set-Content -LiteralPath 'report.md','../outside.txt' -Value 'changed'",
      "Get-Content -LiteralPath '.crm-cli/config.json'",
    ]) assert.equal((await assess(script)).risk, 'high', script)
    for (const script of [
      "Get-Content 'report.md' > '../outside.txt'",
      "Get-Content -LiteralPath 'crm-cli.config.json'",
      "Get-Content -LiteralPath '*'",
      "& ('Remove-' + 'Item') 'report.md'",
      'Invoke-Expression "Write-Output hi"',
      'Get-Content -Path $env:USERPROFILE',
      '$f="report.md"; $f=".env"; Get-Content $f',
      "Set-Content -LiteralPath 'report.md' -Value ([IO.File]::ReadAllText('secret'))",
      "Get-Content -Path 'report.md' -OutVariable secret",
      "Get-Content -Pa 'report.md'",
      "New-Item -Path 'shortcut' -ItemType SymbolicLink -Value '../outside'",
      "node arbitrary-script.cjs",
      "Write-Output @args",
      "Write-Output $(Start-Process evil)",
      "Get-ChildItem -Path . | Where-Object { [IO.File]::WriteAllText('report.md','bad') }",
      "Get-Content -LiteralPath 'report.md',($env:USERPROFILE + '/.env')",
      "Get-Content -LiteralPath:$env:USERPROFILE",
    ]) assert.notEqual((await assess(script)).risk, 'safe', script)
    // Friendly summaries, a harmless first clause, or an encoded wrapper must
    // never be treated as authority to approve arbitrary execution.
    assert.equal((await assess('Remove-Item report.md', { commandActions: [{ type: 'read', path: 'report.md' }] })).risk, 'high')
    assert.equal((await classifyCodexApproval(method, { cwd: workspace, command: `${command('Get-Content report.md')} ; evil` }, workspace)).risk, 'unknown')
    assert.equal((await classifyCodexApproval(method, { command: `${shellQuote(executable)} -EncodedCommand abc` }, workspace)).risk, 'unknown')
    assert.equal((await assess('Get-Content report.md', { networkApprovalContext: { host: 'example.com' } })).risk, 'unknown')
    assert.equal((await assess("Set-Content -LiteralPath 'relative.txt' -Value 'data'", { cwd: null })).risk, 'unknown')
    assert.equal((await classifyCodexApproval('item/fileChange/requestApproval', {}, workspace)).risk, 'unknown')
    assert.deepEqual(fs.readdirSync(workspace), ['report.md'])
    assert.equal(fs.readFileSync(path.join(workspace, 'report.md'), 'utf8'), 'original')
    assert.equal(fs.existsSync(path.join(root, 'outside.txt')), false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('file writes through junctions cannot escape the workspace', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-approval-paths-'))
  try {
    const workspace = path.join(root, 'workspace'); const outside = path.join(root, 'outside')
    fs.mkdirSync(workspace); fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(workspace, 'link'), 'junction')
    assert.equal(checkPaths([{ mode: 'write', path: 'link/new.txt' }], workspace, workspace).risk, 'high')
    assert.equal(checkPaths([{ mode: 'write', path: 'new.txt' }], workspace, workspace), null)
    fs.writeFileSync(path.join(outside, 'original.txt'), 'original')
    fs.linkSync(path.join(outside, 'original.txt'), path.join(workspace, 'alias.txt'))
    assert.equal(checkPaths([{ mode: 'write', path: 'alias.txt' }], workspace, workspace).risk, 'unknown')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
