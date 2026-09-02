'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { pathToFileURL } = require('node:url')
const YAML = require('yaml')
const {
  HarnessRunner, STDIN_BRIDGE, ZHIPU_SEARCH_ENDPOINT, ZHIPU_SEARCH_PROVIDER_ID,
  buildHarnessEnvironment, cleanupHarnessRunDirectory, createZhipuSearchProvider, mapZhipuSearchResponse,
} = require('../desktop/services/harness.cjs')

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
  assert.match(STDIN_BRIDGE, /attachments\.saveImage/)
  assert.match(STDIN_BRIDGE, /type:'image'/)
  assert.match(STDIN_BRIDGE, /assistant\/chunk/)
  assert.match(STDIN_BRIDGE, /agent\/answer-delta/)
  assert.match(STDIN_BRIDGE, /!parentSessionId/)
  assert.match(STDIN_BRIDGE, /zhipu-official/)
  assert.match(STDIN_BRIDGE, /STABLE_ZHIPU_SEARCH_API_KEY/)
  assert.match(STDIN_BRIDGE, /search_result/)
  assert.match(STDIN_BRIDGE, /WebRuntime\.prototype\.search/)
  assert.doesNotMatch(STDIN_BRIDGE, /registerSearchProvider\(createZhipuSearchProvider/)
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
    assert.deepEqual(value['llm-pi-ai'].providers['private-gateway'].models[0].input, ['text', 'image'])
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
  const stdinInputs = []
  function fakeSpawn(_command, _arguments, options) {
    const child = new EventEmitter()
    child.pid = 10_000 + children.length
    child.killed = false
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new PassThrough()
    const inputIndex = stdinInputs.push('') - 1
    child.stdin.on('data', (chunk) => { stdinInputs[inputIndex] += chunk.toString('utf8') })
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
    const second = runnerB.run('second', privateModel, 'private-secret', 0, () => {}, 'read-only', [{ path: path.join(root, 'workspace-b', 'image.png'), mediaType: 'image/png', name: 'image.png' }])
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
    assert.deepEqual(YAML.parse(firstRaw)['llm-pi-ai'].providers.deepseek.models[0].input, ['text'])
    assert.deepEqual(YAML.parse(secondRaw)['llm-pi-ai'].providers['private-gateway'].models[0].input, ['text', 'image'])
    assert.equal(readFileSync(path.join(firstHome, 'settings.yaml'), 'utf8'), firstRaw)
    assert.doesNotMatch(`${firstRaw}\n${secondRaw}`, /deepseek-secret|private-secret/)

    children[0].stdout.write('FIRST_OK')
    children[0].emit('close', 0, null)
    children[1].stdout.write('SECOND_OK')
    children[1].emit('close', 0, null)
    assert.deepEqual(await Promise.all([first, second]), ['FIRST_OK', 'SECOND_OK'])
    assert.deepEqual(JSON.parse(stdinInputs[0]), { prompt: 'first', images: [] })
    assert.deepEqual(JSON.parse(stdinInputs[1]), { prompt: 'second', images: [{ path: path.join(root, 'workspace-b', 'image.png'), mediaType: 'image/png', name: 'image.png' }] })
    assert.equal(existsSync(firstHome), false)
    assert.equal(existsSync(secondHome), false)
  } finally {
    for (const child of children) child.removeAllListeners()
    rmSync(root, { recursive: true, force: true })
  }
})

test('DeepSeek routes reject image input before starting the runtime', () => {
  const runner = new HarnessRunner({ userData: os.tmpdir(), workspace: os.tmpdir(), packaged: false, resourcesPath: os.tmpdir() })
  const model = { id: 'deepseek-chat', providerId: 'stable-cloud', displayName: 'DeepSeek Chat', baseURL: 'https://example.test/v1', model: 'deepseek-chat' }
  assert.throws(
    () => runner.run('分析图片', model, 'secret', 0, () => {}, 'workspace-write', [{ path: 'image.png', mediaType: 'image/png', name: 'image.png' }]),
    /DeepSeek 暂不支持图片分析，请切换其他模型/,
  )
})

test('bundled Harness sends a workspace image as real multimodal request content', { skip: process.platform !== 'win32' }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-harness-image-'))
  const mockEntry = path.join(__dirname, '..', 'runtime', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-llm-mock-server', 'lib', 'index.js')
  const { startMockLlmServer } = await import(pathToFileURL(mockEntry).href)
  const server = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText: 'IMAGE_OK', apiKey: 'vision-secret' })
  try {
    const workspace = path.join(root, 'workspace')
    const imagePath = path.join(workspace, 'pixel.png')
    mkdirSync(workspace)
    writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    const runner = new HarnessRunner({ userData: root, workspace, packaged: false, resourcesPath: root, environment: {} })
    const answer = await runner.run(
      '请分析这张图片。',
      { id: 'vision-probe', providerId: 'vision-probe', displayName: 'Vision Probe', baseURL: `${server.baseURL}/v1`, model: 'vision-probe' },
      'vision-secret', 60_000, () => {}, 'read-only',
      [{ path: imagePath, mediaType: 'image/png', name: 'pixel.png' }],
    )
    assert.equal(answer, 'IMAGE_OK')
    assert.ok(server.requests.length >= 1)
    assert.ok(server.requests.some((request) => /data:image\/png;base64,/.test(JSON.stringify(request.body))))
  } finally {
    await server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('model runs select the matching official web search provider without persisting another credential', () => {
  const common = { approvalDir: 'approvals', dshHome: 'home', agentsHome: 'agents' }
  const deepSeekEnvironment = buildHarnessEnvironment({
    ...common, baseEnvironment: { STABLE_ZHIPU_SEARCH_API_KEY: 'stale-zhipu-key' },
    model: { providerId: 'deepseek', model: 'deepseek-v4-flash' }, apiKey: 'deepseek-model-key',
  })
  assert.equal(deepSeekEnvironment.DEEPSEEK_API_KEY, 'deepseek-model-key')
  assert.equal(deepSeekEnvironment.DSH_WEB_SEARCH_PROVIDER, 'deepseek-official')
  assert.equal(deepSeekEnvironment.STABLE_ZHIPU_SEARCH_API_KEY, undefined)

  const zhipuEnvironment = buildHarnessEnvironment({
    ...common, baseEnvironment: { DEEPSEEK_API_KEY: 'dedicated-search-key' },
    model: { providerId: 'zhipu', displayName: 'GLM 5.3 Flash', model: 'glm-5.3-flash' }, apiKey: 'zhipu-model-key',
  })
  assert.equal(zhipuEnvironment.STABLE_API_KEY, 'zhipu-model-key')
  assert.equal(zhipuEnvironment.STABLE_ZHIPU_SEARCH_API_KEY, 'zhipu-model-key')
  assert.equal(zhipuEnvironment.DSH_WEB_SEARCH_PROVIDER, ZHIPU_SEARCH_PROVIDER_ID)
  assert.equal(zhipuEnvironment.DEEPSEEK_API_KEY, 'dedicated-search-key')

  const cloudEnvironment = buildHarnessEnvironment({
    ...common, baseEnvironment: {},
    model: { providerId: 'stable-cloud', model: 'glm-5.3-flash' }, apiKey: 'local-loopback-secret',
  })
  assert.equal(cloudEnvironment.STABLE_ZHIPU_SEARCH_API_KEY, undefined)
  assert.equal(cloudEnvironment.DSH_WEB_SEARCH_PROVIDER, undefined)

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

test('Zhipu search provider calls the official endpoint and normalizes citeable sources', async () => {
  class TestWebError extends Error {
    constructor(message, code, options) { super(message); this.code = code; this.cause = options?.cause }
  }
  const requests = []
  const provider = createZhipuSearchProvider({
    apiKey: 'zhipu-secret',
    WebError: TestWebError,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            search_result: [
              { title: 'Result A', content: 'Summary A', link: 'https://example.com/a', publish_date: '2026-09-02' },
              { title: 'Duplicate', content: 'Duplicate', link: 'https://example.com/a' },
              { title: 'Unsafe', content: 'Skip', link: 'file:///tmp/private' },
              { title: 'Result B', link: 'http://example.org/b' },
            ],
          }
        },
      }
    },
  })

  assert.equal(provider.id, ZHIPU_SEARCH_PROVIDER_ID)
  assert.equal(provider.available(), true)
  const result = await provider.search({ query: 'a'.repeat(100), maxResults: 99 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, ZHIPU_SEARCH_ENDPOINT)
  assert.equal(requests[0].options.headers.authorization, 'Bearer zhipu-secret')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    search_query: 'a'.repeat(70), search_engine: 'search_std', search_intent: false,
    count: 50, search_recency_filter: 'noLimit', content_size: 'medium',
  })
  assert.deepEqual(result, {
    sources: [
      { url: 'https://example.com/a', title: 'Result A', snippet: 'Summary A', publishedAt: '2026-09-02' },
      { url: 'http://example.org/b', title: 'Result B' },
    ],
    truncated: false,
  })
  assert.deepEqual(mapZhipuSearchResponse({ search_result: [] }), { sources: [], truncated: false })
})

test('Zhipu search provider enforces the Harness result bound even when the API over-returns', async () => {
  class TestWebError extends Error {
    constructor(message, code) { super(message); this.code = code }
  }
  const provider = createZhipuSearchProvider({
    apiKey: 'zhipu-secret', WebError: TestWebError,
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ search_result: [1, 2, 3].map((index) => ({ title: `R${index}`, link: `https://example.com/${index}` })) }),
    }),
  })
  assert.deepEqual(await provider.search({ query: 'Stable', maxResults: 2 }), {
    sources: [
      { url: 'https://example.com/1', title: 'R1' },
      { url: 'https://example.com/2', title: 'R2' },
    ],
    truncated: true,
  })
})

test('Zhipu search provider exposes provider-safe HTTP errors without leaking credentials', async () => {
  class TestWebError extends Error {
    constructor(message, code) { super(message); this.code = code }
  }
  const provider = createZhipuSearchProvider({
    apiKey: 'never-leak-this-key', WebError: TestWebError,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'API key invalid' } }) }),
  })
  await assert.rejects(
    () => provider.search({ query: 'Stable' }),
    (error) => error.code === 'WEB_PROVIDER_ERROR' && /HTTP 401.*API key invalid/.test(error.message) && !error.message.includes('never-leak-this-key'),
  )
})
