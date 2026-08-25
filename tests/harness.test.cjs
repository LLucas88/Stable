'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const YAML = require('yaml')
const { HarnessRunner, STDIN_BRIDGE } = require('../desktop/services/harness.cjs')

test('headless bridge is valid module code and namespaces child events by session', () => {
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: STDIN_BRIDGE, encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stderr)
  assert.match(STDIN_BRIDGE, /parentSessionId/)
  assert.match(STDIN_BRIDGE, /subagent\/descriptor/)
  assert.match(STDIN_BRIDGE, /`\$\{sessionId\}:tool:/)
  assert.match(STDIN_BRIDGE, /ApprovalService\.prototype\.decide/)
  assert.match(STDIN_BRIDGE, /STABLE_APPROVAL_DIR/)
  assert.match(STDIN_BRIDGE, /kind:'approval'/)
  assert.match(STDIN_BRIDGE, /write\|edit\|replace\|patch/)
  assert.match(readFileSync(path.join(__dirname, '..', 'desktop', 'services', 'harness.cjs'), 'utf8'), /HARNESS_MAX_TOKENS/)
})

test('conversation harness has no default execution deadline while explicit safety deadlines remain available', () => {
  const source = readFileSync(path.join(__dirname, '..', 'desktop', 'services', 'harness.cjs'), 'utf8')
  assert.match(source, /run\(prompt, model, apiKey, timeoutMs = 0, onEvent/)
  assert.match(source, /const timer = timeoutMs > 0/)
  assert.match(source, /if \(timer\) clearTimeout\(timer\)/)
})

test('source harness discovers the runtime bundled beside the source tree', () => {
  const runner = new HarnessRunner({ userData: os.tmpdir(), workspace: os.tmpdir(), packaged: false, resourcesPath: os.tmpdir() })
  const paths = runner.runtimePaths()
  assert.match(paths.node, /runtime[\\/]node[\\/]node\.exe$/i)
  assert.match(paths.cli, /runtime[\\/]dsh[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/i)
  assert.equal(runner.ready(), true)
})

test('harness config stores only an environment reference, never the API key', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-harness-'))
  const runner = new HarnessRunner({ userData: root, workspace: path.join(root, 'workspace'), packaged: false, resourcesPath: root })
  try {
    const home = runner.writeSettings({ providerId: 'private-gateway', displayName: 'Private Gateway', baseURL: 'https://gateway.example/v1', model: 'agent-model' })
    const raw = readFileSync(path.join(home, 'settings.yaml'), 'utf8')
    const value = YAML.parse(raw)
    assert.equal(value['agent-default-model'].provider, 'private-gateway')
    assert.equal(value['llm-pi-ai'].providers['private-gateway'].apiKeyEnv, 'STABLE_API_KEY')
    assert.equal(value['tool-subagent'].maxDepth, 0)
    assert.doesNotMatch(raw, /secret-value/)
    assert.equal(value['tool-subagent-fork'].maxDepth, 0)
    assert.equal(value['agent-loop'], undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
