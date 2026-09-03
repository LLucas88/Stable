const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HarnessRunner } = require('../desktop/services/harness.cjs')

test('real Harness steering keeps the PID and session and reaches the next model request', { timeout: 45_000 }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-native-steer-'))
  const requests = []; const sessions = new Set(); const events = []
  let firstResponse
  let notifyRequest
  const firstRequest = new Promise((resolve) => { notifyRequest = resolve })
  const chunk = (response, content, finish = false) => response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: finish ? 'stop' : null }], ...(finish ? { usage: { prompt_tokens: 10, completion_tokens: 4 } } : {}) })}\n\n`)
  const finish = (response, text) => { chunk(response, text); chunk(response, '', true); response.end('data: [DONE]\n\n') }
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const part of request) chunks.push(part)
    if (!request.url.endsWith('/chat/completions')) { response.writeHead(404); response.end(); return }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    if (!body.tools?.length) { finish(response, 'Test session title'); return }
    requests.push(body)
    if (requests.length === 1) { firstResponse = response; chunk(response, 'First step.'); notifyRequest() }
    else finish(response, 'STEER_OK')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const runner = new HarnessRunner({ userData: root, workspace: root, packaged: false, environment: {} })
  let running
  try {
    running = runner.run('ORIGINAL_TASK: Say ready.', { providerId: 'local-steer-test', model: 'local-steer-test', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, 'test-only', 25_000, (event) => { events.push(event); if (event.sessionId && !event.parentSessionId) sessions.add(event.sessionId) }, 'read-only')
    await Promise.race([firstRequest, running.then(() => { throw new Error('Ended before first request') })])
    const pid = runner.child.pid
    assert.equal(runner.steerReady, true)
    await assert.rejects(runner.steer('invalid image', [{ path: path.join(root, '..', 'outside.png'), mediaType: 'image/png', name: 'outside.png' }]), /工作区|workspace/)
    const image = path.join(root, 'steer.png')
    writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    assert.equal(await runner.steer('NEW_DIRECTION: Reply STEER_OK instead.', [{ path: image, mediaType: 'image/png', name: 'steer.png' }]), true)
    assert.equal(runner.child.pid, pid)
    assert.equal(requests.length, 1, 'the current request was not interrupted')
    finish(firstResponse, ' Done.')
    assert.equal(await running, 'STEER_OK')
    assert.equal(requests.length, 2)
    assert.match(JSON.stringify(requests[1].messages), /ORIGINAL_TASK/)
    assert.match(JSON.stringify(requests[1].messages), /NEW_DIRECTION/)
    assert.match(JSON.stringify(requests[1].messages), /data:image\/png;base64,/)
    assert.doesNotMatch(JSON.stringify(requests[1].messages), /invalid image/)
    assert.equal(sessions.size, 1)
    await assert.rejects(runner.steer('too late'), /保留在队列/)
  } catch (error) {
    console.error({ requests: requests.length, events, pid: runner.child?.pid, error: error.message, root })
    throw error
  } finally {
    if (firstResponse && !firstResponse.writableEnded) finish(firstResponse, ' Test cleanup.')
    server.closeAllConnections()
    runner.cancel(); if (running) await running.catch(() => {})
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve))
    try { rmSync(root, { recursive: true, force: true }) } catch { /* retain locked test artifacts without masking the actual failure */ }
  }
})
