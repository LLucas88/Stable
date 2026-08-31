'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const YAML = require('yaml')
const { HarnessRunner, STDIN_BRIDGE, buildHarnessEnvironment, cleanupHarnessRunDirectory } = require('../desktop/services/harness.cjs')

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
  assert.match(source, /STABLE_API_KEY: apiKey/)
})

test('Electron cleanup removes Harness homes without following Runtime junctions', { skip: process.platform !== 'win32' }, () => {
  const electronPath = require('electron')
  const harnessPath = path.join(__dirname, '..', 'desktop', 'services', 'harness.cjs')
  const probe = `
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const { cleanupHarnessRunDirectory } = require(${JSON.stringify(harnessPath)})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-electron-cleanup-'))
    const runsRoot = path.join(root, 'harness', 'runs')
    const home = path.join(runsRoot, 'run-probe')
    const externalHome = path.join(root, 'outside', 'runs', 'run-probe')
    const runtime = path.join(root, 'runtime')
    const targets = [path.join(runtime, 'plain-package'), path.join(runtime, 'scoped-package')]
    let result
    try {
      for (const target of targets) {
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(path.join(target, 'sentinel.txt'), 'keep')
      }
      const plainLink = path.join(home, 'profiles', 'node_modules', 'plain-package')
      const scopedLink = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'scoped-package')
      fs.mkdirSync(path.dirname(plainLink), { recursive: true })
      fs.mkdirSync(path.dirname(scopedLink), { recursive: true })
      fs.symlinkSync(targets[0], plainLink, 'junction')
      fs.symlinkSync(targets[1], scopedLink, 'junction')
      fs.writeFileSync(path.join(home, 'settings.yaml'), 'safe: true')
      fs.mkdirSync(externalHome, { recursive: true })
      fs.writeFileSync(path.join(externalHome, 'sentinel.txt'), 'keep')
      let externalRejected = false
      try { cleanupHarnessRunDirectory(externalHome, runsRoot) }
      catch { externalRejected = true }
      cleanupHarnessRunDirectory(home, runsRoot)
      result = {
        electron: process.versions.electron,
        homeExists: fs.existsSync(home),
        sentinels: targets.map((target) => fs.existsSync(path.join(target, 'sentinel.txt'))),
        externalRejected,
        externalSentinel: fs.existsSync(path.join(externalHome, 'sentinel.txt')),
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
    process.stdout.write(JSON.stringify(result))
  `
  const checked = spawnSync(electronPath, ['-e', probe], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  assert.equal(checked.status, 0, checked.stderr || checked.stdout)
  const result = JSON.parse(checked.stdout)
  assert.equal(result.homeExists, false)
  assert.deepEqual(result.sentinels, [true, true])
  assert.equal(result.externalRejected, true)
  assert.equal(result.externalSentinel, true)
  assert.ok(result.electron)
  assert.equal(typeof cleanupHarnessRunDirectory, 'function')
})

test('source harness discovers the runtime bundled beside the source tree', () => {
  const runner = new HarnessRunner({ userData: os.tmpdir(), workspace: os.tmpdir(), packaged: false, resourcesPath: os.tmpdir() })
  const paths = runner.runtimePaths()
  assert.match(paths.node, /runtime[\\/]node[\\/]node\.exe$/i)
  assert.match(paths.cli, /runtime[\\/]dsh[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/i)
  assert.equal(runner.ready(), true)
})

test('packaged harness prefers the persistent runtime used by lightweight updates', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-persistent-runtime-'))
  const previous = process.env.STABLE_RUNTIME_HOME
  const cli = path.join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const node = path.join(root, 'node', 'node.exe')
  mkdirSync(path.dirname(cli), { recursive: true })
  mkdirSync(path.dirname(node), { recursive: true })
  writeFileSync(cli, '', 'utf8')
  writeFileSync(node, '', 'utf8')
  process.env.STABLE_RUNTIME_HOME = root
  try {
    const runner = new HarnessRunner({ userData: root, workspace: root, packaged: true, resourcesPath: path.join(root, 'missing-resources') })
    assert.deepEqual(runner.runtimePaths(), { node, cli })
    assert.equal(runner.ready(), true)
  } finally {
    if (previous === undefined) delete process.env.STABLE_RUNTIME_HOME
    else process.env.STABLE_RUNTIME_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
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
    assert.equal(value['tool-subagent'].maxDepth, 3)
    assert.doesNotMatch(raw, /secret-value/)
    assert.equal(value['tool-subagent-fork'].maxDepth, 3)
    assert.equal(value['agent-loop'], undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('each harness run keeps its model settings and credentials isolated', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-harness-isolation-'))
  const runtime = { node: path.join(root, 'node.exe'), cli: path.join(root, 'bin.js') }
  writeFileSync(runtime.node, '')
  writeFileSync(runtime.cli, '')
  const starts = []
  const children = []
  function fakeSpawn(_command, _arguments, options) {
    const child = new EventEmitter()
    child.pid = 10_000 + children.length
    child.killed = false
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new PassThrough()
    children.push(child)
    starts.push(options)
    return child
  }
  const deepSeek = { id: 'deepseek-chat', providerId: 'deepseek', displayName: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' }
  const privateModel = { id: 'private-agent', providerId: 'private-gateway', displayName: 'Private Gateway', baseURL: 'https://gateway.example/v1', model: 'agent-model' }
  const runnerA = new HarnessRunner({ userData: root, workspace: path.join(root, 'workspace-a'), packaged: false, resourcesPath: root, environment: {}, spawn: fakeSpawn })
  const runnerB = new HarnessRunner({ userData: root, workspace: path.join(root, 'workspace-b'), packaged: false, resourcesPath: root, environment: {}, spawn: fakeSpawn })
  runnerA.runtimePaths = () => runtime
  runnerB.runtimePaths = () => runtime

  try {
    const first = runnerA.run('first', deepSeek, 'deepseek-secret')
    const second = runnerB.run('second', privateModel, 'private-secret', 0, () => {}, 'read-only')
    assert.equal(starts.length, 2)
    const firstHome = starts[0].env.DSH_HOME
    const secondHome = starts[1].env.DSH_HOME
    assert.notEqual(firstHome, secondHome)
    assert.equal(starts[0].env.STABLE_API_KEY, 'deepseek-secret')
    assert.equal(starts[0].env.DEEPSEEK_API_KEY, 'deepseek-secret')
    assert.equal(starts[1].env.STABLE_API_KEY, 'private-secret')
    assert.equal(starts[1].env.DEEPSEEK_API_KEY, undefined)
    assert.equal(starts[1].env.DSH_PERMISSION_MODE, 'read-only')

    const firstRaw = readFileSync(path.join(firstHome, 'settings.yaml'), 'utf8')
    const secondRaw = readFileSync(path.join(secondHome, 'settings.yaml'), 'utf8')
    assert.equal(YAML.parse(firstRaw)['agent-default-model'].provider, 'deepseek')
    assert.equal(YAML.parse(secondRaw)['agent-default-model'].provider, 'private-gateway')
    assert.equal(readFileSync(path.join(firstHome, 'settings.yaml'), 'utf8'), firstRaw)
    assert.doesNotMatch(`${firstRaw}\n${secondRaw}`, /deepseek-secret|private-secret/)

    children[0].stdout.write('FIRST_OK')
    children[0].emit('close', 0, null)
    children[1].stdout.write('SECOND_OK')
    children[1].emit('close', 0, null)
    assert.deepEqual(await Promise.all([first, second]), ['FIRST_OK', 'SECOND_OK'])
    assert.equal(existsSync(firstHome), false)
    assert.equal(existsSync(secondHome), false)
  } finally {
    for (const child of children) child.removeAllListeners()
    rmSync(root, { recursive: true, force: true })
  }
})

test('non-DeepSeek models preserve an existing search credential without aliasing their model key', () => {
  const common = { approvalDir: 'approvals', dshHome: 'home', agentsHome: 'agents' }
  const privateEnvironment = buildHarnessEnvironment({
    ...common,
    baseEnvironment: { DEEPSEEK_API_KEY: 'dedicated-search-key', NODE_OPTIONS: 'remove-me' },
    model: { providerId: 'private-gateway' }, apiKey: 'private-model-key',
  })
  assert.equal(privateEnvironment.STABLE_API_KEY, 'private-model-key')
  assert.equal(privateEnvironment.DEEPSEEK_API_KEY, 'dedicated-search-key')
  assert.equal(privateEnvironment.NODE_OPTIONS, undefined)

  const withoutSearchCredential = buildHarnessEnvironment({
    ...common, baseEnvironment: {}, model: { providerId: 'openai' }, apiKey: 'openai-model-key',
  })
  assert.equal(withoutSearchCredential.STABLE_API_KEY, 'openai-model-key')
  assert.equal(withoutSearchCredential.DEEPSEEK_API_KEY, undefined)
})
