'use strict'
// Real Codex shell execution, two concurrent synthetic login profiles, no remote API/model.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WendingCliService } = require('../desktop/services/wending-cli.cjs')
const { CodexHarnessRunner } = require('../desktop/services/codex-harness.cjs')
async function main() {
  const root = path.resolve(__dirname, '../qa-artifacts/wending-task-native', String(Date.now()))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace, { recursive: true })
  const service = new WendingCliService({ appPath: path.resolve(__dirname, '..'), userData: root, workspace, packaged: false })
  async function run(id, brand) {
    const cli = service.forConversation(id)
    fs.writeFileSync(path.join(cli.options.configDirectory, 'config.json'), JSON.stringify(Object.fromEntries(Object.entries({ wnToken: `synthetic-${brand}`, third_login_channel: '1', stable_brand_id: brand }).map(([key,value])=>[key,Buffer.from(value).toString('base64')]))))
    const quote = value => `'${value.replace(/'/g,"''")}'`
    const command = `& ${quote(path.join(cli.root(),'python/python.exe'))} -B -X utf8 ${quote(path.join(__dirname,'fixtures/wending-task-scope.py'))} ok`
    let issued = false; const outputs = []
    const runner = new CodexHarnessRunner({ userData: root, workspace, environment: cli.environment(), fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      let delta, finish
      if (!issued) {
        issued = true
        const tool = body.tools.find(item => item.function.name === 'shell_command'); assert.ok(tool)
        delta = {tool_calls:[{index:0,id:`probe_${id}`,type:'function',function:{name:tool.function.name,arguments:JSON.stringify({command,workdir:workspace,login:false,timeout_ms:15000})}}]};finish='tool_calls'
      } else { outputs.push(...body.messages.filter(item=>item.role==='tool').map(item=>item.content));delta={content:'DONE'};finish='stop' }
      return new Response(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:finish}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}})
    }})
    await runner.run('Run the isolated local fixture once.',{id:'mock',providerId:'mock',model:'mock',baseURL:'https://unused.invalid/v1'},'synthetic-local',60000,event=>{
      if(event.kind==='approval'&&event.status==='running'){assert.ok(event.toolName.includes('wending-task-scope.py'));runner.answerApproval(event.requestId,true)}
    },'workspace-write',[],{key:id,permissionMode:'full'})
    assert.ok(outputs.some(output=>output.includes(`"brand": "${brand}"`)),JSON.stringify({id,outputs}))
    assert.ok(outputs.every(output=>!output.includes(`"brand": "${brand==='100'?'200':'100'}"`)))
    console.log(`NATIVE_TASK_${id}_BRAND_${brand}_PASSED`)
  }
  try { await Promise.all([run('a','100'),run('b','200')]); console.log('WENDING_TASK_NATIVE_PASSED') } finally { service.dispose() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
