'use strict'

// Explicit native smoke suite: real SDK + packaged Claude binary, a loopback
// Messages bridge, and an in-memory Chat Completions provider. No real key or
// external inference is used. Run: node --test --test-concurrency=1 tests/claude-sdk-integration.cjs
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ClaudeHarnessRunner, sessionDirectory } = require('../desktop/services/claude-harness.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')
const { CLI_VERSION } = require('../desktop/services/claude-runtime-loader.cjs')

const model = { providerId: 'fixture', model: 'fixture-model', baseURL: 'https://provider.invalid/v1' }
const credential = 'local-native-fixture-key'

test('real SDK background Bash survives an early answer and returns its result', { timeout: 60000 }, async t => {
  const events = []; let failure; let sawBackground = false
  const { workspace, runner } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [{ id: 'background-command', name: 'Bash', input: { command: 'sleep 3; printf BACKGROUND_DONE > background.txt; printf BACKGROUND_OUTPUT', run_in_background: true } }] })
      if (number === 2) {
        const result = toolResult(body, 'background-command')
        assert.match(result, /background|task_id/i)
        assert.doesNotMatch(result, /不允许后台/)
        sawBackground = true
        return upstream({ text: 'WAITING_FOR_BACKGROUND' })
      }
      assert.equal(fs.readFileSync(path.join(workspace, 'background.txt'), 'utf8'), 'BACKGROUND_DONE')
      if (number === 3) {
        const completed = events.findLast(e => e.taskOutputFile && e.status === 'completed')
        assert(completed, 'SDK completion carries the registered output path')
        return upstream({ calls: [{ id: 'background-output', name: 'Read', input: { file_path: completed.taskOutputFile } }] })
      }
      assert.match(toolResult(body, 'background-output'), /BACKGROUND_OUTPUT/)
      return upstream({ text: 'BACKGROUND_DELIVERED' })
    } catch (error) { failure = error; return upstream({ text: 'FIXTURE_FAILED' }) }
  })
  const answer = await runner.run('Run a background command and report its completed output.', model, credential, 40000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.ifError(failure)
  assert.equal(sawBackground, true)
  assert.equal(answer, 'BACKGROUND_DELIVERED')
  assert(events.some(e => e.taskId && e.status === 'running'))
  assert(events.some(e => e.taskId && e.status === 'completed'))
})

test('real SDK single task stop leaves another background command and the model running', { timeout: 60000 }, async t => {
  const events = []; let failure; let stopping
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [
      { id: 'cancel-one', name: 'Bash', input: { command: 'sleep 20; printf BAD > cancelled.txt', description: 'STOP_ME', run_in_background: true } },
      { id: 'keep-one', name: 'Bash', input: { command: 'sleep 3; printf KEPT > kept.txt', description: 'KEEP_ME', run_in_background: true } },
    ] })
    return upstream({ text: fs.existsSync(path.join(workspace, 'kept.txt')) ? 'ONE_STOPPED_OTHER_DELIVERED' : 'WAITING_FOR_OTHER' })
  })
  const answer = await runner.run('Run two commands, stop the first only.', model, credential, 45000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
    if (event.taskId && event.taskBackground && event.status === 'running' && event.title === 'STOP_ME' && !stopping) {
      stopping = runner.stopTask(event.taskId).catch(error => { failure = error })
    }
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  await stopping; assert.ifError(failure)
  assert.equal(answer, 'ONE_STOPPED_OTHER_DELIVERED')
  assert.equal(runner.cancelled, false)
  assert.equal(fs.existsSync(path.join(workspace, 'cancelled.txt')), false)
  assert.equal(fs.readFileSync(path.join(workspace, 'kept.txt'), 'utf8'), 'KEPT')
  assert(events.some(e => e.taskId && e.status === 'cancelled'))
  assert(events.some(e => e.taskId && e.status === 'completed'))
})

test('real SDK background command failure reaches the model which repairs and delivers', { timeout: 60000 }, async t => {
  const events = []
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'fails-in-background', name: 'Bash', input: { command: 'sleep 2; echo BACKGROUND_FAILURE >&2; exit 7', run_in_background: true } }] })
    if (toolResult(body, 'repair-background')) return upstream({text:'REPAIRED_BACKGROUND_FAILURE'})
    if (events.some(e => e.taskId && e.status === 'failed')) {
      assert.match(JSON.stringify(body.messages), /exit code 7|BACKGROUND_FAILURE|failed/i)
      return upstream({calls:[{id:'repair-background',name:'Bash',input:{command:'printf REPAIRED > repaired.txt'}}]})
    }
    return upstream({text:'WAITING_FOR_BACKGROUND'})
  })
  const answer = await runner.run('Run a job and repair a failure.',model,credential,40000,event=>{
    events.push(event)
    if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.equal(answer,'REPAIRED_BACKGROUND_FAILURE')
  assert.equal(fs.readFileSync(path.join(workspace,'repaired.txt'),'utf8'),'REPAIRED')
  assert(events.some(e=>e.taskId&&e.status==='failed'))
  assert.equal(runner.lastOutcome.status,'completed')
})

test('real SDK background failures count final outcomes and block only the fourth identical retry', {timeout:60000},async t=>{
  let attempts=0;let failure;const events=[]
  const {workspace,runner}=fixture(t,body=>{
    try {
      if(runner.tasks.background.length)return upstream({text:'WAITING_FOR_ATTEMPT'})
      if(attempts<4){attempts++;return upstream({calls:[{id:'background-failure-'+attempts,name:'Bash',input:{command:'printf attempt >> bg-attempts.txt; sleep 0.1; echo SOURCE_BG_FAILURE >&2; exit 7',run_in_background:true}}]})}
      assert.match(toolResult(body,'background-failure-4'),/此调用未执行/)
      return upstream({text:'BACKGROUND_FAILURE_EXPLAINED'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  const answer=await runner.run('Handle repeated background failure.',model,credential,45000,event=>{
    events.push(event);if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(answer,'BACKGROUND_FAILURE_EXPLAINED')
  assert.equal(fs.readFileSync(path.join(workspace,'bg-attempts.txt'),'utf8'),'attempt'.repeat(3))
  assert.equal(events.filter(e=>e.toolName==='Bash'&&e.status==='failed').length,4)
})

test('real SDK foreground Bash can be moved to background through the task control API', { timeout: 60000 }, async t => {
  let moved; let failure; const events=[]
  const {workspace,runner}=fixture(t,(_body,number)=>{
    if(number===1)return upstream({calls:[{id:'move-command',name:'Bash',input:{command:'sleep 3; printf MOVED > moved.txt',description:'MOVE_ME'}}]})
    return upstream({text:fs.existsSync(path.join(workspace,'moved.txt'))?'MOVED_AND_DELIVERED':'WAITING_FOR_MOVED'})
  })
  const answer=await runner.run('Run a command, move it to the background and await its result.',model,credential,40000,event=>{
    events.push(event)
    if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
    if(event.taskId&&event.taskType==='local_bash'&&event.taskToolUseId&&!event.taskBackground&&event.status==='running'&&!moved) {
      moved=runner.backgroundTask(event.taskId).catch(error=>{failure=error})
    }
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure)
  assert.equal(await moved,true,JSON.stringify(events.filter(e=>e.taskId)))
  assert.equal(answer,'MOVED_AND_DELIVERED')
  assert(events.some(e=>e.taskBackground))
})

test('real SDK native TaskStop is scoped and returns cancellation to the model', { timeout: 60000 }, async t => {
  const events=[];let failure
  const {workspace,runner}=fixture(t,(body,number)=>{
    try {
      if(number===1)return upstream({calls:[{id:'find-stop',name:'ToolSearch',input:{query:'select:TaskStop',max_results:1}}]})
      if(number===2){
        assert(body.tools.some(tool=>tool.function.name==='TaskStop'),JSON.stringify(body.messages.at(-1)))
        return upstream({calls:[{id:'stop-foreign',name:'TaskStop',input:{task_id:'foreign-task'}}]})
      }
      if(number===3){
        assert.match(toolResult(body,'stop-foreign'),/不属于|No task|not found/i)
        return upstream({calls:[{id:'start-to-stop',name:'Bash',input:{command:'sleep 20; printf BAD > should-not-exist.txt',run_in_background:true}}]})
      }
      if(number===4){
        const task=events.findLast(e=>e.taskId&&e.taskBackground&&e.status==='running')
        assert(task)
        return upstream({calls:[{id:'stop-owned',name:'TaskStop',input:{task_id:task.taskId}}]})
      }
      assert.match(toolResult(body,'stop-owned'),/stop|killed|success/i)
      return upstream({text:'OWNED_TASK_STOPPED'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  const result=await runner.run('Stop a background command using TaskStop.',model,credential,40000,event=>{
    events.push(event);if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(result,'OWNED_TASK_STOPPED')
  assert.equal(fs.existsSync(path.join(workspace,'should-not-exist.txt')),false)
  assert(events.some(e=>e.taskId&&e.status==='cancelled'))
})

test('real SDK waits for model consumption when a background task finishes during an earlier response', { timeout: 60000 }, async t => {
  const {workspace,runner}=fixture(t,async(_body,number)=>{
    if(number===1)return upstream({calls:[{id:'fast-bg',name:'Bash',input:{command:'sleep 1; printf FAST_DONE',run_in_background:true}}]})
    if(number===2){await new Promise(r=>setTimeout(r,2500));return upstream({text:'OLD_RESPONSE_BEFORE_RESULT'})}
    return upstream({text:'RESULT_CONSUMED'})
  })
  const answer=await runner.run('Wait for the background job result.',model,credential,40000,event=>{
    if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.equal(answer,'RESULT_CONSUMED')
})

test('real SDK whole-run cancellation reaps background commands before delayed writes', { timeout: 30000 }, async t => {
  const {workspace,runner}=fixture(t,(_body,number)=>number===1
    ? upstream({calls:[{id:'background-to-reap',name:'Bash',input:{command:'printf STARTED > bg-started.txt; sleep 3; printf ORPHAN > bg-orphan.txt',run_in_background:true}}]})
    : upstream({text:'WAITING_FOR_BACKGROUND'}))
  const result=runner.run('Start a cancellable background command.',model,credential,20000,event=>{
    if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
  },'workspace-write',[],{cwd:workspace,networkAccess:true}).then(value=>({value}),error=>({error}))
  await until(()=>fs.existsSync(path.join(workspace,'bg-started.txt')))
  runner.cancel()
  assert.equal((await result).error?.code,'STABLE_RUN_CANCELLED')
  await new Promise(resolve=>setTimeout(resolve,3500))
  assert.equal(fs.existsSync(path.join(workspace,'bg-orphan.txt')),false)
})

test('real SDK stopping the only background task after an early answer wakes the model', {timeout:45000},async t=>{
  let stopped;let failure
  const {workspace,runner}=fixture(t,(_body,number)=>number===1
    ?upstream({calls:[{id:'only-background',name:'Bash',input:{command:'sleep 20; printf BAD > only-orphan.txt',run_in_background:true}}]})
    :upstream({text:stopped?'ONLY_TASK_STOP_EXPLAINED':'WAITING_FOR_ONLY_TASK'}))
  const answer=await runner.run('Start one background job.',model,credential,30000,event=>{
    if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)
    if(event.id==='background-wait'&&!stopped)stopped=runner.stopTask(runner.tasks.background[0].id).catch(error=>{failure=error})
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  await stopped;assert.ifError(failure);assert.equal(answer,'ONLY_TASK_STOP_EXPLAINED')
  assert.equal(runner.cancelled,false);assert.equal(fs.existsSync(path.join(workspace,'only-orphan.txt')),false)
})

test('real SDK background child Bash still waits for Stable approval and reports its result', { timeout: 60000 }, async t => {
  let approvals=0;let failure
  const {workspace,runner}=fixture(t,body=>{
    try {
      const child=body.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('BACKGROUND_CHILD_APPROVAL'))
      if(child){
        if(!toolResult(body,'bg-child-write'))return upstream({calls:[{id:'bg-child-write',name:'Bash',input:{command:'printf CHILD_APPROVED > child-approved.txt'}}]})
        return upstream({text:'BACKGROUND_CHILD_RESULT'})
      }
      if(!toolResult(body,'bg-child'))return upstream({calls:[{id:'bg-child',name:'Agent',input:{description:'Approved background work',prompt:'BACKGROUND_CHILD_APPROVAL: execute the requested command.',subagent_type:'stable-worker',run_in_background:true}}]})
      if(!JSON.stringify(body.messages).includes('BACKGROUND_CHILD_RESULT'))return upstream({text:'WAITING_FOR_CHILD'})
      assert.equal(fs.readFileSync(path.join(workspace,'child-approved.txt'),'utf8'),'CHILD_APPROVED')
      return upstream({text:'BACKGROUND_CHILD_DELIVERED'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  const answer=await runner.run('Delegate an approved background command.',model,credential,40000,event=>{
    if(event.kind==='approval'&&event.status==='running'){
      approvals++;assert.equal(fs.existsSync(path.join(workspace,'child-approved.txt')),false)
      runner.answerApproval(event.requestId,true)
    }
  },'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(answer,'BACKGROUND_CHILD_DELIVERED');assert.equal(approvals,1)
})

test('real SDK resumes private reasoning on text-only answers without exposing it', { timeout: 120000 }, async t => {
  let failure
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    try { if (number > 1) {
      const previous = body.messages.filter(m => m.role === 'assistant')
      assert(previous.length >= number - 1)
      for (const [index, message] of previous.entries()) assert.equal(message.reasoning_content, 'private-native-replay-' + (index + 1))
    } } catch (error) { failure = error }
    return upstream({ text: 'REPLAY_OK', reasoning: 'private-native-replay-' + number })
  })
  for (const prompt of ['Say hello', 'Continue', 'Continue again']) {
    const events = []
    const answer = await runner.run(prompt, model, credential, 35000, e => events.push(e), 'read-only', [], { key: 'text-reasoning', cwd: workspace })
    assert.ifError(failure)
    assert.equal(answer, 'REPLAY_OK')
    assert.doesNotMatch(JSON.stringify(events), /private-native-replay/)
  }
  assert.equal(requests.length, 3)
})

test('real SDK identity reminders follow the actual route on fresh and resumed turns', { timeout: 45000 }, async t => {
  let failure
  const { workspace, runner, requests } = fixture(t, body => {
    try {
      assert.equal(body.model, 'deepseek-flash')
      const messages = JSON.stringify(body.messages)
      assert.match(messages, /DeepSeek Flash/)
      assert.doesNotMatch(messages, /You are powered by the model named Sonnet|Assistant knowledge cutoff is August|You are a Claude agent, built on/)
    } catch (error) { failure = error }
    return upstream({ text: '我是 DeepSeek Flash，模型 ID 是 deepseek-flash。' })
  }, { expectedModel: 'deepseek-flash' })
  const selected = { ...model, model: 'deepseek-flash', displayName: 'DeepSeek Flash', contextWindow: 1000000 }
  for (const prompt of ['你是什么模型', '你现在是哪个模型？']) {
    const count = requests.length
    const ready = await require('../desktop/services/clarification.cjs').clarifyBeforeExecution({ payload: { prompt }, messages: [], ask: () => { throw Error('unexpected preflight') } })
    assert.equal(ready.status, 'ready')
    assert.match(await runner.run(prompt, selected, credential, 20000, undefined, 'read-only', [], { key: 'identity', cwd: workspace }), /DeepSeek/)
    assert.equal(requests.length - count, 1)
    assert.ifError(failure)
  }
})

test('upgraded Codex conversation continues with bundled Git Bash and no system Git on PATH', { timeout: 60000 }, async t => {
  let failure
  const { root, workspace, runner } = fixture(t, (body, number) => {
    try {
      if (number === 1) {
        assert.match(JSON.stringify(body.messages), /ORIGINAL_REQUIREMENT/)
        return upstream({ calls: [{ id: 'read-legacy', name: 'Read', input: { file_path: historyFile, offset: 200, limit: 20 } }] })
      }
      if (number === 2) {
        assert.match(toolResult(body, 'read-legacy'), /history 209/)
        return upstream({ calls: [{ id: 'bundled-bash', name: 'Bash', input: { command: "git --version; printf '<html><body>UPGRADE_OK</body></html>' > upgrade.html; cat upgrade.html", timeout: 10000 } }] })
      }
      assert.match(toolResult(body, 'bundled-bash'), /git version 2\.56\.0\.windows\.3/)
      assert.match(toolResult(body, 'bundled-bash'), /UPGRADE_OK/)
      return upstream({ text: 'UPGRADE_DELIVERED: upgrade.html' })
    } catch (error) { failure = error; return upstream({ text: 'FAILED' }) }
  }, { environment: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, PATH: path.join(process.env.SystemRoot, 'System32') } })
  const { StableStore } = require('../desktop/services/store.cjs'), store = new StableStore(root)
  const id = store.activeConversationId()
  store.addMessage(id, 'user', 'ORIGINAL_REQUIREMENT: produce an HTML report')
  for (let i=0;i<210;i++) store.addMessage(id, 'assistant', 'history ' + i)
  store.saveRuntimeSession(id, { home: path.join(root, 'codex/sessions/old'), threadId: 'codex-old' })
  const context = require('../desktop/services/legacy-conversation.cjs').legacyConversationContext(store, root, id)
  const historyFile = path.join(context.readableRoot, 'visible-history.jsonl')
  store.close()
  const answer = await runner.run('Continue the previous report', model, credential, 45000, event => {
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { key: id, initialPrompt: context.instruction, cwd: workspace, readableRoots: [context.readableRoot], networkAccess: true })
  assert.ifError(failure)
  assert.equal(answer, 'UPGRADE_DELIVERED: upgrade.html')
  assert.match(fs.readFileSync(path.join(workspace, 'upgrade.html'), 'utf8'), /UPGRADE_OK/)
})

test('real SDK recovers from a gateway context rejection by compacting instead of aborting', { timeout: 60000 }, async t => {
  for (const malformedFirstSummary of [false, true]) await t.test(malformedFirstSummary ? 'missing summary tags are repaired once' : 'well-formed summary needs one request', async t => {
    let seeded = false, rejected = false, summaries = 0
    const events = [], summaryPrompts = []
    const { root, workspace, runner, requests } = fixture(t, body => {
      const text = JSON.stringify(body.messages)
      const summaryPrompt = compactionPrompt(body)
      if (summaryPrompt) {
        summaryPrompts.push(summaryPrompt); summaries++
        assert(summaries <= (malformedFirstSummary ? 2 : 1), 'summary recovery must remain bounded')
        const summary = 'COMPACTED_CONTEXT: Keep existing svgcharts.py edits. Continue checking the report.'
        // SDK 2.1.311+ validates the requested summary wrapper and retries a
        // response without it. The fixture must satisfy the real wire contract.
        return upstream({ text: malformedFirstSummary && summaries === 1 ? summary : `<summary>${summary}</summary>`, inputTokens: 2000 })
      }
      if (!seeded) { seeded = true; return upstream({ text: 'Saved svgcharts.py. ' + 'historical report detail '.repeat(15000), inputTokens: 20000 }) }
      if (!rejected) { rejected = true; return Response.json({ error: { message: '请求内容与最大输出长度超过模型上下文限制。' } }, { status: 400 }) }
      assert(summaries > 0)
      assert.match(text, /COMPACTED_CONTEXT/)
      assert.match(text, /svgcharts\.py edits/)
      return upstream({ text: 'CONTEXT_RECOVERED', inputTokens: 2500 })
    })
    const profile = { ...model, contextWindow: 1000000 }
    const session = { key: 'context-rejection', cwd: workspace }
    await runner.run('Save report progress', profile, credential, 25000, e => events.push(e), 'read-only', [], session)
    const originalThread = runner.threadId
    assert.equal(await runner.run('Continue checking the report', profile, credential, 30000, e => events.push(e), 'read-only', [], session), 'CONTEXT_RECOVERED')
    assert.equal(runner.threadId, originalThread)
    assert.equal(summaries, malformedFirstSummary ? 2 : 1)
    if (malformedFirstSummary) {
      assert(summaryPrompts[1].startsWith(summaryPrompts[0]), 'the second request retries the same summary rather than starting a second compaction phase')
      assert.match(summaryPrompts[1].slice(summaryPrompts[0].length), /summary inside <summary><\/summary> tags/)
    }
    assert.equal(events.filter(e => e.title === '上下文已自动压缩').length, 1)
    assert(events.some(e => e.title === '网关拒绝上下文长度，正在自动压缩'))
    assert.equal(requests.length, malformedFirstSummary ? 5 : 4)
    const sizes = requests.map(body => JSON.stringify(body.messages).length)
    assert(sizes.at(-1) < Math.max(...sizes.slice(0, -1)))
    const usage = require('../desktop/services/context-usage.cjs').readContextUsage(root, session.key, profile)
    assert(usage.usedTokens < profile.contextWindow * .8)
  })
})

test('real SDK screenshot crosses the Cloud boundary as user image evidence', { timeout: 45000 }, async t => {
  const { CloudGatewayProxy } = require('../desktop/services/cloud-gateway-proxy.cjs')
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='
  let failure, calls = 0
  const proxy = new CloudGatewayProxy({ account: { baseURL: 'https://strict-cloud.invalid', token: () => 'cloud-fixture' }, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls++
    try {
      assert(!body.messages.some(m => m.role !== 'user' && Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')))
      if (calls === 1) return upstream({ calls: [{ id: 'discover', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_browser', max_results: 1 } }] })
      if (calls === 2) return upstream({ calls: [{ id: 'shot', name: 'mcp__stable__stable_browser', input: { action: 'screenshot', tabId: 'fixture' } }] })
      if (calls === 4) return upstream({ text: 'CLOUD_SCREENSHOT_OK' })
      assert.equal(calls, 3)
      assert.equal(typeof toolResult(body, 'shot'), 'string')
      const evidence = body.messages.find(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))
      assert(evidence)
      assert.match(evidence.content[0].text, /tool_call_id=shot/)
      assert.equal(evidence.content.find(p => p.type === 'image_url').image_url.url, image)
      const record = toolResult(body, 'shot').split('\n\n').flatMap(text => { try { return [JSON.parse(text)] } catch { return [] } }).find(value => value.reviewNotebook)
      assert(record)
      return upstream({ calls: [{ id: 'review', name: 'mcp__stable__stable_browser', input: { action: 'review', tabId: 'fixture', reviewUpdates: record.reviewNotebook.evidence.map(item => ({ check: 'screenshot', status: 'passed', evidenceId: item.id, note: 'fixture image transport verified' })) } }] })
    } catch (error) { failure = error; return upstream({ text: 'FIXTURE_FAILED' }) }
  } })
  await proxy.start(); t.after(() => proxy.stop())
  const { workspace, runner } = fixture(t, body => fetch(proxy.baseURL + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + proxy.secret }, body: JSON.stringify(body),
  }), { builtinTools: () => ({ execute: async () => ({ tabId: 'fixture', image }), cancel() {}, dispose() {} }) })
  const answer = await runner.run('Inspect the screenshot', model, credential, 30000, undefined, 'workspace-write', [], { cwd: workspace })
  assert.ifError(failure); assert.equal(answer, 'CLOUD_SCREENSHOT_OK'); assert.equal(calls, 4)
})

test('real SDK exposes a definitive gateway rejection and does not retry it', { timeout: 45000 }, async t => {
  const events = []
  const { workspace, runner, requests } = fixture(t, () => Response.json({ error: { message: '图片消息格式无效：只支持用户消息中的图片' } }, { status: 400 }))
  await assert.rejects(runner.run('Inspect screenshot', model, credential, 30000, event => events.push(event), 'workspace-write', [], { cwd: workspace }), /HTTP 400.*图片消息格式无效/)
  assert.equal(requests.length, 1)
  assert.equal(events.findLast(event => event.id === 'run-progress').status, 'failed')
  assert.match(events.findLast(event => event.id === 'run-progress').detail, /图片消息格式无效/)
})

test('real SDK discovers image generation, uses approval, and receives a durable artifact', { timeout: 45000 }, async t => {
  let failure, generated = 0
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [{ id: 'discover-image', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_image_generate', max_results: 1 } }] })
      if (number === 2) return upstream({ calls: [{ id: 'image', name: 'mcp__stable__stable_image_generate', input: { prompt: '蓝色小鸟插画', output: 'bird.png' } }] })
      assert.equal(number, 3)
      const output = toolResult(body, 'image')
      assert.match(JSON.stringify(output), /bird.png/)
      assert.deepEqual(fs.readFileSync(path.join(workspace, 'bird.png')), png)
      return upstream({ text: 'IMAGE_ARTIFACT_VERIFIED' })
    } catch (error) { failure = error; return upstream({ text: 'FIXTURE_FAILED' }) }
  }, { builtinTools: context => {
    const { BuiltinTools } = require('../desktop/services/builtin-tools.cjs')
    const tools = new BuiltinTools({ ...context, browserSession: {} })
    tools.generateImage = require('../desktop/services/image-generation.cjs').createImageGenerator({
      resolveApiKey: () => 'image-only-secret',
      fetchImpl: async (_url, request) => {
        generated++; assert.equal(request.headers.Authorization, 'Bearer image-only-secret')
        return Response.json({ data: [{ url: 'https://cdn.bigmodel.cn/fixture.png' }] })
      }, download: async () => png,
      nativeImage: { createFromBuffer: bytes => ({ isEmpty: () => !bytes.equals(png), getSize: () => ({ width: 1, height: 1 }), toPNG: () => png }) },
    })
    return tools
  } })
  const answer = await runner.run('Create a bird illustration', model, credential, 35000, event => {
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.ifError(failure); assert.equal(answer, 'IMAGE_ARTIFACT_VERIFIED')
  assert.equal(generated, 1); assert.equal(requests.length, 3)
  assert(!JSON.stringify(requests).includes('image-only-secret'))
})

test('real SDK browser batch returns multiple observations in one model round trip', { timeout: 45000 }, async t => {
  let failure, captures = 0
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [{ id: 'discover-batch', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_browser', max_results: 1 } }] })
      if (number === 2) return upstream({ calls: [{ id: 'batch', name: 'mcp__stable__stable_browser', input: {
        action: 'batch', tabId: 'fixture', steps: [{ action: 'resize', width: 390 }, { action: 'screenshot', purpose: 'mobile' },
          { action: 'resize', width: 1440 }, { action: 'screenshot', purpose: 'desktop' }],
      } }] })
      if (number === 3) {
        const parts = toolResult(body, 'batch')
        assert(Array.isArray(parts))
        const records = parts.flatMap(p => { try { return [JSON.parse(p.text)] } catch { return [] } })
        assert.equal(records.filter(r => r.screenshotPath).length, 2)
        assert(parts.some(p => p.type === 'image_url'))
        const book = records.find(r => r.reviewNotebook).reviewNotebook
        assert.deepEqual(book.evidence.map(e => e.viewport.width), [390, 1440])
        return upstream({ calls: [{ id: 'batch-review', name: 'mcp__stable__stable_browser', input: {
          action: 'review', tabId: 'fixture', reviewUpdates: book.evidence.map(e => ({
            check: e.purpose, status: 'passed', evidenceId: e.id, note: 'fixture pixels verified',
          })),
        } }] })
      }
      assert.equal(number, 4)
      return upstream({ text: 'BATCH_VERIFIED' })
    } catch (error) { failure = error; return upstream({ text: '[[STABLE_WAITING_FOR_INPUT]]' }) }
  }, { builtinTools: () => {
    let width = 1280
    return { execute: async request => {
      if (request.args.width) width = request.args.width
      if (request.args.action === 'screenshot') {
        captures++
        return { tabId: 'fixture', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' }
      }
      return { tabId: 'fixture', viewport: { width }, controls: [] }
    }, cancel() {}, dispose() {} }
  } })
  const answer = await runner.run('Verify both layouts', model, credential, 35000, undefined, 'workspace-write', [], { cwd: workspace })
  assert.ifError(failure); assert.equal(answer, 'BATCH_VERIFIED')
  assert.equal(captures, 2); assert.equal(requests.length, 4)
})

test('real SDK Stop returns unfinished review to the same run and review completes without another screenshot', { timeout: 45000 }, async t => {
  let evidenceId, failure, captures = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [{ id: 'discover', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_browser', max_results: 1 } }] })
      if (number === 2) return upstream({ calls: [{ id: 'shot', name: 'mcp__stable__stable_browser', input: { action: 'screenshot', tabId: 'fixture',
        reviewUpdates: [{ check: 'mobile', status: 'open', note: 'verify layout' }] } }] })
      if (number === 3) {
        const result = toolResult(body, 'shot'), parts = typeof result === 'string' ? [{ text: result }] : result
        evidenceId = parts.flatMap(p => { try { return [JSON.parse(p.text)] } catch { return [] } }).find(p => p.reviewNotebook).reviewNotebook.evidence[0].id
        return upstream({ text: 'PREMATURE_FINISH' })
      }
      if (number === 4) {
        assert.match(JSON.stringify(body.messages), /未完成的检查记录/)
        return upstream({ calls: [{ id: 'review', name: 'mcp__stable__stable_browser', input: { action: 'review', tabId: 'fixture',
          reviewUpdates: [{ check: 'mobile', status: 'passed', evidenceId, note: 'current pixels verified' }] } }] })
      }
      assert.equal(number, 5)
      assert.match(JSON.stringify(toolResult(body, 'review')), /passed/)
      return upstream({ text: 'REVIEW_COMPLETE' })
    } catch (error) { failure = error; return upstream({ text: '[[STABLE_WAITING_FOR_INPUT]]' }) }
  }, { builtinTools: () => ({ execute: async () => {
    captures++; return { tabId: 'fixture', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' }
  }, cancel() {}, dispose() {} }) })
  const answer = await runner.run('Inspect and resolve layout problems', model, credential, 35000, undefined, 'workspace-write', [], { cwd: workspace })
  assert.ifError(failure)
  assert.equal(answer, 'REVIEW_COMPLETE')
  assert.equal(captures, 1)
})

test('real SDK browser review completes after a verified check supersedes its unbound duplicate', { timeout: 45000 }, async t => {
  const { deliveryRequest, runWithDeliveryChecks } = require('../desktop/services/delivery.cjs')
  const browserTool = 'mcp__stable__stable_browser'
  const check = '附录图片嵌入与桌面对齐'
  const prompt = '请检查附录图片与桌面对齐，并生成 HTML 文件。'
  const browser = (id, input) => upstream({ calls: [{ id, name: browserTool, input }] })
  const review = (id, update, tabId) => browser(id, {
    action: 'review', ...(tabId ? { tabId } : {}), reviewUpdates: [{ check, ...update }],
  })
  let fixtureError, evidenceId, audits = 0
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [
        { id: 'discover-review-browser', name: 'ToolSearch', input: { query: 'select:' + browserTool, max_results: 1 } },
      ] })
      if (number === 2) return review('review-unbound', { status: 'open', note: '先记录需验证的桌面布局' })
      if (number === 3) return browser('review-audit', { action: 'audit', tabId: 'fixture' })
      if (number === 4) {
        const { reviewNotebook } = JSON.parse(toolResult(body, 'review-audit').split('\n\n')[0])
        const observation = reviewNotebook.evidence.at(-1)
        assert.equal(observation.tabId, 'fixture')
        evidenceId = observation.id
        return review('review-verified', { status: 'passed', evidenceId, note: '当前桌面对齐实测通过' }, observation.tabId)
      }
      if (number === 5) return review('review-unbound-missing-proof', { status: 'passed', note: '旧检查未传入证据' }, 'unknown')
      if (number === 6) return review('review-unbound-duplicate', { status: 'blocked', note: '重复记录，早期未绑定标签' }, 'unknown')
      assert.equal(number, 7)
      const { reviewNotebook } = JSON.parse(toolResult(body, 'review-unbound-duplicate').split('\n\n')[0])
      const verified = reviewNotebook.checks.find(entry => entry.check === check && entry.tabId === 'fixture')
      assert.equal(verified?.status, 'passed')
      assert.equal(verified.evidenceId, evidenceId)
      assert.equal(reviewNotebook.checks.length, 1)
      fs.writeFileSync(report, '<!doctype html><title>Checked layout</title>')
      return upstream({ text: '桌面对齐已核验。\n' + report })
    } catch (error) {
      fixtureError = error
      return upstream({ text: '[[STABLE_WAITING_FOR_INPUT]]' })
    }
  }, { builtinTools: () => ({
    execute: async ({ args }) => {
      assert.equal(args.action, 'audit')
      audits++
      return { tabId: 'fixture', epoch: 1, viewport: { width: 1440, height: 900 } }
    },
    cancel() {}, dispose() {},
  }) })

  const report = path.join(workspace, 'checked-report.html')
  const result = await runWithDeliveryChecks({
    workspace, prompt, delivery: deliveryRequest(prompt),
    execute: task => runner.run(task, model, credential, 35000, undefined, 'workspace-write', [], { cwd: workspace }),
    getExecutionOutcome: () => runner.lastOutcome,
  })
  assert.ifError(fixtureError)
  assert.equal(result.status, 'completed')
  assert.equal(runner.lastOutcome.status, 'completed')
  assert.equal(result.answer, '桌面对齐已核验。\n' + report)
  assert.deepEqual(result.artifacts, [report])
  assert.equal(audits, 1)
  assert.equal(requests.length, 7)
})

test('real SDK browser evidence survives MCP and can be read by the native image tool', { timeout: 45000 }, async t => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='
  let evidencePath, evidenceId, captures = 0, failure
  const { root, workspace, runner } = fixture(t, (body, number) => {
    try {
    if (number === 1) return upstream({ calls: [{ id: 'discover-browser', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_browser', max_results: 1 } }] })
    if (number === 2) return upstream({ calls: [{ id: 'take-picture', name: 'mcp__stable__stable_browser', input: { action: 'screenshot', purpose: '检查图片比例' } }] })
    if (number === 3) {
      const result = toolResult(body, 'take-picture')
      const parts = typeof result === 'string' ? [{ type: 'text', text: result }] : result
      const metadata = parts.flatMap(p => { try { return [JSON.parse(p.text)] } catch { return [] } }).find(p => p.screenshotPath)
      assert(metadata, 'actual MCP metadata must survive SDK serialization')
      evidencePath = metadata.screenshotPath
      evidenceId = metadata.reviewNotebook.evidence[0].id
      assert.equal(metadata.reviewNotebook.evidence[0].purpose, '检查图片比例')
      assert.deepEqual(fs.readFileSync(evidencePath), Buffer.from(png, 'base64'))
      return upstream({ calls: [{ id: 'read-evidence', name: 'Read', input: { file_path: evidencePath } }] })
    }
    if (number === 4) {
    const result = toolResult(body, 'read-evidence')
    const parts = typeof result === 'string' ? [{ type: 'text', text: result }] : result
    assert(parts?.some(p => p.type === 'image_url' || /Image bytes identical to tool_call_id=take-picture/.test(p.text || '')), 'native Read must return pixels or an exact reference to the retained capture')
    assert(body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).some(p => p.image_url?.url === 'data:image/png;base64,' + png))
    const runs = path.join(root, 'claude', 'runs')
    const archive = path.join(runs, fs.readdirSync(runs)[0], 'tool-images')
    const archived = path.join(archive, fs.readdirSync(archive)[0])
    assert(fs.readFileSync(archived).equals(Buffer.from(png, 'base64')))
    return upstream({ calls: [{ id: 'reread-archived', name: 'Read', input: { file_path: archived } }] })
    }
    if (number === 5) {
    assert(!JSON.stringify(toolResult(body, 'reread-archived')).includes('Tool execution error:'))
    assert.match(JSON.stringify(toolResult(body, 'reread-archived')), /image_url|Image bytes identical/)
    return upstream({ calls: [{ id: 'record-check', name: 'mcp__stable__stable_browser', input: { action: 'read', tabId: 'fixture',
      reviewUpdates: [{ check: '图片比例', status: 'passed', evidenceId, note: '已看像素，比例正常' }] } }] })
    }
    assert.match(JSON.stringify(toolResult(body, 'record-check')), /passed/)
    assert.match(JSON.stringify(toolResult(body, 'record-check')), /图片比例/)
    return upstream({ text: 'EVIDENCE_REVIEW_FINISHED' })
    } catch (error) { failure = error; return upstream({ text: 'EVIDENCE_REVIEW_FAILED' }) }
  }, { builtinTools: () => ({ execute: async request => {
    assert.equal(request.args.purpose, undefined); assert.equal(request.args.reviewUpdates, undefined)
    if (request.args.action === 'screenshot') { captures++; return { tabId: 'fixture', image: 'data:image/png;base64,' + png } }
    return { tabId: 'fixture' }
  }, cancel() {}, dispose() {} }) })
  const answer = await runner.run('Inspect a screenshot, then read the returned file and finish', model, credential, 30000, undefined, 'workspace-write', [], { cwd: workspace })
  assert.ifError(failure)
  assert.equal(answer, 'EVIDENCE_REVIEW_FINISHED')
  assert.equal(captures, 1)
  assert(fs.existsSync(evidencePath), 'file must remain available after the SDK run ends')
})

test('real SDK repairs a failing script and continues beyond the old three-failure limit', { timeout: 60000 }, async t => {
  const events=[];let requests=0
  const {workspace,runner}=fixture(t,(body,number)=>{
    requests++
    const call=(id,name,input)=>upstream({calls:[{id,name,input}]})
    if(number===1)return call('read-script','Read',{file_path:path.join(workspace,'analyze.sh')})
    if(number===2||number===3||number===5||number===7)return call('run-'+number,'Bash',{command:'bash analyze.sh',timeout:10000})
    if(number===4)return call('repair-one','Edit',{file_path:path.join(workspace,'analyze.sh'),old_string:'exit 1',new_string:'printf SECOND_ERROR >&2; exit 2'})
    if(number===6){assert.match(toolResult(body,'run-5'),/SECOND_ERROR/);return call('repair-two','Edit',{file_path:path.join(workspace,'analyze.sh'),old_string:'printf SECOND_ERROR >&2; exit 2',new_string:'printf REPAIRED'})}
    assert.match(toolResult(body,'run-7'),/REPAIRED/)
    return upstream({text:'REPAIR_VERIFIED'})
  })
  fs.writeFileSync(path.join(workspace,'analyze.sh'),'exit 1\n')
  const result=await runner.run('Repair the script and verify it',model,credential,50000,event=>{events.push(event);if(event.kind==='approval'&&event.status==='running')runner.answerApproval(event.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.equal(result,'REPAIR_VERIFIED');assert.equal(requests,8)
  assert.equal(new Set(events.filter(event=>event.toolName==='Bash'&&event.status==='failed').map(event=>event.id)).size,3)
  assert.equal(fs.readFileSync(path.join(workspace,'analyze.sh'),'utf8'),'printf REPAIRED\n')
})

test('real SDK repeated failures block only the repeated call and preserve main and child recovery',{timeout:120000},async t=>{
 for(const child of [false,true])await t.test(child?'child':'main',async t=>{
  let stage=0,parentStage=0,failure;const events=[]
  const {workspace,runner}=fixture(t,body=>{
   try{
    const isChild=body.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('CHILD_REPEAT_FIXTURE'))
    if(child&&!isChild){
     if(parentStage++===0)return upstream({calls:[{id:'delegate-repeat',name:'Agent',input:{description:'Handle a failed fixture',subagent_type:'stable-worker',run_in_background:false,prompt:'CHILD_REPEAT_FIXTURE: inspect the command failures and use the alternative.'}}]})
     assert.match(toolResult(body,'delegate-repeat'),/MODEL_FAILURE_EXPLANATION/)
     return upstream({text:'PARENT_RECEIVED_MODEL_REASON'})
    }
    stage++
    if(stage<=4)return upstream({calls:[{id:'repeated-'+stage,name:'Bash',input:{command:'bash fail.sh',timeout:10000}}]})
    if(stage===5){assert.match(toolResult(body,'repeated-4'),/此调用未执行/);assert.match(toolResult(body,'repeated-4'),/SOURCE_FAILURE/);return upstream({calls:[{id:'alternative-command',name:'Bash',input:{command:'printf ALTERNATIVE_OK'}}]})}
    assert.match(toolResult(body,'alternative-command'),/ALTERNATIVE_OK/)
    return upstream({text:'MODEL_FAILURE_EXPLANATION: SOURCE_FAILURE blocked the original approach; the alternative was verified.'})
   }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  fs.writeFileSync(path.join(workspace,'fail.sh'),'printf "attempt\\n" >> attempts.txt\nprintf SOURCE_FAILURE >&2\nexit 1\n')
  const answer=await runner.run('Handle the fixture command failure',model,credential,50000,e=>{events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.match(answer,child?/PARENT_RECEIVED_MODEL_REASON/:/MODEL_FAILURE_EXPLANATION/)
  assert.equal(fs.readFileSync(path.join(workspace,'attempts.txt'),'utf8').trim().split(/\r?\n/).length,3)
  assert.equal(events.filter(e=>e.toolName==='Bash'&&e.status==='failed').length,4)
  assert(!events.some(e=>e.id==='run-progress'&&e.status==='cancelled'))
 })
})

test('real SDK Stable MCP validation and execution failures are counted once and preserve recovery', {timeout:45000},async t=>{
 let failure,executions=0;const events=[]
 const {workspace,runner}=fixture(t,(body,number)=>{
  try{
   if(number===1)return upstream({calls:[{id:'find-browser-validation',name:'ToolSearch',input:{query:'select:mcp__stable__stable_browser',max_results:1}}]})
   if(number<=4)return upstream({calls:[{id:'invalid-browser-'+number,name:'mcp__stable__stable_browser',input:{action:'open',url:123}}]})
   if(number===5)assert.match(toolResult(body,'invalid-browser-4'),/string|字符串|validation|invalid/i)
   if(number<=8)return upstream({calls:[{id:'failed-browser-'+number,name:'mcp__stable__stable_browser',input:{action:'open',url:'https://example.com/fail'}}]})
   if(number===9){assert.match(toolResult(body,'failed-browser-8'),/此调用未执行/);return upstream({calls:[{id:'recovered-browser',name:'mcp__stable__stable_browser',input:{action:'open',url:'https://example.com/success'}}]})}
   assert.match(toolResult(body,'recovered-browser'),/BROWSER_RECOVERED/)
   return upstream({text:'MODEL_PARAMETER_FAILURE_EXPLAINED'})
  }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
 },{builtinTools:()=>({execute:async request=>{executions++;return request.args.url.endsWith('/success')?{ok:true,text:'BROWSER_RECOVERED'}:{ok:false,error:{message:'PAGE_FAILED'}}},dispose(){}})})
 const answer=await runner.run('Inspect fixture invalid browser arguments',model,credential,30000,e=>{events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
 assert.ifError(failure);assert.equal(answer,'MODEL_PARAMETER_FAILURE_EXPLAINED');assert.equal(executions,4)
 assert.equal(events.filter(e=>e.toolName==='stable_browser'&&e.status==='failed').length,7,JSON.stringify(events.filter(e=>e.kind==='tool')))
})

test('real SDK unfinished review reaches a model explanation without cancelling the run', {timeout:45000},async t=>{
 let failure;const events=[]
 const {workspace,runner}=fixture(t,(body,number)=>{
  try{
   if(number===1)return upstream({calls:[{id:'review-discovery',name:'ToolSearch',input:{query:'select:mcp__stable__stable_browser',max_results:1}}]})
   if(number===2)return upstream({calls:[{id:'unfinished-shot',name:'mcp__stable__stable_browser',input:{action:'screenshot',tabId:'fixture'}}]})
   if(number<=5)return upstream({text:'PREMATURE_REVIEW_FINISH'})
   assert.match(JSON.stringify(body.messages),/请基于现有证据作最终说明/)
   return upstream({text:'MODEL_REVIEW_REASON: the screenshot exists, but the required review evidence was not established.'})
  }catch(error){failure=error;return upstream({text:'[[STABLE_WAITING_FOR_INPUT]]'})}
 },{builtinTools:()=>({execute:async()=>({tabId:'fixture',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='}),dispose(){}})})
 const answer=await runner.run('Inspect the fixture screenshot',model,credential,30000,e=>events.push(e),'workspace-write',[],{cwd:workspace})
 assert.ifError(failure);assert.match(answer,/MODEL_REVIEW_REASON/);assert.match(answer,/尚未提交检查记录/)
 assert.equal(runner.lastOutcome.status,'incomplete')
 assert(!events.some(e=>e.id==='run-progress'&&e.status==='cancelled'))
})

test('real SDK foreground deadline backgrounds eligible commands while the model completes other work', { timeout: 45000 }, async t => {
  const events = []; let requests = 0; let failure
  const { workspace, runner } = fixture(t, (body, number) => {
    try {
    requests++
    if (number === 1) return upstream({ calls: [{ id: 'slow-step', name: 'Bash', input: { command: 'printf PARTIAL_STEP_DONE; sleep 3; printf DONE > background-timeout.txt', timeout: 1000 } }] })
    if (number === 2) {
      assert.match(toolResult(body, 'slow-step'), /background/i)
      return upstream({ calls: [{ id: 'smaller-step', name: 'Bash', input: { command: 'printf RECOVERED > recovered.txt; cat recovered.txt', timeout: 10000 } }] })
    }
    assert.match(toolResult(body, 'smaller-step'), /RECOVERED/)
    if (!events.some(event => event.taskId && event.status === 'completed')) return upstream({ text: 'WAITING_FOR_BACKGROUND' })
    return upstream({ text: 'RECOVERY_FINISHED' })
    } catch(error) { failure=error;return upstream({text:'FIXTURE_FAILED'}) }
  })
  const result = await runner.run('Complete the task; split slow steps if necessary', model, credential, 25000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.ifError(failure); assert.equal(result, 'RECOVERY_FINISHED'); assert(requests >= 3)
  assert.equal(fs.readFileSync(path.join(workspace, 'recovered.txt'), 'utf8'), 'RECOVERED')
  assert(!events.some(event => event.id === 'slow-step' && event.status === 'failed'))
  assert(events.some(event => event.taskId && event.taskBackground))
  assert.equal(fs.readFileSync(path.join(workspace, 'background-timeout.txt'), 'utf8'), 'DONE')
})

test('real SDK native Bash executes only after approval and reports output and errors', { timeout: 120_000 }, async t => {
  for (const mode of ['allow', 'deny', 'failure', 'timeout', 'cancel-approval']) await t.test(mode, async t => {
    let approvals = 0
    const command = mode === 'failure' ? 'printf error-output >&2; exit 7'
      : mode === 'timeout' ? 'sleep 5; printf late > too-late.txt'
      : "printf '原生 Bash 中文' > result.txt; cat result.txt"
    const { workspace, runner } = fixture(t, (body, number) => {
      nativeTool(body, 'Bash')
      assert(!body.tools.some(tool => tool.function.name === 'mcp__stable__stable_exec'))
      if (number === 1) return upstream({ calls: [{ id: 'native-bash', name: 'Bash', input: { command, timeout: mode === 'timeout' ? 1000 : 10000 } }] })
      const output = toolResult(body, 'native-bash')
      assert.match(output || '', mode === 'allow' ? /原生 Bash 中文/ : mode === 'deny' ? /未批准|denied/i : mode === 'failure' ? /error-output/ : /timeout|timed out|超时|exceeded/i)
      return upstream({ text: 'BASH_FINISHED' })
    })
    const events = []
    const run = runner.run('Run the fixture command', model, credential, 25000, event => {
      events.push(event)
      if (event.kind !== 'approval' || event.status !== 'running') return
      approvals++
      assert.match(event.reason, /本机 Bash/)
      assert.equal(fs.existsSync(path.join(workspace, 'result.txt')), false)
      if (mode === 'cancel-approval') runner.cancel()
      else runner.answerApproval(event.requestId, mode !== 'deny')
    }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
    if (mode === 'cancel-approval') await assert.rejects(run, /停止/)
    else assert.equal(await run, 'BASH_FINISHED')
    assert.equal(approvals, 1)
    assert.equal(fs.existsSync(path.join(workspace, 'result.txt')), mode === 'allow')
    assert.equal(fs.existsSync(path.join(workspace, 'too-late.txt')), false)
    if (mode === 'allow') {
      assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), '原生 Bash 中文')
      assert(events.some(event => event.id === 'native-bash' && event.status === 'completed' && /原生 Bash 中文/.test(event.detail)))
    }
    if (mode === 'failure') assert(events.some(event => event.id === 'native-bash' && event.status === 'failed' && /error-output/.test(event.detail)))
  })
})

test('real SDK hides native Bash in read-only and offline runs', { timeout: 60000 }, async t => {
  for (const sandboxMode of ['read-only', 'workspace-write']) {
    const { workspace, runner } = fixture(t, body => {
      assert(!body.tools.some(tool => ['Bash', 'mcp__stable__stable_exec'].includes(tool.function.name)))
      return upstream({ text: 'NO_BASH' })
    })
    assert.equal(await runner.run('Inspect tool catalog', model, credential, 25000, undefined, sandboxMode, [], { cwd: workspace, networkAccess: sandboxMode === 'read-only' }), 'NO_BASH')
  }
})

test('real SDK cancellation stops an active native Bash command before its delayed write', { timeout: 30000 }, async t => {
  const { workspace, runner } = fixture(t, (_body, number) => {
    assert.equal(number, 1)
    return upstream({ calls: [{ id: 'active-bash', name: 'Bash', input: { command: 'printf started > started.txt; sleep 3; printf orphan > orphan.txt', timeout: 10000 } }] })
  })
  const running = runner.run('Run cancellable command', model, credential, 20000, event => {
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await until(() => fs.existsSync(path.join(workspace, 'started.txt')))
  assert.equal(runner.cancel(), true)
  const outcome = await settled
  assert.match(outcome.error?.message || '', /停止/)
  await new Promise(resolve => setTimeout(resolve, 3500))
  assert.equal(fs.existsSync(path.join(workspace, 'orphan.txt')), false)
})

for (const subagentType of ['stable-worker', 'fork']) test(`real SDK ${subagentType} child Agent uses native Bash with the same approval hook`, { timeout: 45000 }, async t => {
  let childCalls = 0, approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (body.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('CHILD_BASH_MARKER'))) {
      nativeTool(body, 'Bash')
      childCalls++
      if (childCalls === 1) return upstream({ calls: [{ id: 'child-bash', name: 'Bash', input: { command: 'printf CHILD_NATIVE_OK', timeout: 10000 } }] })
      assert.match(toolResult(body, 'child-bash'), /CHILD_NATIVE_OK/)
      return upstream({ text: 'CHILD_DONE' })
    }
    if (number === 1) return upstream({ calls: [{ id: 'parent-agent', name: 'Agent', input: { description: 'Test child Bash', prompt: 'CHILD_BASH_MARKER: run the command', subagent_type: subagentType, run_in_background: false } }] })
    assert.match(toolResult(body, 'parent-agent'), /CHILD_DONE/)
    return upstream({ text: 'PARENT_DONE' })
  })
  const result = await runner.run('Delegate command', { ...model, contextWindow: 1000000 }, credential, 30000, event => {
    if (event.kind === 'approval' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.equal(result, 'PARENT_DONE')
  assert.equal(childCalls, 2)
  assert.equal(approvals, 1)
})

test('real SDK external MCP connects only after approval and enforces per-call grants', { timeout: 120_000 }, async t => {
  for (const mode of ['disabled', 'read-only', 'deny-connect', 'allow', 'allow-sse', 'deny-tool', 'cancel-tool']) await t.test(mode, async t => {
    const http = require('node:http'); const remoteCalls = [], remoteRequests = []; let connectedApproved = false, sseResponse
    const server = http.createServer(async (req, res) => {
      remoteRequests.push(req.method)
      if (!connectedApproved) { res.writeHead(403).end(); return }
      if (mode === 'allow-sse' && req.method === 'GET') {
        sseResponse = res
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write('event: endpoint\ndata: /messages\n\n'); return
      }
      if (req.method !== 'POST') { res.writeHead(req.method === 'DELETE' ? 200 : 405).end(); return }
      let raw = ''; for await (const chunk of req) raw += chunk
      const message = JSON.parse(raw)
      if (message.id === undefined) { res.writeHead(202).end(); return }
      let result
      if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      else if (message.method === 'tools/list') result = { tools: ['queryReadAgent', 'erase'].map(name => ({ name, description: 'Local fixture ' + name, inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } })) }
      else if (message.method === 'tools/call') { remoteCalls.push(message.params); result = { content: [{ type: 'text', text: 'EXTERNAL_MCP_OK' }] } }
      else result = {}
      const response = JSON.stringify({ jsonrpc: '2.0', id: message.id, result })
      if (mode === 'allow-sse') { res.writeHead(202).end(); sseResponse.write('event: message\ndata: ' + response + '\n\n') }
      else res.writeHead(200, { 'content-type': 'application/json' }).end(response)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
    let approvals = 0
    const { root, workspace, runner, requests } = fixture(t, (body, number) => {
      if (['disabled', 'read-only'].includes(mode)) {
        assert(!body.tools.some(tool => tool.function.name.startsWith('mcp__reports__')))
        return upstream({ text: 'EXT_DISABLED' })
      }
      if (number === 1) return upstream({ calls: [{ id: 'external-discover', name: 'ToolSearch', input: { query: 'select:mcp__reports__queryReadAgent,mcp__reports__erase', max_results: 2 } }] })
      if (number === 2) return upstream({ calls: [{ id: 'external-denied', name: 'mcp__reports__erase', input: { value: 'never' } }] })
      if (number === 3) {
        assert.match(toolResult(body, 'external-denied'), /白名单/)
        return upstream({ calls: [{ id: 'external-query', name: 'mcp__reports__queryReadAgent', input: { value: 'fixture' } }] })
      }
      if (mode !== 'cancel-tool') assert.match(toolResult(body, 'external-query'), mode.startsWith('allow') ? /EXTERNAL_MCP_OK/ : /未批准/)
      return upstream({ text: 'EXT_FINISHED' })
    })
    const configFile = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
    fs.mkdirSync(path.dirname(configFile), { recursive: true })
    fs.writeFileSync(configFile, JSON.stringify({ version: 1, enabled: mode !== 'disabled', mcpServers: { reports: { type: mode === 'allow-sse' ? 'sse' : 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, tools: ['queryReadAgent'] } } }))
    const events = []
    const run = runner.run('Use the fixture MCP', model, credential, 30_000, event => {
      events.push(event)
      if (event.kind !== 'approval' || event.status !== 'running') return
      approvals++
      if (event.detail.startsWith('external_extensions_activate')) {
        assert.equal(remoteRequests.length, 0, 'no discovery before connection approval')
        connectedApproved = mode !== 'deny-connect'
        runner.answerApproval(event.requestId, connectedApproved)
      } else if (mode === 'cancel-tool') runner.cancel()
      else runner.answerApproval(event.requestId, mode.startsWith('allow'))
    }, mode === 'read-only' ? 'read-only' : 'workspace-write', [], { key: 'external-' + mode, cwd: workspace, networkAccess: true })
    if (mode === 'deny-connect') { await assert.rejects(run, /未批准/); assert.equal(requests.length, 0) }
    else if (mode === 'cancel-tool') await assert.rejects(run, /停止/)
    else assert.equal(await run, ['disabled', 'read-only'].includes(mode) ? 'EXT_DISABLED' : 'EXT_FINISHED')
    assert.equal(remoteCalls.length, mode.startsWith('allow') ? 1 : 0)
    if (mode.startsWith('allow')) {
      assert.equal(remoteCalls[0].name, 'queryReadAgent')
      assert.deepEqual(remoteCalls[0].arguments, { value: 'fixture' })
      assert(events.some(event => event.id === 'runtime-info' && event.detail.includes(`Claude Code ${CLI_VERSION}`)))
    }
    assert.equal(approvals, ['disabled', 'read-only'].includes(mode) ? 0 : mode === 'deny-connect' ? 1 : 2)
    if (['disabled', 'read-only', 'deny-connect'].includes(mode)) assert.equal(remoteRequests.length, 0)
  })
})

test('real SDK optional MCP timeout or connection failure leaves local tools available', { timeout: 90000 }, async t => {
  for (const mode of ['timeout', 'disconnected']) await t.test(mode, async t => {
    const http = require('node:http'); let calls = 0
    const server = http.createServer(async (req, res) => {
      if (mode === 'disconnected') { res.writeHead(503).end(); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      let raw = ''; for await (const chunk of req) raw += chunk
      const message = JSON.parse(raw)
      if (message.id === undefined) { res.writeHead(202).end(); return }
      let result = {}
      if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      if (message.method === 'tools/list') result = { tools: [{ name: 'slowReadAgent', description: 'Slow fixture query', inputSchema: { type: 'object', properties: {} } }] }
      if (message.method === 'tools/call') { calls++; return }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
    const events = []
    const { root, workspace, runner } = fixture(t, (body, number) => {
      if (mode === 'timeout' && number === 1) return upstream({ calls: [{ id: 'discover-slow', name: 'ToolSearch', input: { query: 'select:mcp__reports__slowReadAgent' } }] })
      if (mode === 'timeout' && number === 2) return upstream({ calls: [{ id: 'remote-slow', name: 'mcp__reports__slowReadAgent', input: {} }] })
      if (mode === 'timeout' && number === 3) assert.match(toolResult(body, 'remote-slow'), /timed? ?out|timeout|超时/i)
      if (number === (mode === 'timeout' ? 3 : 1)) return upstream({ calls: [{ id: 'native-fallback', name: 'Read', input: { file_path: path.join(workspace, 'local.txt') } }] })
      assert.match(toolResult(body, 'native-fallback'), /LOCAL_OK/)
      return upstream({ text: 'OPTIONAL_MCP_RECOVERED' })
    }, { toolTimeoutMs: 1000 })
    fs.writeFileSync(path.join(workspace, 'local.txt'), 'LOCAL_OK')
    const config = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
    fs.mkdirSync(path.dirname(config), { recursive: true })
    fs.writeFileSync(config, JSON.stringify({ version: 1, enabled: true, mcpServers: { reports: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, tools: ['slowReadAgent'] } } }))
    const answer = await runner.run('use local sources if the optional query fails', model, credential, 30000, event => {
      events.push(event)
      if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
    }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
    assert.match(answer, /OPTIONAL_MCP_RECOVERED/)
    assert.equal(calls, mode === 'timeout' ? 1 : 0)
    if (mode === 'timeout') assert(events.some(event => event.toolName === 'mcp__reports__slowReadAgent' && event.status === 'failed'))
    else assert(events.some(event => event.id === 'external-mcp-status'))
    assert.equal(events.at(-1).status, 'completed')
  })
})

test('real SDK does not replay a non-idempotent HTTP MCP call after connection loss', { timeout: 45000 }, async t => {
  const http = require('node:http'); let calls = 0
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let raw = ''; for await (const chunk of req) raw += chunk
    const message = JSON.parse(raw)
    if (message.id === undefined) { res.writeHead(202).end(); return }
    let result = {}
    if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mutation-fixture', version: '1' } }
    if (message.method === 'tools/list') result = { tools: [{ name: 'create_record', description: 'Creates one record; never repeat an uncertain operation.', annotations: { readOnlyHint: false, idempotentHint: false }, inputSchema: { type: 'object', properties: {} } }] }
    if (message.method === 'tools/call') {
      calls++ // Represents a committed side effect before the reply is lost.
      if (calls === 1) { req.socket.destroy(); return }
      result = { content: [{ type: 'text', text: 'DUPLICATE_SIDE_EFFECT' }] }
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const { root, workspace, runner, requests } = fixture(t, (_body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'discover-mutation', name: 'ToolSearch', input: { query: 'select:mcp__mutation__create_record', max_results: 1 } }] })
    if (number === 2) return upstream({ calls: [{ id: 'mutation', name: 'mcp__mutation__create_record', input: {} }] })
    return upstream({ text: 'UNCERTAIN_RESULT_REPORTED' })
  })
  const config = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
  fs.mkdirSync(path.dirname(config), { recursive: true })
  fs.writeFileSync(config, JSON.stringify({ version: 1, enabled: true, mcpServers: { mutation: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, tools: ['create_record'] } } }))
  const answer = await runner.run('Create one fixture record; report uncertainty without trying again.', model, credential, 35000, event => {
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.equal(answer, 'UNCERTAIN_RESULT_REPORTED')
  assert.equal(calls, 1, 'A lost response must not replay a committed non-idempotent operation')
  assert.equal(requests.length, 3)
})

test('real SDK loads opted-in plugin skills through the sanitized whitelist and retains write approval', { timeout: 45_000 }, async t => {
  let skillName, approvals = 0
  const { root, workspace, runner } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => tool.function.name === 'Bash'))
    if (number === 1) return upstream({ calls: [{ id: 'external-skill', name: 'Skill', input: { skill: skillName } }] })
    if (number === 2) {
      assert.match(JSON.stringify(body.messages), /EXTERNAL_SKILL_BODY/)
      return upstream({ calls: [{ id: 'plugin-write', name: 'Write', input: { file_path: path.join(workspace, 'plugin.txt'), content: 'PLUGIN_OK' } }] })
    }
    return upstream({ text: 'EXTERNAL_PLUGIN_OK' })
  })
  const plugin = path.join(root, 'external-plugin'), skillRoot = path.join(plugin, 'skills', 'report')
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true }); fs.mkdirSync(skillRoot, { recursive: true })
  fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'external-fixture' }))
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: report\ndescription: External fixture\nallowed-tools: Bash\ncontext: fork\n---\nEXTERNAL_SKILL_BODY')
  const configFile = require('../desktop/services/claude-extensions.cjs').configurationPath(root)
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify({ version: 1, enabled: true, plugins: [{ path: plugin }] }))
  skillName = 'stable-authorized:report-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  assert.equal(await runner.run('Use external report skill', model, credential, 30_000, event => {
    if (event.kind === 'approval' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], { key: 'external-plugin', cwd: workspace }), 'EXTERNAL_PLUGIN_OK')
  assert.equal(approvals, 2, 'activation and native Write need independent Stable approvals')
  assert.equal(fs.readFileSync(path.join(workspace, 'plugin.txt'), 'utf8'), 'PLUGIN_OK')
})

test('native memory writes require approval and are read by a new conversation only in the same project', { timeout: 60_000 }, async t => {
  let index, approvals = 0
  const { root, workspace, runner } = fixture(t, (body, number) => {
    const sent = JSON.stringify(body.messages)
    if (number === 1) return upstream({ calls: [{ id: 'memory-write', name: 'Write', input: { file_path: index, content: 'PROJECT_MEMORY_FIXTURE: Prefer concise Chinese reports.' } }] })
    if (number === 2) { assert(toolResult(body, 'memory-write')); return upstream({ text: 'MEMORY_SAVED' }) }
    if (number === 3) { assert.match(sent, /PROJECT_MEMORY_FIXTURE/); return upstream({ text: 'MEMORY_RECALLED' }) }
    assert.doesNotMatch(sent, /PROJECT_MEMORY_FIXTURE/)
    return upstream({ text: 'MEMORY_ISOLATED' })
  })
  const memory = require('../desktop/services/claude-memory.cjs').prepareClaudeMemory({ userData: root, workspace })
  index = path.join(memory.directory, 'MEMORY.md')
  const approve = event => { if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) } }
  assert.equal(await runner.run('Remember my preference', model, credential, 30_000, approve, 'workspace-write', [], { key: 'memory-first', cwd: workspace }), 'MEMORY_SAVED')
  assert.equal(approvals, 1)
  assert.match(fs.readFileSync(index, 'utf8'), /PROJECT_MEMORY_FIXTURE/)
  assert.equal(await runner.run('What is my preference?', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'memory-second', cwd: workspace }), 'MEMORY_RECALLED')
  const other = path.join(root, 'another-project'); fs.mkdirSync(other)
  assert.equal(await runner.run('Inspect preferences', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'memory-other', cwd: other }), 'MEMORY_ISOLATED')
  assert.equal(await runner.run('Read only', model, credential, 30_000, undefined, 'read-only', [], { key: 'memory-second', cwd: workspace }), 'MEMORY_ISOLATED')
})

test('native ToolSearch discovers a deferred tool before it is called', { timeout: 60_000 }, async t => {
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeTool(body, 'ToolSearch')
      assert(!body.tools.some(tool => tool.function.name === 'mcp__stable__stable_search'))
      return upstream({ calls: [{ id: 'discover-search', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_search', max_results: 1 } }] })
    }
    if (number === 2) {
      nativeTool(body, 'mcp__stable__stable_search')
      assert(toolResult(body, 'discover-search'))
      return upstream({ calls: [{ id: 'use-search', name: 'mcp__stable__stable_search', input: { query: 'fixture question' } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'use-search'), /SEARCH_DISCOVERED_OK/)
      return upstream({ text: 'NATIVE_DISCOVERY_OK' })
    }
    assert.equal(number, 4)
    nativeTool(body, 'mcp__stable__stable_search')
    return upstream({ text: 'NATIVE_DISCOVERY_RESUMED' })
  }, { search: async () => 'SEARCH_DISCOVERED_OK' })
  assert.equal(await runner.run('discover then search', model, credential, 45_000, undefined, 'workspace-write', [], { key: 'discover', cwd: workspace, networkAccess: true }), 'NATIVE_DISCOVERY_OK')
  assert.equal(await runner.run('continue after discovery', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'discover', cwd: workspace, networkAccess: true }), 'NATIVE_DISCOVERY_RESUMED')
})

test('native ToolSearch cannot discover a disabled host shell', { timeout: 45_000 }, async t => {
  const { workspace, runner } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => ['Bash', 'PowerShell'].includes(tool.function.name)))
    if (number === 1) return upstream({ calls: [{ id: 'find-host-shell', name: 'ToolSearch', input: { query: 'select:Bash', max_results: 1 } }] })
    assert.equal(number, 2)
    assert(toolResult(body, 'find-host-shell'))
    return upstream({ text: 'HOST_SHELL_NOT_AVAILABLE' })
  })
  assert.equal(await runner.run('inspect the fixture catalog', model, credential, 30_000, undefined, 'workspace-write', [], { cwd: workspace }), 'HOST_SHELL_NOT_AVAILABLE')
})

test('real SDK invokes only authorized native skills and keeps file approval boundaries', { timeout: 60_000 }, async t => {
  let skillName, approved = 0
  const { root, workspace, runner, requests } = fixture(t, (body, number) => {
    assert(!body.tools.some(tool => tool.function.name === 'Bash'))
    if (number === 1) {
      nativeTool(body, 'Skill')
      assert(!JSON.stringify(body.messages).includes('UNAUTHORIZED_SKILL_BODY'))
      return upstream({ calls: [{ id: 'denied-skill', name: 'Skill', input: { skill: 'outside:forbidden' } }] })
    }
    if (number === 2) {
      assert.match(String(toolResult(body, 'denied-skill')), /白名单|not|Unknown|available|denied/i)
      return upstream({ calls: [{ id: 'authorized-skill', name: 'Skill', input: { skill: skillName } }] })
    }
    if (number === 3) {
      assert.match(JSON.stringify(body.messages), /AUTHORIZED_SKILL_BODY/)
      return upstream({ calls: [{ id: 'skill-write', name: 'Write', input: { file_path: path.join(workspace, 'skill-result.txt'), content: 'SKILL_OK' } }] })
    }
    assert.equal(number, 4)
    return upstream({ text: 'NATIVE_SKILL_OK' })
  })
  const skillRoot = path.join(root, 'approved-skill'); fs.mkdirSync(skillRoot)
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: fixture-skill\ndescription: Authorized fixture skill\nallowed-tools: Bash\ncontext: fork\n---\nAUTHORIZED_SKILL_BODY\nWrite the requested file using approved tools.')
  const ambient = path.join(workspace, '.claude', 'skills', 'forbidden'); fs.mkdirSync(ambient, { recursive: true })
  fs.writeFileSync(path.join(ambient, 'SKILL.md'), '---\nname: forbidden\ndescription: Unauthorized fixture\n---\nUNAUTHORIZED_SKILL_BODY')
  skillName = 'stable-authorized:fixture-skill-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  const result = await runner.run('Use the approved fixture skill', model, credential, 45_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { approved++; runner.answerApproval(event.requestId, true) }
  }, 'workspace-write', [], { key: 'skills', cwd: workspace, readableRoots: [skillRoot], automaticSkills: [{ name: 'fixture-skill', path: skillRoot }] })
  assert.equal(result, 'NATIVE_SKILL_OK'); assert.equal(approved, 1)
  assert.equal(fs.readFileSync(path.join(workspace, 'skill-result.txt'), 'utf8'), 'SKILL_OK')
  assert.equal(requests.length, 4)
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function until(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error('native SDK did not reach the expected state')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
function pendingUpstream(request, release) {
  const encoder = new TextEncoder()
  const content = { choices: [{ index: 0, delta: { content: 'FIRST_REPLY' }, finish_reason: null }] }
  const finish = { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: ' + JSON.stringify(content) + '\n\n'))
      request.signal.addEventListener('abort', () => controller.error(Object.assign(new Error('fixture request cancelled'), { name: 'AbortError' })), { once: true })
      if (release) void release.then(() => { controller.enqueue(encoder.encode('data: ' + JSON.stringify(finish) + '\n\ndata: [DONE]\n\n')); controller.close() })
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}
function upstream({ text, calls, reasoning = 'fixture thinking', inputTokens = 50 }) {
  const delta = { reasoning_content: reasoning, ...(text ? { content: text } : {}), ...(calls ? { tool_calls: calls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) }
  const chunk = { id: 'chat-native-fixture', object: 'chat.completion.chunk', model: model.model, choices: [{ index: 0, delta, finish_reason: calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: inputTokens, completion_tokens: 10 } }
  return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
function fixture(t, responder, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-native-claude-'))
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace)
  const requests = []
  const runner = new ClaudeHarnessRunner({
    userData: root, workspace,
    ...options,
    fetchImpl: async (url, request) => {
      if (options.webResponder && /^https:\/\/provider\.invalid\/v1\/tools\/(search|fetch)$/.test(url)) return options.webResponder(url, request)
      assert.equal(url, 'https://provider.invalid/v1/chat/completions')
      assert.equal(request.headers.authorization, 'Bearer ' + credential)
      const body = JSON.parse(request.body); requests.push(body)
      assert.equal(body.model, options.expectedModel || model.model)
      return responder(body, requests.length, request)
    },
  })
  t.after(async () => {
    runner.cancel()
    if (runner.busy) await until(() => !runner.busy)
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return { root, workspace, runner, requests }
}

test('real SDK corrects malformed Write once and never executes incomplete contents', { timeout: 60000 }, async t => {
  const events = []
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    if (number === 1) return new Response('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad-write', function: { name: 'Write', arguments: '{"content":"partial' } }] }, finish_reason: 'length' }], usage: { completion_tokens: 8192 } }) + '\n\ndata: [DONE]\n\n')
    if (number === 2) {
      assert.match(body.messages.at(-1).content, /整组工具调用均未执行/)
      assert.equal(fs.existsSync(path.join(workspace, 'result.txt')), false)
      return upstream({ calls: [{ id: 'fixed-write', name: 'Write', input: { file_path: path.join(workspace, 'result.txt'), content: 'COMPLETE_CONTENT' } }] })
    }
    assert(toolResult(body, 'fixed-write'))
    return upstream({ text: 'DELIVERED' })
  })
  const answer = await runner.run('Write result.txt', model, credential, 30000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace })
  assert.equal(answer, 'DELIVERED')
  assert.equal(requests.length, 3)
  assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'COMPLETE_CONTENT')
  assert(!events.some(event => event.id === 'bad-write' && event.kind === 'tool'))
  assert(events.some(event => event.title === '工具参数校验失败，正在纠正'))
})

test('real SDK stops after failed correction without retrying the invalid Write nine times', { timeout: 60000 }, async t => {
  const events = []
  const { workspace, runner, requests } = fixture(t, () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad-write', function: { name: 'Write', arguments: '{broken' } }] }, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n'))
  await assert.rejects(runner.run('Write report', model, credential, 30000, event => events.push(event), 'workspace-write', [], { cwd: workspace }), /纠正后仍失败.*finish_reason=tool_calls/)
  assert.equal(requests.length, 3, 'one correction and one explanation attempt, with no invalid tool execution')
  assert.equal(events.findLast(event => event.id === 'run-progress').status, 'failed')
  assert.equal(fs.existsSync(path.join(workspace, 'report.html')), false)
})

test('real SDK returns a model failure explanation after invalid tools and preserves incomplete delivery', { timeout: 60000 }, async t => {
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    if (number <= 2) return new Response('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad-write', function: { name: 'Write', arguments: '{broken' } }] }, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n')
    assert.equal(body.tools, undefined)
    assert.match(body.messages.at(-1).content, /只说明失败原因/)
    return upstream({ text: 'MODEL_FAILURE_REASON: 两次写入参数无效，目标报告没有生成。' })
  })
  const result = await require('../desktop/services/delivery.cjs').runWithDeliveryChecks({
    workspace, prompt: '生成报告 HTML 文件', delivery: { required: true, extensions: ['.html'] },
    execute: task => runner.run(task, model, credential, 30000, undefined, 'workspace-write', [], { cwd: workspace }),
    getExecutionOutcome: () => runner.lastOutcome,
  })
  assert.match(result.answer, /MODEL_FAILURE_REASON/)
  assert.equal(result.status, 'failed')
  assert.equal(runner.lastOutcome.status, 'incomplete')
  assert.equal(requests.length, 3)
  assert.equal(fs.existsSync(path.join(workspace, 'report.html')), false)
})

test('real SDK lets the model recover from a timed-out Stable tool after the operation settles', { timeout: 60000 }, async t => {
  const pending = new Map(), cancelled = [], events = []
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'discover-timeout', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_browser' } }] })
    if (number === 2) return upstream({ calls: [{ id: 'slow-browser', name: 'mcp__stable__stable_browser', input: { action: 'open', url: 'https://slow.invalid/' } }] })
    if (number === 3) {
      assert.match(toolResult(body, 'slow-browser'), /超时.*任务仍可继续/)
      assert.equal(cancelled.length, 1)
      assert.equal(pending.size, 0, 'the timed-out operation has settled before the next model call')
      return upstream({ calls: [{ id: 'alternative-read', name: 'Read', input: { file_path: path.join(workspace, 'alternative.txt') } }] })
    }
    assert.match(toolResult(body, 'alternative-read'), /LOCAL_ALTERNATIVE/)
    return upstream({ text: 'MODEL_RECOVERED: 网页超时，已使用本地资料完成。' })
  }, { toolTimeoutMs: 50, builtinTools: () => ({
    execute: request => new Promise((resolve, reject) => pending.set(request.requestId, reject)),
    cancel: id => { cancelled.push(id); const reject = pending.get(id); pending.delete(id); reject?.(new Error('operation aborted')) }, dispose() {},
  }) })
  fs.writeFileSync(path.join(workspace, 'alternative.txt'), 'LOCAL_ALTERNATIVE')
  const answer = await runner.run('inspect page or local source', model, credential, 30000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.match(answer, /MODEL_RECOVERED/)
  assert.equal(events.filter(event => event.toolName === 'stable_browser' && event.status === 'failed').length, 1)
  assert.equal(events.at(-1).status, 'completed')
})

test('real SDK Edit validation failure is recorded as failed even when hooks are bypassed', { timeout: 60000 }, async t => {
  const events = []
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'read-before-edit', name: 'Read', input: { file_path: path.join(workspace, 'edit.txt') } }] })
    if (number === 2) return upstream({ calls: [{ id: 'missing-old-string', name: 'Edit', input: { file_path: path.join(workspace, 'edit.txt'), old_string: 'not in file', new_string: 'wrong' } }] })
    assert.match(toolResult(body, 'missing-old-string'), /not found/i)
    return upstream({ text: 'EDIT_FAILED' })
  })
  fs.writeFileSync(path.join(workspace, 'edit.txt'), 'original')
  await runner.run('Try edit', model, credential, 30000, event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }, 'workspace-write', [], { cwd: workspace })
  assert.equal(fs.readFileSync(path.join(workspace, 'edit.txt'), 'utf8'), 'original')
  assert.equal(events.findLast(event => event.kind === 'tool' && event.id === 'missing-old-string')?.status, 'failed')
})

test('real SDK request budget preserves failure reason, files and shared resume limit', { timeout: 60000 }, async t => {
  const { requestBudget } = require('../benchmarks/report-tasks/request-budget.cjs')
  const budget = requestBudget(2), events = []
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ text: 'CHECKPOINT_SAVED' })
    assert.match(body.messages.filter(message => message.role === 'user').map(message => message.content).join('\n'), /2\/2.*还可请求 0 次/)
    return upstream({ calls: [{ id: 'budget-write', name: 'Write', input: { file_path: path.join(workspace, 'partial.txt'), content: 'PRESERVED' } }] })
  }, { onModelRequest: () => budget.onRequest() })
  const capture = event => {
    events.push(event)
    if (event.kind === 'approval' && event.status === 'running') runner.answerApproval(event.requestId, true)
  }
  const session = { key: 'budget-resume', cwd: workspace }
  assert.equal(await runner.run('Save checkpoint', model, credential, 25000, capture, 'workspace-write', [], session), 'CHECKPOINT_SAVED')
  await assert.rejects(runner.run('Continue writing', model, credential, 25000, capture, 'workspace-write', [], session), /benchmark 请求次数达到上限（2\/2）/)
  assert.equal(requests.length, 2, 'no upstream retry beyond the same case budget')
  assert.equal(fs.readFileSync(path.join(workspace, 'partial.txt'), 'utf8'), 'PRESERVED')
  const final = events.findLast(event => event.id === 'run-progress')
  assert.equal(final.status, 'failed')
  assert.match(final.detail, /达到上限/)
})
const texts = body => body.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).join('\n')
const toolResult = (body, id) => body.messages.findLast(message => message.role === 'tool' && message.tool_call_id === id)?.content
function compactionPrompt(body) {
  // Inspect the SDK's user-role summary instruction, not arbitrary historical
  // text containing "summary" (or Stable's appended run-progress reminder).
  // Automatic compaction may append the instruction to an existing user turn.
  const index = body.messages.findLastIndex(message => message.role === 'user' && typeof message.content === 'string'
    && message.content.includes('CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.')
    && message.content.includes('Your task is to create a detailed summary of the conversation so far'))
  if (index < 0 || body.messages.slice(index + 1).some(message => message.role !== 'user')) return undefined
  const content = body.messages[index].content
  const prompt = content.slice(content.indexOf('CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.'))
  assert.match(prompt, /<summary>/)
  return prompt
}
function nativeTool(body, name) {
  const value = body.tools?.find(tool => tool.function.name === name)
  assert(value, 'native tool must be advertised: ' + name)
  return value.function
}
function nativeCatalog(body, networkAccess = false) {
  for (const name of ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'ToolSearch']) nativeTool(body, name)
  const names = body.tools.map(tool => tool.function.name)
  assert.equal(new Set(names).size, names.length, 'native/MCP tools must not be registered twice')
  assert.equal(names.some(name => /(?:^|__)stable_file$/.test(name)), false, 'native file tools replace stable_file')
  if (!networkAccess) assert.equal(names.some(name => ['Bash', 'PowerShell', 'Shell', 'Execute'].includes(name)), false, 'offline runs must not expose a host shell')
  assert(!names.includes('mcp__stable__stable_exec'))
  assert(!names.includes('DeferredToolPlaceholder'))
}

test('real native SDK returns text with no tools in a text-only run', { timeout: 45_000 }, async t => {
  const { workspace, runner, requests } = fixture(t, () => upstream({ text: 'NATIVE_TEXT_OK' }))
  const result = await runner.run('return NATIVE_TEXT_OK', model, credential, 30_000, undefined, 'read-only', [], { textOnly: true, cwd: workspace })
  assert.equal(result, 'NATIVE_TEXT_OK')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].tools, undefined)
  assert.equal(runner.busy, false)
})

test('real SDK message prediction uses one bounded tool-free request and removes temporary history', { timeout: 45_000 }, async t => {
  const { root, workspace, runner, requests } = fixture(t, () => upstream({ text: '{"suggestion":"继续运行测试。"}' }))
  const result = await runner.run('Predict next message', model, credential, 20000, undefined, 'read-only', [], { purpose: 'message-prediction', cwd: workspace })
  assert.equal(JSON.parse(result).suggestion, '继续运行测试。')
  assert.equal(requests.length, 1); assert.equal(requests[0].tools, undefined)
  assert.equal(requests[0].max_tokens, 2048)
  assert.deepEqual(fs.readdirSync(path.join(root, 'claude', 'runs')), [])
})

test('real SDK task title is a single bounded tool-free request', { timeout: 45_000 }, async t => {
  const { root, workspace, runner, requests } = fixture(t, () => upstream({ text: '{"title":"生成经营分析报告"}' }))
  const result = await runner.run('{"userRequest":"根据上传的数据做经营分析报告"}', model, credential, 20000, undefined, 'read-only', [], { purpose: 'conversation-title', cwd: workspace })
  assert.equal(result, '{"title":"生成经营分析报告"}')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].max_tokens, 512)
  assert(!requests[0].tools?.length)
  assert(JSON.stringify(requests[0].messages).includes('主要动作和具体对象'))
})

test('real SDK prediction cannot retry upstream after a provider failure', { timeout: 45_000 }, async t => {
  const { workspace, runner, requests } = fixture(t, () => new Response('{"error":{"message":"fixture unavailable"}}', { status: 503 }))
  await assert.rejects(runner.run('Predict', model, credential, 20000, undefined, 'read-only', [], { purpose: 'message-prediction', cwd: workspace }))
  assert.equal(requests.length, 1)
})

test('real native SDK resumes local history without resending initial context', { timeout: 60_000 }, async t => {
  const { root, workspace, runner, requests } = fixture(t, (_body, number) => upstream({ text: 'NATIVE_REPLY_' + number }))
  const home = path.join(sessionDirectory(root, 'native-resume'), 'home')
  const projectConfig = path.join(workspace, '.claude')
  const styles = path.join(projectConfig, 'output-styles')
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(styles, { recursive: true })
  const ambient = ['AMBIENT_PROJECT_CLAUDE_MARKER', 'AMBIENT_PARENT_CLAUDE_MARKER', 'AMBIENT_USER_CLAUDE_MARKER', 'AMBIENT_SETTINGS_STYLE_MARKER', 'AMBIENT_USER_SETTINGS_MARKER', 'AMBIENT_FILE_MENTION_MARKER']
  fs.writeFileSync(path.join(workspace, 'CLAUDE.md'), ambient[0])
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), ambient[1])
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), ambient[2])
  fs.writeFileSync(path.join(styles, 'ambient-isolation.md'), '---\nname: ambient-isolation\ndescription: Fixture style\n---\n' + ambient[3])
  fs.writeFileSync(path.join(projectConfig, 'settings.json'), JSON.stringify({ outputStyle: 'ambient-isolation' }))
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ companyAnnouncements: [ambient[4]], outputStyle: 'ambient-isolation' }))
  fs.writeFileSync(path.join(workspace, 'ambient-material.txt'), ambient[5])
  const session = { key: 'native-resume', cwd: workspace, contextPolicy: 'uploaded-materials-v1', globalInstructions: 'EXPLICIT_STABLE_GLOBAL_INSTRUCTION_MARKER', initialPrompt: 'initial context marker: SEED_ONCE @ambient-material.txt' }
  assert.equal(await runner.run('first user turn', model, credential, 30_000, undefined, 'workspace-write', [], session), 'NATIVE_REPLY_1')
  const thread = JSON.parse(fs.readFileSync(path.join(sessionDirectory(root, session.key), 'stable-thread.json'), 'utf8')).threadId
  assert.equal(await runner.run('follow-up marker: FOLLOW_UP', model, credential, 30_000, undefined, 'workspace-write', [], session), 'NATIVE_REPLY_2')
  assert.equal(requests.length, 2)
  assert.equal((texts(requests[1]).match(/SEED_ONCE/g) || []).length, 1)
  assert.match(texts(requests[1]), /FOLLOW_UP/)
  assert(requests[1].messages.some(message => message.role === 'assistant' && message.content === 'NATIVE_REPLY_1'))
  for (const request of requests) {
    const sent = JSON.stringify(request.messages)
    for (const marker of ambient) assert.equal(sent.includes(marker), false, 'ambient context leaked: ' + marker)
    assert.match(sent, /EXPLICIT_STABLE_GLOBAL_INSTRUCTION_MARKER/)
    assert.match(sent, /@ambient-material\.txt/)
  }
  const read = await createClaudeLifecycle({ userData: root }).read(session.key)
  assert.equal(read.thread.id, thread)
  assert.equal(read.thread.turns.length, 2)
})

test('real SDK native Write requires Stable approval and returns its result to the provider', { timeout: 45_000 }, async t => {
  let approved = 0
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeCatalog(body)
      const tool = nativeTool(body, 'Write')
      assert(tool.parameters.properties.file_path)
      return upstream({ calls: [{ id: 'native-file-call', name: 'Write', input: { file_path: path.join(workspace, 'sdk-written.txt'), content: 'NATIVE_WRITE_OK' } }] })
    }
    assert(body.messages.some(message => message.role === 'tool' && message.tool_call_id === 'native-file-call'))
    return upstream({ text: 'NATIVE_FILE_OK' })
  })
  const output = path.join(workspace, 'sdk-written.txt')
  const result = await runner.run('create sdk-written.txt', model, credential, 30_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') {
      assert.equal(fs.existsSync(output), false)
      assert.match(event.detail, /sdk-written\.txt/)
      assert.equal(runner.answerApproval(event.requestId, true), true); approved++
    }
  }, 'workspace-write', [], { key: 'native-file', cwd: workspace })
  assert.equal(result, 'NATIVE_FILE_OK')
  assert.equal(approved, 1, JSON.stringify(requests.at(-1).messages.filter(message => message.role === 'tool')))
  assert.equal(fs.readFileSync(output, 'utf8'), 'NATIVE_WRITE_OK')
  assert.equal(requests.length, 2)
})

test('a denied real SDK native Write returns an error tool result without creating the file', { timeout: 45_000 }, async t => {
  let denied = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'native-denied-call', name: 'Write', input: { file_path: path.join(workspace, 'denied.txt'), content: 'must not exist' } }] })
    const result = body.messages.find(message => message.role === 'tool' && message.tool_call_id === 'native-denied-call')
    assert.match(result?.content || '', /未批准|未执行|denied|拒绝/i)
    return upstream({ text: 'NATIVE_DENIAL_OK' })
  })
  const result = await runner.run('try a write', model, credential, 30_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { runner.answerApproval(event.requestId, false); denied++ }
  }, 'workspace-write', [], { key: 'native-denied', cwd: workspace })
  assert.equal(result, 'NATIVE_DENIAL_OK')
  assert.equal(denied, 1)
  assert.equal(fs.existsSync(path.join(workspace, 'denied.txt')), false)
})

test('real SDK native Write, Read and Edit preserve provider tool chains and file contents', { timeout: 60_000 }, async t => {
  const approvals = []; const toolEvents = []
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    const file = path.join(workspace, 'native-chain.txt')
    if (number === 1) { nativeCatalog(body); return upstream({ calls: [{ id: 'chain-write', name: 'Write', input: { file_path: file, content: 'NATIVE_CHAIN_BEFORE\n' } }] }) }
    if (number === 2) {
      assert(toolResult(body, 'chain-write'))
      const assistant = body.messages.find(message => message.tool_calls?.some(call => call.id === 'chain-write'))
      assert.equal(assistant?.reasoning_content, 'fixture thinking', 'provider thinking must survive the native tool round trip')
      return upstream({ calls: [{ id: 'chain-read-before', name: 'Read', input: { file_path: file } }] })
    }
    if (number === 3) {
      assert.match(toolResult(body, 'chain-read-before') || '', /NATIVE_CHAIN_BEFORE/)
      return upstream({ calls: [{ id: 'chain-edit', name: 'Edit', input: { file_path: file, old_string: 'NATIVE_CHAIN_BEFORE', new_string: 'NATIVE_CHAIN_AFTER' } }] })
    }
    if (number === 4) { assert(toolResult(body, 'chain-edit')); return upstream({ calls: [{ id: 'chain-read-after', name: 'Read', input: { file_path: file } }] }) }
    assert.equal(number, 5)
    assert.match(toolResult(body, 'chain-read-after') || '', /NATIVE_CHAIN_AFTER/)
    return upstream({ text: 'NATIVE_CHAIN_OK' })
  })
  const result = await runner.run('create, inspect and edit the fixture', model, credential, 45_000, event => {
    if (event.kind === 'tool') toolEvents.push(event)
    if (event.eventType === 'approval/request' && event.status === 'running') { approvals.push(event); assert.equal(runner.answerApproval(event.requestId, true), true) }
  }, 'workspace-write', [], { key: 'native-chain', cwd: workspace })
  assert.equal(result, 'NATIVE_CHAIN_OK')
  assert.equal(fs.readFileSync(path.join(workspace, 'native-chain.txt'), 'utf8'), 'NATIVE_CHAIN_AFTER\n')
  assert.equal(approvals.length, 2, 'Write and Edit require approval; Read does not')
  for (const name of ['Write', 'Read', 'Edit']) assert(toolEvents.some(event => event.title?.includes(name) && event.status === 'completed'), name + ' must publish a completed native tool event')
  assert.equal(requests.length, 5)
})

test('real SDK Read preserves line ranges and accepts its native allow_large option', { timeout: 45000 }, async t => {
  let failure
  const { workspace, runner } = fixture(t, (body, number) => {
    try {
      const file=path.join(workspace,'long-source.txt')
      if(number===1){assert(nativeTool(body,'Read').parameters.properties.allow_large);return upstream({calls:[{id:'long-read',name:'Read',input:{file_path:file,offset:3001,limit:2,allow_large:true}}]})}
      const output=toolResult(body,'long-read')
      assert.match(output,/SOURCE_LINE_3001/);assert.match(output,/SOURCE_LINE_3002/);assert.doesNotMatch(output,/SOURCE_LINE_3003/)
      return upstream({text:'NATIVE_LONG_READ_OK'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  fs.writeFileSync(path.join(workspace,'long-source.txt'),Array.from({length:4000},(_,i)=>`SOURCE_LINE_${i+1} ${'x'.repeat(100)}`).join('\n'))
  const answer=await runner.run('Read exactly lines 3001 and 3002',model,credential,30000,undefined,'read-only',[],{cwd:workspace})
  assert.ifError(failure);assert.equal(answer,'NATIVE_LONG_READ_OK')
})

test('real SDK long Bash output can be read through native Read without opening the session directory', { timeout: 60000 }, async t => {
  let failure,outputPath
  const events=[]
  const { workspace, runner }=fixture(t,(body,number)=>{
    try{
      if(number===1)return upstream({calls:[{id:'long-shell',name:'Bash',input:{command:`node -e "for(let i=1;i<=5000;i++)process.stdout.write('OUTPUT_LINE_'+i+' '+'x'.repeat(100)+'\\n')"`,timeout:15000}}]})
      if(number===2){
        const detail=events.findLast(e=>e.id==='long-shell'&&e.status==='completed')?.detail||''
        outputPath=detail.match(/完整输出：([^\r\n]+)/)?.[1]||toolResult(body,'long-shell')?.match(/Full output saved to: ([^\r\n]+)/)?.[1]
        assert(outputPath,JSON.stringify({detail,result:toolResult(body,'long-shell')}))
        return upstream({calls:[{id:'read-shell-tail',name:'Read',input:{file_path:outputPath,offset:4500,limit:2}}]})
      }
      assert.match(toolResult(body,'read-shell-tail'),/OUTPUT_LINE_4500/,outputPath);assert.match(toolResult(body,'read-shell-tail'),/OUTPUT_LINE_4501/)
      return upstream({text:'NATIVE_OUTPUT_READ_OK'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  const answer=await runner.run('Print the fixture output and read its saved tail.',model,credential,45000,e=>{events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(answer,'NATIVE_OUTPUT_READ_OK')
})

test('real SDK child long Bash output remains readable within the parent session', {timeout:60000},async t=>{
  let childStage=0,parentStage=0,outputPath,failure
  const events=[]
  const {workspace,runner}=fixture(t,body=>{
    try{
      if(body.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('CHILD_LONG_OUTPUT_FIXTURE'))){
        if(childStage++===0)return upstream({calls:[{id:'child-long-shell',name:'Bash',input:{command:`node -e "for(let i=1;i<=5000;i++)process.stdout.write('CHILD_LINE_'+i+' '+'x'.repeat(100)+'\\n')"`,timeout:15000}}]})
        if(childStage===2){
          const detail=events.findLast(e=>e.id==='child-long-shell'&&e.status==='completed')?.detail||''
          outputPath=detail.match(/完整输出：([^\r\n]+)/)?.[1]||toolResult(body,'child-long-shell')?.match(/Full output saved to: ([^\r\n]+)/)?.[1]
          assert(outputPath)
          return upstream({calls:[{id:'child-read-output',name:'Read',input:{file_path:outputPath,offset:4500,limit:2}}]})
        }
        assert.match(toolResult(body,'child-read-output'),/CHILD_LINE_4500/,outputPath)
        return upstream({text:'CHILD_OUTPUT_READ_OK'})
      }
      if(parentStage++===0)return upstream({calls:[{id:'delegate-output',name:'Agent',input:{description:'Read long command output',subagent_type:'stable-worker',run_in_background:false,prompt:'CHILD_LONG_OUTPUT_FIXTURE: print and inspect the saved output.'}}]})
      if(parentStage===2){
        assert.match(toolResult(body,'delegate-output'),/CHILD_OUTPUT_READ_OK/)
        return upstream({calls:[{id:'parent-read-output',name:'Read',input:{file_path:outputPath,offset:4999,limit:2}}]})
      }
      assert.match(toolResult(body,'parent-read-output'),/CHILD_LINE_5000/,outputPath)
      return upstream({text:'PARENT_OUTPUT_READ_OK'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  const answer=await runner.run('Delegate output generation and inspect the result',model,credential,45000,e=>{events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(answer,'PARENT_OUTPUT_READ_OK')
})

test('real SDK child Edit validation failures remain visible to the parent trace', {timeout:60000},async t=>{
  let childStage=0,parentStage=0,failure
  const events=[]
  const {workspace,runner}=fixture(t,body=>{
    try{
      if(body.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('CHILD_INVALID_EDIT_FIXTURE'))){
        if(childStage++===0)return upstream({calls:[{id:'child-read',name:'Read',input:{file_path:path.join(workspace,'child-edit.txt')}}]})
        if(childStage===2)return upstream({calls:[{id:'child-bad-edit',name:'Edit',input:{file_path:path.join(workspace,'child-edit.txt'),old_string:'not found',new_string:'changed'}}]})
        assert.match(toolResult(body,'child-bad-edit'),/not found/i);return upstream({text:'CHILD_EDIT_FAILED'})
      }
      if(parentStage++===0)return upstream({calls:[{id:'delegate-edit',name:'Agent',input:{description:'Inspect edit failure',subagent_type:'stable-worker',run_in_background:false,prompt:'CHILD_INVALID_EDIT_FIXTURE: inspect the failed edit.'}}]})
      assert.match(toolResult(body,'delegate-edit'),/CHILD_EDIT_FAILED/);return upstream({text:'PARENT_EDIT_CHECKED'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  fs.writeFileSync(path.join(workspace,'child-edit.txt'),'preserve original')
  assert.equal(await runner.run('Delegate the fixture edit',model,credential,45000,e=>{events.push(e);if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace}), 'PARENT_EDIT_CHECKED')
  assert.ifError(failure);assert.equal(fs.readFileSync(path.join(workspace,'child-edit.txt'),'utf8'),'preserve original')
  assert(events.some(e=>e.toolName==='Edit'&&e.status==='failed'&&/not found/i.test(e.detail)),JSON.stringify(events.filter(e=>e.kind==='tool')))
})

test('real SDK file reads after a Bash script edit return fresh content rather than an old cached read', {timeout:45000},async t=>{
  let failure
  const {workspace,runner}=fixture(t,(body,number)=>{
    try{
      const file=path.join(workspace,'cache-source.txt')
      if(number===1)return upstream({calls:[{id:'cache-before',name:'Read',input:{file_path:file}}]})
      if(number===2){assert.match(toolResult(body,'cache-before'),/CACHE_BEFORE/);return upstream({calls:[{id:'cache-edit',name:'Bash',input:{command:"printf 'CACHE_AFTER\\n' > cache-source.txt"}}]})}
      if(number===3)return upstream({calls:[{id:'cache-after',name:'Read',input:{file_path:file}}]})
      assert.match(toolResult(body,'cache-after'),/CACHE_AFTER/);assert.doesNotMatch(toolResult(body,'cache-after'),/CACHE_BEFORE/)
      return upstream({text:'FRESH_READ_OK'})
    }catch(error){failure=error;return upstream({text:'FIXTURE_FAILED'})}
  })
  fs.writeFileSync(path.join(workspace,'cache-source.txt'),'CACHE_BEFORE\n')
  const answer=await runner.run('Read, edit by script, and reread the fixture file',model,credential,30000,e=>{if(e.kind==='approval'&&e.status==='running')runner.answerApproval(e.requestId,true)},'workspace-write',[],{cwd:workspace,networkAccess:true})
  assert.ifError(failure);assert.equal(answer,'FRESH_READ_OK')
})

test('real SDK native Read, Glob and Grep inspect allowed files in read-only mode', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) {
      nativeCatalog(body)
      return upstream({ calls: [
        { id: 'native-read', name: 'Read', input: { file_path: path.join(workspace, 'search-source.txt') } },
        { id: 'native-glob', name: 'Glob', input: { pattern: '**/*.txt', path: workspace } },
        { id: 'native-grep', name: 'Grep', input: { pattern: 'LOCAL_SEARCH_MARKER', path: workspace, output_mode: 'content' } },
      ] })
    }
    assert.match(toolResult(body, 'native-read') || '', /LOCAL_READ_MARKER/)
    assert.match(toolResult(body, 'native-glob') || '', /search-source\.txt/)
    assert.match(toolResult(body, 'native-grep') || '', /LOCAL_SEARCH_MARKER/)
    return upstream({ text: 'NATIVE_READ_SEARCH_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'search-source.txt'), 'LOCAL_READ_MARKER\nLOCAL_SEARCH_MARKER\n')
  const result = await runner.run('inspect fixture source and search matches', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, false) } }, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_READ_SEARCH_OK')
  assert.equal(approvals, 0)
})

test('real SDK native NotebookEdit requires approval and modifies the requested cell', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    const notebook = path.join(workspace, 'fixture.ipynb')
    if (number === 1) return upstream({ calls: [{ id: 'notebook-read', name: 'Read', input: { file_path: notebook } }] })
    if (number === 2) { assert.match(toolResult(body, 'notebook-read') || '', /NOTEBOOK_BEFORE/); return upstream({ calls: [{ id: 'notebook-discover', name: 'ToolSearch', input: { query: 'select:NotebookEdit', max_results: 1 } }] }) }
    if (number === 3) { nativeTool(body, 'NotebookEdit'); return upstream({ calls: [{ id: 'notebook-edit', name: 'NotebookEdit', input: { notebook_path: notebook, cell_id: 'fixture-cell', edit_mode: 'replace', new_source: 'NOTEBOOK_AFTER' } }] }) }
    assert(toolResult(body, 'notebook-edit'))
    assert.doesNotMatch(toolResult(body, 'notebook-edit'), /Tool execution error|denied|拒绝/i)
    return upstream({ text: 'NATIVE_NOTEBOOK_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'fixture.ipynb'), JSON.stringify({ cells: [{ id: 'fixture-cell', cell_type: 'markdown', metadata: {}, source: ['NOTEBOOK_BEFORE'] }], metadata: {}, nbformat: 4, nbformat_minor: 5 }))
  const result = await runner.run('replace the fixture notebook cell', model, credential, 30_000, event => { if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, true) } }, 'workspace-write', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_NOTEBOOK_OK')
  assert.equal(approvals, 1)
  const source = JSON.parse(fs.readFileSync(path.join(workspace, 'fixture.ipynb'), 'utf8')).cells[0].source
  assert.equal(Array.isArray(source) ? source.join('') : source, 'NOTEBOOK_AFTER')
})

test('real SDK native out-of-scope Read and Write are denied before approval or data exposure', { timeout: 45_000 }, async t => {
  let approvals = 0
  const outsideMarker = 'OUTSIDE_NATIVE_READ_MUST_NOT_LEAK'
  const { root, workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [
      { id: 'outside-read', name: 'Read', input: { file_path: path.join(root, 'outside-secret.txt') } },
      { id: 'outside-write', name: 'Write', input: { file_path: path.join(root, 'outside-created.txt'), content: 'must not exist' } },
    ] })
    for (const id of ['outside-read', 'outside-write']) assert.match(toolResult(body, id) || '', /超出.*允许.*目录|路径.*越界/)
    assert.equal(JSON.stringify(body.messages).includes(outsideMarker), false)
    return upstream({ text: 'NATIVE_BOUNDARY_OK' })
  })
  fs.writeFileSync(path.join(root, 'outside-secret.txt'), outsideMarker)
  const result = await runner.run('exercise explicit forbidden fixture paths', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, true) } }, 'workspace-write', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_BOUNDARY_OK')
  assert.equal(approvals, 0, 'a path outside allowed roots must not become approvable')
  assert.equal(fs.existsSync(path.join(root, 'outside-created.txt')), false)
  assert.equal(fs.readFileSync(path.join(root, 'outside-secret.txt'), 'utf8'), outsideMarker)
})

test('real SDK read-only native Write is rejected even if an approval callback would allow it', { timeout: 45_000 }, async t => {
  let approvals = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [{ id: 'readonly-write', name: 'Write', input: { file_path: path.join(workspace, 'readonly-created.txt'), content: 'must not exist' } }] })
    assert.match(toolResult(body, 'readonly-write') || '', /只读.*不能写|read.only/i)
    return upstream({ text: 'NATIVE_READONLY_OK' })
  })
  const result = await runner.run('exercise read-only fixture write refusal', model, credential, 30_000, event => { if (event.eventType === 'approval/request') { approvals++; runner.answerApproval(event.requestId, true) } }, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_READONLY_OK')
  assert.equal(approvals, 0)
  assert.equal(fs.existsSync(path.join(workspace, 'readonly-created.txt')), false)
})

test('real SDK native Glob and Grep reject an external directory junction without leaking file names or contents', { timeout: 45_000 }, async t => {
  const marker = 'JUNCTION_EXTERNAL_CONTENT_MUST_NOT_LEAK'
  const { root, workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) return upstream({ calls: [
      { id: 'junction-glob', name: 'Glob', input: { pattern: '**/*.txt', path: path.join(workspace, 'junction') } },
      { id: 'junction-grep', name: 'Grep', input: { pattern: 'JUNCTION_EXTERNAL_CONTENT', path: path.join(workspace, 'junction'), output_mode: 'content' } },
      { id: 'junction-root-glob', name: 'Glob', input: { pattern: '**/*.txt', path: workspace } },
      { id: 'junction-root-grep', name: 'Grep', input: { pattern: 'JUNCTION_EXTERNAL_CONTENT', path: workspace, output_mode: 'content' } },
    ] })
    for (const id of ['junction-glob', 'junction-grep', 'junction-root-glob', 'junction-root-grep']) {
      const result = toolResult(body, id) || ''
      assert.match(result, /超出.*允许.*目录|越界.*链接|不.*允许.*链接/)
      assert.equal(result.includes(marker), false)
      assert.equal(result.includes('private-external.txt'), false)
    }
    return upstream({ text: 'NATIVE_JUNCTION_OK' })
  })
  const external = path.join(root, 'outside'); fs.mkdirSync(external)
  fs.writeFileSync(path.join(external, 'private-external.txt'), marker)
  fs.symlinkSync(external, path.join(workspace, 'junction'), process.platform === 'win32' ? 'junction' : 'dir')
  const result = await runner.run('search only within approved fixture directories', model, credential, 30_000, undefined, 'read-only', [], { cwd: workspace })
  assert.equal(result, 'NATIVE_JUNCTION_OK')
})

test('real SDK provider search keeps the Stable MCP transport alongside native files without duplicate tools', { timeout: 45_000 }, async t => {
  let searches = 0
  const { workspace, runner } = fixture(t, (body, number) => {
    if (number === 1) { nativeCatalog(body, true); return upstream({ calls: [{ id: 'provider-discover', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_search', max_results: 1 } }] }) }
    if (number === 2) { nativeTool(body, 'mcp__stable__stable_search'); return upstream({ calls: [{ id: 'provider-search', name: 'mcp__stable__stable_search', input: { query: 'native fixture query' } }] }) }
    assert.match(toolResult(body, 'provider-search') || '', /https:\/\/source\.example\/fixture/)
    return upstream({ text: 'NATIVE_PROVIDER_SEARCH_OK' })
  }, { search: async (args, signal) => { searches++; assert.equal(args.query, 'native fixture query'); assert.equal(signal.aborted, false); return { sources: [{ url: 'https://source.example/fixture', title: 'Fixture source', snippet: 'Fixture evidence' }] } } })
  const result = await runner.run('search the fixture provider', model, credential, 30_000, undefined, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.equal(result, 'NATIVE_PROVIDER_SEARCH_OK'); assert.equal(searches, 1)
})

test('real SDK discovers cloud search but cannot invoke fallback before native fetch', { timeout: 60000 }, async t => {
  let failure
  const webCalls = [], events = []
  const { workspace, runner, requests } = fixture(t, (body, number) => {
    try {
      if (number === 1) return upstream({ calls: [{ id: 'find-search', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_search', max_results: 1 } }] })
      if (number === 2) { nativeTool(body, 'mcp__stable__stable_search'); return upstream({ calls: [{ id: 'search-web', name: 'mcp__stable__stable_search', input: { query: 'site:example.org release', maxResults: 2 } }] }) }
      if (number === 3) { assert.match(toolResult(body, 'search-web'), /https:\/\/example.org\/release/); return upstream({ calls: [{ id: 'find-fetch', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_fetch', max_results: 1 } }] }) }
      if (number === 4) { nativeTool(body, 'mcp__stable__stable_fetch'); return upstream({ calls: [{ id: 'fetch-web', name: 'mcp__stable__stable_fetch', input: { url: 'https://example.org/release' } }] }) }
      assert.equal(number, 5); assert.match(toolResult(body, 'fetch-web'), /先用 ToolSearch.*WebFetch/)
      return upstream({ text: 'FALLBACK_REQUIRES_NATIVE' })
    } catch (error) { failure = error; return upstream({ text: 'FAILED' }) }
  }, { expectedModel: 'glm-5.3-flashx', webResponder: async (url, request) => {
    webCalls.push([url, JSON.parse(request.body)])
    assert.equal(request.headers.authorization, 'Bearer ' + credential)
    return Response.json(url.endsWith('/search') ? { results: [{ title: 'Source', url: 'https://example.org/release', snippet: 'short', summary: 'evidence', content: '' }] } : { title: 'Source', content: '# VERIFIED_WEB_EVIDENCE' })
  } })
  const answer = await runner.run('Search the fixture web service, fetch the matching source and cite it. Only read the approved fixture sources.', { ...model, providerId: 'stable-cloud', model: 'glm-5.3-flashx' }, credential, 45000, e => { events.push(e); if (e.kind === 'approval' && e.status === 'running') runner.answerApproval(e.requestId, true) }, 'workspace-write', [], { cwd: workspace, networkAccess: true })
  assert.ifError(failure); assert.equal(answer, 'FALLBACK_REQUIRES_NATIVE')
  assert.equal(requests.length, 5); assert.equal(webCalls.length, 1)
  assert(!events.some(e => e.kind === 'approval'), 'premature fallback must not reach approval or network')
  assert(events.some(e => JSON.stringify(e).includes('stable_fetch')))
})

test('real SDK child discovers web fetch and inherits the parent network boundary', { timeout: 90_000 }, async t => {
  for (const networkAccess of [true, false]) await t.test(networkAccess ? 'online' : 'offline', async t => {
    let childCalls = 0, webCalls = 0, failure
    const { workspace, runner } = fixture(t, (body, number) => {
      try {
        if (body.messages.some(m => m.role === 'user' && JSON.stringify(m.content).includes('CHILD_FETCH_FIXTURE'))) {
          childCalls++
          if (childCalls === 1) return upstream({ calls: [{ id: 'child-find-fetch', name: 'ToolSearch', input: { query: 'select:mcp__stable__stable_fetch', max_results: 1 } }] })
          if (childCalls === 2) {
            nativeTool(body, 'mcp__stable__stable_fetch')
            return upstream({ calls: [{ id: 'child-fetch', name: 'mcp__stable__stable_fetch', input: { url: 'https://example.org/child' } }] })
          }
          assert.match(toolResult(body, 'child-fetch'), networkAccess ? /先用 ToolSearch.*WebFetch/ : /禁止网页抓取/)
          return upstream({ text: 'CHILD_FETCH_CHECKED' })
        }
        if (number === 1) return upstream({ calls: [{ id: 'delegate-fetch', name: 'Agent', input: { description: 'Read fixture source', subagent_type: 'stable-worker', prompt: 'CHILD_FETCH_FIXTURE: fetch the fixture page.', run_in_background: false } }] })
        assert.match(toolResult(body, 'delegate-fetch'), /CHILD_FETCH_CHECKED/)
        return upstream({ text: 'PARENT_FETCH_CHECKED' })
      } catch (error) { failure = error; return upstream({ text: 'FIXTURE_FAILED' }) }
    }, { expectedModel: 'glm-5.3-flashx', webResponder: async url => {
      assert(networkAccess); assert(url.endsWith('/fetch')); webCalls++
      return Response.json({ title: 'Child source', content: 'CHILD_WEB_EVIDENCE' })
    } })
    assert.equal(await runner.run('Delegate reading the fixture source', { ...model, providerId: 'stable-cloud', model: 'glm-5.3-flashx' }, credential, 35000, e => { if (e.kind === 'approval' && e.status === 'running') runner.answerApproval(e.requestId, true) }, 'workspace-write', [], { cwd: workspace, networkAccess }), 'PARENT_FETCH_CHECKED')
    assert.ifError(failure); assert.equal(childCalls, 3); assert.equal(webCalls, 0)
  })
})

test('real SDK steering receipt is delivered and the provider processes the extra prompt', { timeout: 45_000 }, async t => {
  const reached = deferred(), release = deferred()
  const { workspace, runner, requests } = fixture(t, (body, number, request) => {
    if (number === 1) { reached.resolve(); return pendingUpstream(request, release.promise) }
    assert.match(texts(body), /NATIVE_STEER_MARKER/)
    return upstream({ text: 'NATIVE_STEER_OK' })
  })
  const running = runner.run('start first task', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'native-steer', cwd: workspace })
  // Attach rejection handling immediately so a startup error remains reported
  // as this test's failure rather than an unhandled rejection.
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  const steering = runner.steer('NATIVE_STEER_MARKER: change the task')
  release.resolve()
  assert.deepEqual(await steering, { accepted: true })
  const outcome = await settled
  if (outcome.error) throw outcome.error
  assert.equal(outcome.value, 'NATIVE_STEER_OK')
  assert.equal(requests.length, 2)
})

test('real SDK cancellation stops a pending provider request and records an interrupted turn', { timeout: 45_000 }, async t => {
  const reached = deferred(); let providerSignal
  const { root, workspace, runner } = fixture(t, (_body, _number, request) => {
    providerSignal = request.signal; reached.resolve()
    return pendingUpstream(request)
  })
  const running = runner.run('wait for provider', model, credential, 30_000, undefined, 'workspace-write', [], { key: 'native-cancel', cwd: workspace })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  assert.equal(runner.cancel(), true)
  const outcome = await settled
  assert.match(outcome.error?.message || '', /任务已停止/)
  assert.equal(providerSignal.aborted, true)
  assert.equal(runner.busy, false)
  const local = await createClaudeLifecycle({ userData: root }).read('native-cancel')
  assert.equal(local.thread.turns[0].status, 'interrupted')
})

test('cancellation before the provider returns any token still preserves the accepted local turn', { timeout: 45_000 }, async t => {
  const reached = deferred(); let providerSignal; let deltas = 0
  const { root, workspace, runner } = fixture(t, (_body, _number, request) => {
    providerSignal = request.signal
    reached.resolve()
    return new Promise((_resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('fixture cancelled before response'), { name: 'AbortError' }))
      if (request.signal.aborted) abort()
      else request.signal.addEventListener('abort', abort, { once: true })
    })
  })
  const running = runner.run('wait before first token', model, credential, 30_000, event => {
    if (event.eventType === 'agent/answer-delta') deltas++
  }, 'workspace-write', [], { key: 'native-no-token', cwd: workspace })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { if (result.error) throw result.error })])
  await until(() => runner.steerReady)
  assert.equal(runner.cancel(), true)
  const outcome = await settled
  assert.match(outcome.error?.message || '', /任务已停止/)
  assert.equal(providerSignal.aborted, true)
  assert.equal(deltas, 0)
  const local = await createClaudeLifecycle({ userData: root }).read('native-no-token')
  assert.equal(local.thread.turns.length, 1)
  assert.equal(local.thread.turns[0].status, 'interrupted')
  assert.equal(local.thread.turns[0].items[0].text, '')
})

test('real SDK Agent delegation inherits bounded native file tools and keeps child inference on the chosen provider', { timeout: 60_000 }, async t => {
  let childRequests = 0; let childResult; let approvals = 0; let skillName
  const { root, workspace, runner, requests } = fixture(t, (body, number) => {
    const users = body.messages.filter(message => message.role === 'user')
    if (users.some(message => JSON.stringify(message.content).includes('NATIVE_CHILD_MARKER'))) {
      childRequests++
      nativeCatalog(body)
      assert(!body.tools?.some(tool => ['Bash', 'PowerShell', 'Agent'].includes(tool.function.name)))
      nativeTool(body, 'Skill')
      if (!toolResult(body, 'native-child-skill')) return upstream({ calls: [{ id: 'native-child-skill', name: 'Skill', input: { skill: skillName } }] })
      assert.match(JSON.stringify(body.messages), /CHILD_AUTHORIZED_SKILL/)
      if (!toolResult(body, 'native-child-read')) return upstream({ calls: [{ id: 'native-child-read', name: 'Read', input: { file_path: path.join(workspace, 'child-source.txt') } }] })
      assert.match(toolResult(body, 'native-child-read'), /NATIVE_CHILD_SOURCE/)
      if (!toolResult(body, 'native-child-outside-write')) return upstream({ calls: [{ id: 'native-child-outside-write', name: 'Write', input: { file_path: path.join(root, 'outside-child.txt'), content: 'must not exist' } }] })
      assert.match(toolResult(body, 'native-child-outside-write'), /超出.*允许.*目录|路径.*越界/)
      assert.equal(fs.existsSync(path.join(root, 'outside-child.txt')), false)
      return upstream({ text: 'NATIVE_CHILD_OK' })
    }
    if (number === 1) {
      const agent = body.tools?.find(tool => tool.function.name === 'Agent')
      assert(agent, 'the bounded native Agent tool must remain enabled')
      return upstream({ calls: [{ id: 'native-agent-call', name: agent.function.name, input: { description: 'Inspect fixture', prompt: 'NATIVE_CHILD_MARKER: read child-source.txt and return NATIVE_CHILD_OK.', subagent_type: 'Explore', model: 'haiku', run_in_background: true, isolation: 'worktree' } }] })
    }
    childResult = body.messages.findLast(message => message.role === 'tool' && message.tool_call_id === 'native-agent-call')?.content
    if (!JSON.stringify(body.messages).includes('NATIVE_CHILD_OK')) return upstream({ text: 'WAITING_FOR_CHILD' })
    assert.match(JSON.stringify(body.messages), /NATIVE_CHILD_OK/)
    return upstream({ text: 'NATIVE_PARENT_OK' })
  })
  fs.writeFileSync(path.join(workspace, 'child-source.txt'), 'NATIVE_CHILD_SOURCE')
  const skillRoot = path.join(root, 'child-skill'); fs.mkdirSync(skillRoot)
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '---\nname: child-skill\ndescription: Child inspection skill\n---\nCHILD_AUTHORIZED_SKILL')
  skillName = 'stable-authorized:child-skill-' + require('node:crypto').createHash('sha256').update(fs.realpathSync(skillRoot)).digest('hex').slice(0, 10)
  const result = await runner.run('delegate a fixture inspection', { ...model, contextWindow: 1_000_000 }, credential, 45_000, event => {
    if (event.eventType === 'approval/request' && event.status === 'running') { approvals++; runner.answerApproval(event.requestId, false) }
  }, 'workspace-write', [], { key: 'native-agent', cwd: workspace, readableRoots: [skillRoot], automaticSkills: [{ name: 'child-skill', path: skillRoot }] })
  assert.equal(result, 'NATIVE_PARENT_OK')
  assert.equal(childRequests, 4)
  assert.equal(approvals, 0, 'a child Agent must not escalate an out-of-scope path through approval')
  assert.equal(fs.existsSync(path.join(root, 'outside-child.txt')), false)
  assert(requests.length >= 5)
})


test('real SDK reports context summary and persists it before closing the session', { timeout: 45000 }, async t => {
  const { root, workspace, runner, requests } = fixture(t, () => upstream({ text: 'CONTEXT_READY' }))
  const profile = { ...model, contextWindow: 1_000_000 }
  assert.equal(await runner.run('Inspect context statistics', profile, credential, 30000, undefined, 'read-only', [], { key: 'context-usage', cwd: workspace }), 'CONTEXT_READY')
  const usage = require('../desktop/services/context-usage.cjs').readContextUsage(root, 'context-usage', profile)
  assert(usage, 'real SDK must return context usage before the runtime closes')
  assert(usage.usedTokens > 0)
  assert.equal(usage.maxTokens, 1_000_000)
  assert(usage.categories.length > 0)
  assert.equal(requests.length, 1, 'summary must not send an additional inference request')
  console.log('CONTEXT_USAGE_NATIVE', JSON.stringify({ total: usage.usedTokens, max: usage.maxTokens, categories: usage.categories }))
})


test('real SDK exposes context usage while a model response is streaming', { timeout: 45000 }, async t => {
  const reached = deferred(), release = deferred()
  const { workspace, runner } = fixture(t, (_body, _number, request) => {
    reached.resolve()
    return pendingUpstream(request, release.promise)
  })
  const running = runner.run('Stream while inspecting usage', model, credential, 30000, undefined, 'read-only', [], { key: 'live-usage', cwd: workspace })
  const settled = running.then(value => ({ value }), error => ({ error }))
  await Promise.race([reached.promise, settled.then(result => { throw result.error || Error('run ended before request') })])
  try {
    const usage = await runner.getContextUsage()
    assert(usage?.usedTokens > 0, 'the live indicator must receive SDK usage before inference finishes')
    assert.equal(runner.busy, true)
  } finally { release.resolve() }
  const result = await settled
  if (result.error) throw result.error
  assert.equal(result.value, 'FIRST_REPLY')
})


test('real SDK automatically compacts and resumes at the configured context window', { timeout: 120000 }, async t => {
  for (const contextWindow of [128000, 200000, 1000000]) await t.test(String(contextWindow), async t => {
    let seedTurns = 0, summaries = 0, boundaryTurns = 0
    // Give the runtime real compressible history, not just inflated usage metadata
    // (the latter is correctly treated as an oversized, uncompressible fixed prefix).
    const filler = 'fixture detail '.repeat(Math.ceil(contextWindow * 1.15 / 15))
    const events = []
    const { root, workspace, runner, requests } = fixture(t, body => {
      const text = JSON.stringify(body.messages)
      if (compactionPrompt(body)) {
        summaries++
        return upstream({ text: '<summary>COMPACTED_CONTEXT: Preserve KEEP_AFTER_COMPACT. Continue the user task.</summary>', inputTokens: 2000 })
      }
      if (seedTurns < 3) {
        seedTurns++
        return upstream({ text: `TURN_${seedTurns}: ${seedTurns === 3 ? 'READY' : filler}`, inputTokens: Math.floor(contextWindow * (seedTurns === 3 ? .77 : seedTurns * .15)) })
      }
      if (boundaryTurns < 2) {
        assert.equal(summaries, 0, 'do not compact below 80 percent')
        boundaryTurns++
        return upstream({ text: 'BOUNDARY_' + boundaryTurns, inputTokens: Math.floor(contextWindow * (boundaryTurns === 1 ? .79 : .81)) })
      }
      assert.match(text, /KEEP_AFTER_COMPACT/)
      assert.match(text, /COMPACTED_CONTEXT/)
      return upstream({ text: 'AFTER_COMPACTION_OK', inputTokens: 2500 })
    })
    const profile = { ...model, contextWindow }
    const session = { key: 'compact-fixture', cwd: workspace }
    let originalThread
    for (let turn = 1; turn <= 3; turn++) {
      assert.match(await runner.run('KEEP_AFTER_COMPACT: perform fixture step ' + turn, profile, credential, 45000, event => events.push(event), 'read-only', [], session), new RegExp('^TURN_' + turn))
      originalThread ??= runner.threadId
      assert.equal(runner.threadId, originalThread)
    }
    for (let step = 1; step <= 2; step++) {
      assert.equal(await runner.run('Check below threshold ' + step, profile, credential, 45000, event => events.push(event), 'read-only', [], session), 'BOUNDARY_' + step)
      assert.equal(summaries, 0)
    }
    assert.equal(await runner.run('Continue the fixture task.', profile, credential, 45000, event => events.push(event), 'read-only', [], session), 'AFTER_COMPACTION_OK')
    assert.equal(runner.threadId, originalThread, 'compaction must preserve the native session across process restarts')
    assert.equal(summaries, 1, 'The native SDK must issue one actual compaction request')
    assert.equal(events.filter(event => event.title === '上下文已自动压缩').length, 1, 'The native runtime must emit exactly one compact_boundary')
    assert.equal(requests.length, 7)
    const sizes = requests.map(body => JSON.stringify(body.messages).length)
    assert(sizes.at(-1) < Math.max(...sizes.slice(0, -1)), 'the resumed request uses the compacted history')
    const usage = require('../desktop/services/context-usage.cjs').readContextUsage(root, session.key, profile)
    assert(usage.usedTokens < contextWindow * .8, 'the saved usage snapshot reflects compaction')
    console.log('NATIVE_COMPACTION_VERIFIED', JSON.stringify({ contextWindow, summaries, requests: requests.length, afterTokens: usage.usedTokens }))
  })
})
