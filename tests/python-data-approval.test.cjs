'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { classifyCodexApproval, approvalScope } = require('../desktop/services/codex-approval.cjs')
const { normalizeWindowsCall, UTF8_PREFIX } = require('../desktop/services/windows-command.cjs')
const method = 'item/commandExecution/requestApproval'
const cli = path.resolve(__dirname, '../vendor/wending-cli')
const python = path.join(cli, 'python/python.exe')
const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const quote = s => `'${s.replace(/'/g, `'"'"'`)}'`

test('data scripts are rechecked before sharing a workspace category; executable, syntax and file boundaries remain enforced', { skip: process.platform !== 'win32', timeout: 120000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-python-review-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(root, 'outside')); fs.symlinkSync(path.join(root, 'outside'), path.join(workspace, 'link'), 'junction')
  const trusted = { root: cli, environment: { PATH: cli } }
  const assess = async (source, extra = '') => {
    const normalized = normalizeWindowsCall({ name: 'shell_command' }, { command: `@'\n${source}\n'@ | python -X utf8 -${extra}` }, new Map(), python)
    return classifyCodexApproval(method, { cwd: workspace, command: [shell, '-NoProfile', '-Command', normalized.args.command].map(quote).join(' ') }, workspace, trusted)
  }
  try {
    const original = `import json\np=json.load(open('input.json',encoding='utf-8-sig'))['result']\nprint('rows',len(p))\nfor name in sorted(set(r['商品名称'] for r in p)):\n    rs=[r for r in p if r['商品名称']==name]\n    acts=sorted(set(r['CRM活动名称'] for r in rs))\n    print(len(rs), '|', name, '|', ';'.join(acts))`
    const a = await assess(original)
    assert.equal(a.risk, 'safe', JSON.stringify(a)); assert.match(a.categoryLabel, /只读/)
    const b = await assess(`import json\nfrom collections import defaultdict\nrows=json.load(open('second.json',encoding='utf-8-sig'))['result']\ngroups=defaultdict(list)\nfor r in rows:\n    groups[(r['CRM活动id'], r['商品名称'])].append(r)\nprint(json.dumps([{'name':k[1], 'count':len(v)} for k,v in groups.items()],ensure_ascii=False))`)
    assert.equal(b.risk, 'safe', JSON.stringify(b)); assert.equal(a.category,b.category)
    const writer = await assess(`import json\nwith open('result.json','w',encoding='utf-8') as f:\n    json.dump({'总计':3},f,ensure_ascii=False)`)
    assert.equal(writer.risk, 'safe', JSON.stringify(writer)); assert.notEqual(writer.category,a.category)
    for (const source of [
      "import os\nos.remove('input.json')", "import socket\nsocket.socket()", "import subprocess\nsubprocess.run('whoami')",
      "exec('print(1)')", "eval('1')", "__import__('os')", "print(globals())", "print((1).__class__.__base__)",
      "path='input.json'\nprint(open(path).read())", "print(open('../outside/data.json').read())", "print(open('link/data.json').read())",
      "print(open('.env').read())", "print(open('.crm-cli/config.json').read())", "open('../outside/write.txt','w').write('x')",
      "import json\njson.load=print", "op=open\nop('input.json')", "from collections import defaultdict\na=defaultdict(open)\nprint(a['x'])",
      "import json\nprint(json.load(open('input.json'),object_hook=eval))", "open('x','w',opener=print)",
      "from json import load as open\nopen('x')", "print(getattr('', '__class__'))", "from json import *",
      "def calculate():\n    return 1\nprint(calculate())",
    ]) {
      const result = await assess(source)
      assert.notEqual(result.risk, 'safe', source); assert.equal(result.category,undefined,source)
    }
    assert.notEqual((await assess('print(1)', '; Remove-Item input.json')).risk,'safe')
    assert.deepEqual(fs.readdirSync(workspace), ['link'], 'Analysis must never run source')
  } finally { fs.rmSync(root,{recursive:true,force:true}) }
})

test('scope ignores native timestamps and display hints but retains permissions, cwd and task runtime boundaries', () => {
  const p = {command:'python script.py',cwd:'D:/work',threadId:'1',startedAtMs:1,environmentId:'local',reason:'first',availableDecisions:['accept'],commandActions:[],proposedExecpolicyAmendment:['a']}
  const q = {...p,threadId:'2',startedAtMs:2,reason:'retry',availableDecisions:['accept','cancel'],commandActions:[{type:'unknown'}],proposedExecpolicyAmendment:['b']}
  const scope = (params, assessment={}, execution={networkAccess:false})=>approvalScope(method,params,assessment,execution).key
  assert.equal(scope(p),scope(q))
  for (const change of [{command:'python other.py'},{cwd:'D:/other'},{environmentId:'remote'},{additionalPermissions:{network:{enabled:true}}},{grantRoot:'D:/'}]) assert.notEqual(scope(p),scope({...q,...change}))
  assert.notEqual(scope(p),scope(q,{}, {networkAccess:true}))
  assert.notEqual(scope(p,{}, {cliProfile:'a'}),scope(q,{}, {cliProfile:'b'}))
  assert.equal(scope(p,{category:'read'}),scope({...q,command:'new validated code'},{category:'read'}))
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

test('shell-only patch fallback creates Unicode files exclusively and exposes unsafe paths to approval', { skip: process.platform !== 'win32' }, async () => {
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'stable-patch-create-'))
  try {
    const patch="*** Begin Patch\n*** Add File: 数据.py\n+print('青岛')\n+text = \"'@\"\n*** End Patch"
    const call=normalizeWindowsCall({name:'shell_command'},{command:`apply_patch <<'PATCH'\n${patch}\nPATCH`},new Map(),python)
    const params={cwd:workspace,command:[shell,'-NoProfile','-Command',call.args.command].map(quote).join(' ')}
    assert.equal((await classifyCodexApproval(method,params,workspace)).risk,'safe')
    const execute=()=>execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(call.args.command,'utf16le').toString('base64')],{cwd:workspace,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})
    execute()
    const output=fs.readFileSync(path.join(workspace,'数据.py'),'utf8').replace(/^\uFEFF/,'')
    assert.equal(output,"print('青岛')\ntext = \"'@\"\n")
    assert.throws(execute,'Existing file must not be overwritten')
    assert.equal(fs.readFileSync(path.join(workspace,'数据.py'),'utf8').replace(/^\uFEFF/,''),output)
    const outside=normalizeWindowsCall({name:'shell_command'},{command:`apply_patch <<'PATCH'\n${patch.replace('数据.py','../outside.py')}\nPATCH`},new Map(),python)
    assert.equal((await classifyCodexApproval(method,{cwd:workspace,command:[shell,'-NoProfile','-Command',outside.args.command].map(quote).join(' ')},workspace)).risk,'high')
  } finally {fs.rmSync(workspace,{recursive:true,force:true})}
})
