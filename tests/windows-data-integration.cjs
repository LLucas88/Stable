'use strict'
// Native Codex and Windows PowerShell 5, synthetic BOM/Chinese data, no provider.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { CodexHarnessRunner } = require('../desktop/services/codex-harness.cjs')
const { StableStore } = require('../desktop/services/store.cjs')
const { WendingCliService } = require('../desktop/services/wending-cli.cjs')
const { normalizeWindowsCall } = require('../desktop/services/windows-command.cjs')
async function main() {
  const root = path.resolve(__dirname, '../qa-artifacts/windows-data', String(Date.now()))
  const workspace = path.join(root,'workspace'); fs.mkdirSync(workspace,{recursive:true})
  fs.writeFileSync(path.join(workspace,'input.json'),'\uFEFF'+JSON.stringify({result:[{'商品名称':'青岛虾饺','数量':3},{'商品名称':'青岛虾饺','数量':2}]}))
  const service = new WendingCliService({appPath:path.resolve(__dirname,'..'),userData:root,workspace,packaged:false})
  let store = new StableStore(root)
  const id = store.activeConversationId()
  const cli = service.forConversation(id)
  const python = path.join(cli.root(),'python/python.exe')
  const source = `import json\nfrom collections import defaultdict\nrows=json.load(open('input.json',encoding='utf-8-sig'))['result']\ngroups=defaultdict(int)\nfor r in rows:\n    groups[r['商品名称']]+=r['数量']\nprint(json.dumps(dict(groups),ensure_ascii=False))`
  const script = `@'\n${source}\n'@ | python -X utf8 -`
  const normalized = normalizeWindowsCall({name:'shell_command'},{command:script},new Map(),python)
  const shell = path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe')
  const ps5 = execFileSync(shell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(normalized.args.command,'utf16le').toString('base64')],{cwd:workspace,windowsHide:true,encoding:'utf8',timeout:15000})
  assert.deepEqual(JSON.parse(ps5),{'青岛虾饺':5})
  console.log('POWERSHELL5_UTF8_BOM_PASSED')
  async function run(command,decision,expectedPrompts,marker) {
    let issued=false; const outputs=[];let prompts=0
    const runner = new CodexHarnessRunner({userData:root,workspace,environment:cli.environment(),trustedCli:{root:cli.root(),environment:cli.environment()},
      hasConversationApproval:(id,key)=>store.hasConversationApproval(id,key),grantConversationApproval:(id,key,label)=>store.grantConversationApproval(id,key,label),
      fetchImpl:async(_url,options)=>{
        const body=JSON.parse(options.body);let delta,finish
        if(!issued){issued=true;const tool=body.tools.find(item=>item.function.name==='shell_command');assert.ok(tool);delta={tool_calls:[{index:0,id:'probe',type:'function',function:{name:tool.function.name,arguments:JSON.stringify({command,workdir:workspace,login:false,timeout_ms:15000})}}]};finish='tool_calls'}
        else{outputs.push(...body.messages.filter(item=>item.role==='tool').map(item=>item.content));delta={content:'DONE'};finish='stop'}
        return new Response(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:finish}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}})
      }})
    await runner.run('Run this local synthetic data test once.',{model:'mock',providerId:'mock',baseURL:'https://unused.invalid'},'local-synthetic',60000,event=>{
      if(event.kind==='approval'&&event.status==='running'){
        prompts++;assert.equal(event.approvalRisk,'safe',event.reason)
        runner.answerApproval(event.requestId,true,decision)
      }
    },'workspace-write',[],{key:id,permissionMode:'request'})
    assert.equal(prompts,expectedPrompts)
    if(marker)assert.ok(outputs.some(output=>output.includes(marker)),JSON.stringify(outputs))
  }
  try {
    if (!process.argv.includes('--patch-only')) {
    await run(script,'conversation',1,'青岛虾饺')
    store.db.close();store=new StableStore(root)
    await run(`@'\nimport json\nrows=json.load(open('input.json',encoding='utf-8-sig'))['result']\nprint('SECOND_SUM',sum(r['数量'] for r in rows))\n'@ | python -`,'once',0,'SECOND_SUM 5')
    console.log('NATIVE_DATA_GRANT_REUSE_PASSED')
    }
    // A native patch tool may be automatically allowed within the workspace.
    await run("apply_patch <<'PATCH'\n*** Begin Patch\n*** Add File: 中文输出.txt\n+青岛虾饺\n*** End Patch\nPATCH",'once',1)
    assert.equal(fs.readFileSync(path.join(workspace,'中文输出.txt'),'utf8').trim(),'青岛虾饺')
    console.log('NATIVE_PATCH_UNICODE_PASSED')
  } finally {store.db.close();service.dispose()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
