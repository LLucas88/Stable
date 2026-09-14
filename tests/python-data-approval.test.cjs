'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { approvalScope } = require('../desktop/services/codex-approval.cjs')
const { normalizeWindowsCall, UTF8_PREFIX } = require('../desktop/services/windows-command.cjs')
const method = 'item/commandExecution/requestApproval'
const cli = path.resolve(__dirname, '../vendor/wending-cli')
const python = path.join(cli, 'python/python.exe')
const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')

test('scope ignores native timestamps and display hints but retains permissions, cwd and task runtime boundaries', () => {
  const p = {command:'python script.py',cwd:'D:/work',threadId:'1',startedAtMs:1,environmentId:'local',reason:'first',availableDecisions:['accept'],commandActions:[],proposedExecpolicyAmendment:['a']}
  const q = {...p,threadId:'2',startedAtMs:2,reason:'retry',availableDecisions:['accept','cancel'],commandActions:[{type:'unknown'}],proposedExecpolicyAmendment:['b']}
  const scope = (params, assessment={}, execution={networkAccess:false})=>approvalScope(method,params,assessment,execution).key
  assert.equal(scope(p),scope(q))
  for (const change of [{command:'python other.py'},{cwd:'D:/other'},{environmentId:'remote'},{additionalPermissions:{network:{enabled:true}}},{grantRoot:'D:/'}]) assert.notEqual(scope(p),scope({...q,...change}))
  assert.notEqual(scope(p),scope(q,{}, {networkAccess:true}))
  assert.notEqual(scope(p,{}, {cliProfile:'a'}),scope(q,{}, {cliProfile:'b'}))
  assert.notEqual(scope(p,{category:'read'}),scope({...q,command:'new validated code'},{category:'read'}))
  assert.notEqual(scope(p,{category:'read'}),scope({...q,additionalPermissions:{network:{enabled:true}}},{category:'read'}))
})

test('Windows normalization preserves Unicode, rewrites only complete patch wrappers and leaves mixed commands visible', () => {
  const shellSpec={name:'shell_command'}, patchSpec={name:'apply_patch',custom:true,namespace:'functions'}, catalog=new Map([['apply_patch',patchSpec]])
  const source=`@'\nprint('青岛')\n'@ | python -`
  const normalized=normalizeWindowsCall(shellSpec,{command:source},catalog,python)
  assert.ok(normalized.args.command.startsWith(UTF8_PREFIX));assert.ok(normalized.args.command.includes('青岛'));assert.ok(normalized.args.command.includes('-I -X utf8 -'))
  assert.equal(normalizeWindowsCall(shellSpec,normalized.args,catalog,python).args.command,normalized.args.command)
  const patch='*** Begin Patch\n*** Add File: 数据.py\n+print("青岛")\n*** End Patch'
  for(const command of [`apply_patch <<'PATCH'\n${patch}\nPATCH`,`@'\n${patch}\n'@ | apply_patch`]) {
    const result=normalizeWindowsCall(shellSpec,{command},catalog,python);assert.equal(result.spec,patchSpec);assert.equal(result.args.input,patch)
  }
  const mixed=normalizeWindowsCall(shellSpec,{command:`apply_patch <<'PATCH'\n${patch}\nPATCH\nRemove-Item x`},catalog,python)
  assert.equal(mixed.spec,shellSpec);assert.ok(mixed.args.command.includes('Remove-Item'))
})

test('shell-only patch fallback creates Unicode files exclusively', { skip: process.platform !== 'win32' }, async () => {
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'stable-patch-create-'))
  try {
    const patch="*** Begin Patch\n*** Add File: 数据.py\n+print('青岛')\n+text = \"'@\"\n*** End Patch"
    const call=normalizeWindowsCall({name:'shell_command'},{command:`apply_patch <<'PATCH'\n${patch}\nPATCH`},new Map(),python)
    const execute=()=>execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(call.args.command,'utf16le').toString('base64')],{cwd:workspace,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})
    execute()
    const output=fs.readFileSync(path.join(workspace,'数据.py'),'utf8').replace(/^\uFEFF/,'')
    assert.equal(output,"print('青岛')\ntext = \"'@\"\n")
    assert.throws(execute,'Existing file must not be overwritten')
    assert.equal(fs.readFileSync(path.join(workspace,'数据.py'),'utf8').replace(/^\uFEFF/,''),output)
  } finally {fs.rmSync(workspace,{recursive:true,force:true})}
})

test('UTF8 prefix works in ConstrainedLanguage without console property errors', {skip:process.platform!=='win32'},()=>{
 const command = '$ErrorActionPreference="Stop"; $ExecutionContext.SessionState.LanguageMode="ConstrainedLanguage"; '+UTF8_PREFIX+'Write-Output PREFIX_OK';
 const result=execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.match(result,/PREFIX_OK/);
});
