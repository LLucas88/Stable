'use strict'

// Real bundled Codex + loopback HTTP target + deterministic model responses.
// No CRM login, remote API, or paid model is used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { CodexHarnessRunner, sessionDirectory } = require('../desktop/services/codex-harness.cjs')

async function main() {
  const root = path.resolve(__dirname, '../qa-artifacts/codex-network', String(Date.now()))
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace, { recursive: true })
  let hits = 0
  const server = http.createServer((_req, res) => { hits++; res.end('STABLE_NETWORK_OK') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/probe`
  const results = []
  try {
    for (const permissionMode of ['full', 'request', 'full', 'request']) {
      let issued = false
      const outputs = []
      const before = hits
      const runner = new CodexHarnessRunner({ userData: root, workspace,
        environment: { ...process.env, PATH: `${process.env.SystemRoot || 'C:\\Windows'}\\System32;${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0` },
        fetchImpl: async (_url, options) => {
          const body = JSON.parse(options.body)
          let delta; let finish
          if (!issued) {
            issued = true
            const tool = body.tools.find((item) => item.function.name === 'shell_command')
            assert.ok(tool, 'Bundled Codex must expose shell_command')
            // Match the bundled CRM CLI's urllib transport. PowerShell 5's
            // web cmdlets do not honor the same proxy environment variables.
            const python = path.resolve(__dirname, '../vendor/wending-cli/python/python.exe').replace(/'/g, "''")
            const command = `& '${python}' -B -c 'import sys, urllib.request; print(urllib.request.urlopen(sys.argv[1], timeout=3).read().decode())' '${url}'`
            delta = { tool_calls: [{ index: 0, id: `probe_${results.length}`, type: 'function', function: { name: tool.function.name, arguments: JSON.stringify({ command, workdir: workspace, login: false, timeout_ms: 10000 }) } }] }
            finish = 'tool_calls'
          } else {
            outputs.push(...body.messages.filter((item) => item.role === 'tool').map((item) => item.content))
            delta = { content: 'PROBE_COMPLETE' }; finish = 'stop'
          }
          return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
        },
      })
      // Approve only the exact loopback probe command. No sandbox escape is requested.
      await runner.run('Run the local connectivity probe once.', { id: 'mock', providerId: 'mock', model: 'mock', baseURL: 'https://unused.invalid/v1' }, 'local-test-only', 90000,
        (event) => {
          if (event.eventType === 'approval/request' && event.status === 'running') {
            assert.ok(event.toolName.includes(url), `Unexpected approval: ${event.toolName}`)
            runner.answerApproval(event.requestId, true)
          }
        }, 'workspace-write', [], { key: 'network-probe', permissionMode })
      const reached = hits > before
      // Loopback may remain reachable under Windows' restricted networking.
      // Verify revocation from the real runtime's applied turn context, rather
      // than treating a localhost probe as proof of external network isolation.
      const contexts = []
      function readContexts(directory) {
        for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, item.name)
          if (item.isDirectory()) readContexts(file)
          else if (item.name.endsWith('.jsonl')) {
            for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
              const event = JSON.parse(line)
              if (event.type === 'turn_context') contexts.push(event)
            }
          }
        }
      }
      readContexts(sessionDirectory(root, 'network-probe'))
      const policy = contexts.at(-1)?.payload.sandbox_policy
      assert.equal(policy?.type, 'workspace-write')
      assert.equal(policy.network_access, permissionMode === 'full')
      results.push({ permissionMode, reached, policy, outputs })
      console.log(JSON.stringify({ permissionMode, reached, networkAccess: policy.network_access }))
      fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(results, null, 2))
      if (permissionMode === 'full') assert.equal(reached, true, JSON.stringify(results.at(-1)))
      if (reached) assert.ok(outputs.some((output) => output.includes('STABLE_NETWORK_OK')))
    }
    console.log(JSON.stringify({ passed: true, results: results.map(({ permissionMode, reached, policy }) => ({ permissionMode, reached, networkAccess: policy.network_access })), root }, null, 2))
  } finally { await new Promise((resolve) => server.close(resolve)) }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
