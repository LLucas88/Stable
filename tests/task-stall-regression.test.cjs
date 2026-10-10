'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {normalizeWindowsCall}=require('../desktop/services/windows-command.cjs')
const {ClaudeHarnessRunner}=require('../desktop/services/claude-harness.cjs')
test('Windows volume roots fail before starting a model or runtime', {skip:process.platform!=='win32'},async()=>{
 const runner=new ClaudeHarnessRunner({workspace:'D:\\',executable:process.execPath})
 await assert.rejects(runner.run('write',{model:'test'},'mock'),/盘符根目录/)
 const nested=new ClaudeHarnessRunner({workspace:'D:\\stable',executable:process.execPath})
 await assert.rejects(nested.run('write',{model:'test'},'mock',0,()=>{},'workspace-write',[],{writableRoots:['D:\\']}),/盘符根目录/)
 assert.equal(runner.busy,false)
})
test('PowerShell patch argument becomes native patch and mixed commands stay intact',()=>{
 const shell={name:'shell_command'},patch={name:'apply_patch',custom:true},catalog=new Map([['apply_patch',patch]])
 const input='*** Begin Patch\n*** Add File: animation.html\n+<html>鹈鹕</html>\n*** End Patch'
 const command="apply_patch @'\n"+input+"\n'@"
 const actual=normalizeWindowsCall(shell,{command},catalog)
 assert.equal(actual.spec,patch);assert.equal(actual.args.input,input)
 for(const command of ['apply_patch '+input, 'apply_patch\n'+input]) {
  const result=normalizeWindowsCall(shell,{command},catalog)
  assert.equal(result.spec,patch);assert.equal(result.args.input,input)
  const fallback=normalizeWindowsCall(shell,{command},new Map())
  assert.match(fallback.args.command,/New-Item -Path 'animation.html'/)
  assert.doesNotMatch(fallback.args.command,/apply_patch/)
  assert.match(fallback.args.command,/<html>鹈鹕<\/html>/)
 }
 assert.equal(normalizeWindowsCall(shell,{command:'apply_patch '+input+'\nWrite-Output done'},catalog).spec,shell)
 const mixed=normalizeWindowsCall(shell,{command:command+'\nWrite-Output done',timeout_ms:30000},catalog)
 assert.equal(mixed.spec,shell);assert.equal(mixed.args.timeout_ms,30000)
 assert.equal(normalizeWindowsCall(shell,{command:'Write-Output ok'},catalog).args.timeout_ms,60000)
})
