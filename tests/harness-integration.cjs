'use strict'

const assert = require('node:assert/strict')
const http = require('node:http')
const { mkdtempSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { HarnessRunner } = require('../desktop/services/harness.cjs')

async function main() {
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      requests.push({ url: request.url, authorization: request.headers.authorization, body })
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      const created = Math.floor(Date.now() / 1000)
      response.write(`data: ${JSON.stringify({ id: 'stable-mock', object: 'chat.completion.chunk', created, model: 'stable-mock', choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ id: 'stable-mock', object: 'chat.completion.chunk', created, model: 'stable-mock', choices: [{ index: 0, delta: { content: 'STABLE_MOCK_OK' }, finish_reason: null }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ id: 'stable-mock', object: 'chat.completion.chunk', created, model: 'stable-mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-live-'))
  const runner = new HarnessRunner({ userData: root, workspace: path.join(root, 'workspace'), packaged: false, resourcesPath: root })
  try {
    assert.equal(runner.ready(), true, 'local Harness runtime should exist')
    const longPrompt = `只回复 STABLE_MOCK_OK\n${'本地资料片段。'.repeat(12_000)}\nLONG_PROMPT_END`
    assert.ok(longPrompt.length > 80_000, 'regression prompt must exceed the Windows command-line limit')
    const events = []
    const answer = await runner.run(longPrompt, { providerId: 'stable-mock', displayName: 'Stable Mock', baseURL: `http://127.0.0.1:${port}/v1`, model: 'stable-mock' }, 'local-test-key', 120_000, (event) => events.push(event))
    assert.match(answer, /STABLE_MOCK_OK/)
    assert.equal(requests[0].url, '/v1/chat/completions')
    assert.equal(requests[0].authorization, 'Bearer local-test-key')
    assert.match(requests[0].body, /LONG_PROMPT_END/)
    assert.doesNotMatch(answer, /local-test-key/)
    assert.ok(events.some((event) => event.kind === 'reasoning' && event.status === 'running'), 'Harness step/start should stream a reasoning summary')
    assert.ok(events.some((event) => event.kind === 'reasoning' && event.status === 'completed'), 'assistant/message should complete the reasoning summary')
    assert.ok(events.every((event) => !JSON.stringify(event).includes('本地资料片段')), 'trace events must not leak prompt content')
    process.stdout.write(`HARNESS_INTEGRATION_PASS requests=${requests.length} events=${events.length}\n`)
  } finally {
    runner.cancel()
    await new Promise((resolve) => server.close(resolve))
    rmSync(root, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
