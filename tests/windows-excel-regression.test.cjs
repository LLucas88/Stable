const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {execFileSync}=require('node:child_process')
const {normalizeWindowsCall}=require('../desktop/services/windows-command.cjs')
const {executeExcel}=require('../desktop/services/excel-tool.cjs')
const python=path.resolve(__dirname,'../vendor/wending-cli/python/python.exe')
const shell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe')
test('PowerShell 5 Python stdin handles BOM and Chinese in full and constrained language', {skip:process.platform!=='win32'},()=>{
 for(const constrained of [false,true])for(const variable of [false,true])for(const codeVariable of [false,true]){
  const command=(variable?`$py = '${python}'\n`:'')+(codeVariable?'$code = ':'')+`@'\nprint('中文成功')\n'@`+(codeVariable?'\n$code':'')+` | & ${variable?'$py':`'${python}'`} -I -X utf8 -`
  const normalized=normalizeWindowsCall({name:'shell_command'},{command},new Map(),python)
  assert.match(normalized.args.command,/utf-8-sig/)
  assert.equal(normalizeWindowsCall({name:'shell_command'},normalized.args,new Map(),python).args.command,normalized.args.command)
  const script=(constrained?'$ExecutionContext.SessionState.LanguageMode="ConstrainedLanguage"; ':'')+normalized.args.command
  const out=execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000})
  assert.match(out,/中文成功/)
 }
})

test('Node literal inline code preserves quotes, Chinese and backslashes', {skip:process.platform!=='win32'},()=>{
 const source='const x={name:"中文",path:"D:/test/file.json"}; console.log(JSON.stringify(x)); console.log("a  b".replace(/\\s+/g," "))'
 const args={command:"node -e '"+source+"'"}
 const result=normalizeWindowsCall({name:'shell_command'},args,new Map(),python)
 assert.equal(normalizeWindowsCall({name:'shell_command'},result.args,new Map(),python).args.command,result.args.command)
 const output=execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(result.args.command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000})
 assert.match(output,/中文/);assert.match(output,/D:\/test\/file.json/);assert.match(output,/a b/)
 const mixed={command:"node -e 'console.log(1)'; Write-Output done"}
 assert(!normalizeWindowsCall({name:'shell_command'},mixed,new Map(),python).args.command.includes('Buffer.from'))
})
test('openpyxl Chinese sheet names survive stream inspect and named reads',async()=>{
 const workspace=path.resolve(__dirname,'../qa-artifacts/openpyxl-regression',String(Date.now()));fs.mkdirSync(workspace,{recursive:true})
 const file=path.join(workspace,'test.xlsx')
 execFileSync(python,['-I','-X','utf8','-c',"import sys,openpyxl; w=openpyxl.Workbook(); s=w.active; s.title='CRM营销效果'; s.append(['金额',12]); w.create_sheet('第二张').append(['第二张数据']); w.create_sheet('空表'); w.save(sys.argv[1])",file],{windowsHide:true,timeout:15000})
 const bytes=fs.readFileSync(file),execute=args=>executeExcel({workspace,dependencyRoot:path.resolve(__dirname,'../vendor/agent-tools'),args:{path:file,...args}})
 assert.deepEqual((await execute({action:'inspect'})).sheets.map(s=>s.name),['CRM营销效果','第二张','空表'])
 assert.deepEqual((await execute({action:'read',sheet:'CRM营销效果',rowCount:1})).rows[0].values,['金额',12])
 assert.deepEqual((await execute({action:'read',sheet:'空表'})).rows,[])
 await assert.rejects(execute({action:'read',sheet:'Sheet1'}),/CRM营销效果/)
 assert.deepEqual(fs.readFileSync(file),bytes)
})
