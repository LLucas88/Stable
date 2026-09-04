'use strict'

// Real bundled Codex, local deterministic Chat Completions provider, no account
// credentials or paid model calls. Run with npm run test:codex-integration.
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const resourcesPath = process.env.STABLE_CODEX_TEST_RESOURCES
const { CodexHarnessRunner } = require(resourcesPath ? path.join(resourcesPath, 'app.asar/desktop/services/codex-harness.cjs') : '../desktop/services/codex-harness.cjs')
const { canAutoApprove } = require(resourcesPath ? path.join(resourcesPath, 'app.asar/desktop/services/codex-approval.cjs') : '../desktop/services/codex-approval.cjs')
const { CloudGatewayProxy } = require(resourcesPath ? path.join(resourcesPath, 'app.asar/desktop/services/cloud-gateway-proxy.cjs') : '../desktop/services/cloud-gateway-proxy.cjs')

async function main() {
  const root = path.resolve(__dirname, '../qa-artifacts/codex-integration', `${Date.now()}`)
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace, { recursive: true })
  const requests = []; const events = []; const responseInputs = []
  const expectedThoughts = new Map()
  const autoApprovals = []; const manualApprovals = []
  let phase = 'text'; let issuedTool = false; let currentRunner; let cancelSeen; let cloudRequests = 0
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); requests.push(body)
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return }
    if (phase === 'cancel') { cancelSeen(); return }
    if (phase !== 'image' && body.messages.some((message) => typeof message.content !== 'string' && !(message.role === 'assistant' && message.content == null && message.tool_calls?.length))) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: '第一版网关只允许纯文本消息；图片、音频和多模态内容暂不开放。' } })); return
    }
    for (const message of body.messages.filter((item) => item.role === 'assistant')) {
      const content = typeof message.content === 'string' ? message.content : (message.content || []).map((part) => part.text || '').join('')
      const expected = expectedThoughts.get(message.tool_calls?.[0]?.id || content)
      if (expected === undefined || message.reasoning_content !== expected) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'The reasoning_content in the thinking mode must be passed back to the API.' } })); return
      }
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const thought = `MOCK_REASONING_${requests.length}`
    expectedThoughts.set(`CODEX_OK_${requests.length}`, thought)
    let chunks = [
      { choices: [{ index: 0, delta: { reasoning_content: thought }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'CODEX_' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: `OK_${requests.length}` }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 } },
    ]
    if (phase === 'compact' && !issuedTool) {
      issuedTool = true
      chunks.at(-1).usage = { prompt_tokens: 95000, completion_tokens: 5, total_tokens: 95005 }
    }
    if (['write', 'deny', 'search', 'read-full', 'write-full', 'danger-full', 'unknown-full'].includes(phase) && !issuedTool) {
      issuedTool = true
      const target = path.join(phase === 'deny' ? root : workspace, `${phase}.txt`).replace(/'/g, "''")
      const tool = phase === 'search' ? body.tools.find((item) => item.function.name.includes('web_search')) : body.tools.find((item) => item.function.name === 'shell_command')
      assert.ok(tool, `Expected ${phase} tool: ${JSON.stringify(body.tools?.map((item) => item.function.name))}`)
      let command = `Set-Content -LiteralPath '${target}' -Value 'CODEX_FILE_OK'`
      if (phase === 'read-full') command = '$f="read-full.txt"; Select-String -Path "$f" -Pattern "A店|summary" -Context 2,2 | Select-Object -First 40 | Format-List'
      if (phase === 'danger-full') command = "Remove-Item -LiteralPath 'sentinel.txt'"
      if (phase === 'unknown-full') command = "Write-Output ([string]::Join('', 'a', 'b'))"
      const args = phase === 'search' ? { query: 'mock query' } : { command, workdir: workspace, login: false, timeout_ms: 10000 }
      expectedThoughts.set(`call_${phase}`, thought)
      chunks = [
        { choices: [{ index: 0, delta: { reasoning_content: thought, content: `TOOL_NOTE_${phase}` }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${phase}`, type: 'function', function: { name: tool.function.name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      ]
    }
    for (const value of chunks) res.write(`data: ${JSON.stringify(value)}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const directModel = { id: 'mock', model: 'stable-mock', providerId: 'mock', baseURL: `http://127.0.0.1:${server.address().port}/v1` }
  const proxy = new CloudGatewayProxy({
    account: { baseURL: `http://127.0.0.1:${server.address().port}`, token: () => 'mock-device-token', publicState: () => ({ models: [{ id: 'stable-mock' }] }) },
    fetchImpl: (url, options) => {
      cloudRequests++
      assert.equal(options.headers.authorization, 'Bearer mock-device-token')
      assert.match(options.headers['idempotency-key'], /^stable-/)
      return fetch(url, options)
    },
  })
  await proxy.start()
  const { model, apiKey } = proxy.modelRoute('stable-mock')
  const options = { userData: root, workspace, packaged: Boolean(resourcesPath), resourcesPath, onModelRequest: (_body, input) => responseInputs.push(input) }
  try {
    const runner = new CodexHarnessRunner(options)
    const answer = await runner.run('FIRST_PROMPT', model, apiKey, 45000, (e) => events.push(e), 'read-only', [], { key: 'conversation-a' })
    assert.equal(answer, 'CODEX_OK_1')
    const next = new CodexHarnessRunner(options)
    assert.equal(await next.run('SECOND_PROMPT', model, apiKey, 45000, (e) => events.push(e), 'read-only', [], { key: 'conversation-a' }), 'CODEX_OK_2')
    assert.match(JSON.stringify(requests[1].messages), /FIRST_PROMPT/)
    assert.match(JSON.stringify(requests[1].messages), /CODEX_OK_1/)
    assert.ok(events.some((event) => event.eventType === 'agent/answer-delta'))
    assert.equal(requests.length, 2)
    assert.equal(requests[1].messages.find((message) => message.role === 'assistant').reasoning_content, 'MOCK_REASONING_1')
    const image = path.join(workspace, 'pixel.png')
    fs.copyFileSync(path.resolve(__dirname, '../build/stable_logo.png'), image)
    phase = 'image'
    await new CodexHarnessRunner(options).run('IMAGE_PROMPT', directModel, 'mock-key', 45000, (e) => events.push(e), 'read-only', [{ path: image, mediaType: 'image/png', name: 'pixel.png' }])
    assert.ok(requests.at(-1).messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url' && part.image_url.url.startsWith('data:image/'))))
    const publish = (event) => {
      events.push(event)
      if (event.kind === 'approval' && event.status === 'running') {
        const automatic = canAutoApprove(phase.endsWith('-full') ? 'full' : 'request', event)
        ;(automatic ? autoApprovals : manualApprovals).push({ phase, risk: event.approvalRisk })
        assert.equal(currentRunner.answerApproval(event.requestId, automatic || phase === 'write'), true)
        console.log(`QA approval replied: ${phase}`)
      }
    }
    phase = 'write'; issuedTool = false; currentRunner = new CodexHarnessRunner(options)
    await currentRunner.run('WRITE_FILE', model, apiKey, 45000, publish)
    assert.match(fs.readFileSync(path.join(workspace, 'write.txt'), 'utf8'), /CODEX_FILE_OK/)
    assert.ok(requests.at(-1).messages.some((message) => message.role === 'tool'))
    phase = 'deny'; issuedTool = false; currentRunner = new CodexHarnessRunner(options)
    await currentRunner.run('DENY_OUTSIDE_FILE', model, apiKey, 45000, publish)
    assert.equal(fs.existsSync(path.join(root, 'deny.txt')), false)
    assert.ok(events.some((event) => event.kind === 'approval'))
    fs.writeFileSync(path.join(workspace, 'read-full.txt'), 'A店 summary 170')
    fs.writeFileSync(path.join(workspace, 'sentinel.txt'), 'DO_NOT_DELETE')
    for (const nextPhase of ['read-full', 'write-full', 'danger-full', 'unknown-full']) {
      phase = nextPhase; issuedTool = false; currentRunner = new CodexHarnessRunner(options)
      await currentRunner.run(nextPhase, model, apiKey, 45000, publish)
      if (phase === 'read-full') assert.match(JSON.stringify(requests.at(-1).messages.filter((message) => message.role === 'tool')), /A店 summary 170/)
    }
    assert.match(fs.readFileSync(path.join(workspace, 'write-full.txt'), 'utf8'), /CODEX_FILE_OK/)
    assert.equal(fs.readFileSync(path.join(workspace, 'sentinel.txt'), 'utf8'), 'DO_NOT_DELETE')
    assert.deepEqual(autoApprovals.map((entry) => entry.phase), ['read-full', 'write-full'])
    assert.deepEqual(manualApprovals, [{ phase: 'write', risk: 'safe' }, { phase: 'deny', risk: 'high' }, { phase: 'danger-full', risk: 'high' }, { phase: 'unknown-full', risk: 'unknown' }])
    phase = 'search'; issuedTool = false
    let searchCalled = false
    currentRunner = new CodexHarnessRunner({ ...options, search: async ({ query }) => { assert.equal(query, 'mock query'); searchCalled = true; return { sources: [{ url: 'https://example.com/source', title: 'MOCK_SEARCH_RESULT' }], truncated: false } } })
    await currentRunner.run('SEARCH_PROMPT', { ...directModel, model: 'glm-test', providerId: 'zhipu' }, 'mock-key', 45000, publish, 'read-only')
    assert.equal(searchCalled, true)
    assert.match(JSON.stringify(requests.at(-1).messages.filter((message) => message.role === 'tool')), /MOCK_SEARCH_RESULT/)
    phase = 'compact'; issuedTool = false
    const compactEvents = []
    await new CodexHarnessRunner(options).run('COMPACT_FIRST', model, apiKey, 45000, (event) => compactEvents.push(event), 'read-only', [], { key: 'compact' })
    await new CodexHarnessRunner(options).run('COMPACT_NEXT', model, apiKey, 45000, (event) => compactEvents.push(event), 'read-only', [], { key: 'compact' })
    events.push(...compactEvents)
    assert.ok(compactEvents.some((event) => event.title?.includes('contextCompaction')), 'Expected real Codex context compaction')
    phase = 'cancel'; currentRunner = new CodexHarnessRunner(options)
    const seen = new Promise((resolve) => { cancelSeen = resolve })
    const cancelled = currentRunner.run('CANCEL_WAIT', model, apiKey, 45000, publish)
    const rejected = assert.rejects(cancelled, /任务已停止/)
    await Promise.race([seen, cancelled.then(() => { throw new Error('Cancellation probe completed before receiving a model request') })])
    assert.equal(currentRunner.cancel(), true); await rejected
    assert.equal(currentRunner.busy, false)
    assert.equal(cloudRequests, requests.length - 3, 'Text runs use the cloud proxy; only image and the two search requests use a direct provider')
    const report = { success: true, checks: ['stream', 'resume-after-restart', 'thinking-state-replay', 'context-compaction', 'image-input', 'tool-file-write', 'approval-denial', 'full-read-auto-approval', 'full-write-auto-approval', 'full-danger-confirmation', 'full-unknown-confirmation', 'cloud-proxy-text-contract', 'mcp-search', 'cancel'], cloudRequests, autoApprovals, manualApprovals, requests: requests.length, tools: requests[0].tools?.map((tool) => tool.function.name), events: [...new Set(events.map((event) => event.eventType))], root }
    fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    fs.writeFileSync(path.join(root, 'trace.json'), JSON.stringify({ requests, events, responseInputs }, null, 2))
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve))
    await proxy.stop()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
