'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const { ClaudeRuntimePreloader, createClaudeSDKLoader, assertClaudeRuntimeVersion, SDK_VERSION, CLI_VERSION } = require('../desktop/services/claude-runtime-loader.cjs')

const sdkFixture = () => ({ query() {}, tool() {}, createSdkMcpServer() {} })

test('default SDK contract loader shares one validated import without launching a process', async () => {
  let imports = 0, reads = 0
  const sdk = sdkFixture()
  const load = createClaudeSDKLoader({ readVersion: () => { reads++; return SDK_VERSION }, importSDK: async () => { imports++; return sdk } })
  const first = load(), second = load()
  assert.equal(first, second)
  assert.equal(await first, sdk)
  assert.equal(await load(), sdk)
  assert.equal(imports, 1); assert.equal(reads, 1)
})

test('an old SDK is rejected before import, and a repaired installation can retry', async () => {
  let version = '0.3.308', imports = 0
  const sdk = sdkFixture()
  const load = createClaudeSDKLoader({ readVersion: () => version, importSDK: async () => { imports++; return sdk } })
  await assert.rejects(load(), error => error.code === 'CLAUDE_SDK_VERSION_MISMATCH' && error.message.includes(version) && error.message.includes(SDK_VERSION))
  assert.equal(imports, 0)
  version = SDK_VERSION
  assert.equal(await load(), sdk)
  assert.equal(imports, 1)
})

test('SDK metadata failures keep their cause and do not poison future attempts', async () => {
  const cause = new SyntaxError('invalid package JSON')
  let fail = true
  const load = createClaudeSDKLoader({ readVersion: () => { if (fail) throw cause; return SDK_VERSION }, importSDK: async () => sdkFixture() })
  await assert.rejects(load(), error => error.code === 'CLAUDE_SDK_METADATA_UNAVAILABLE' && error.cause === cause)
  fail = false
  assert.equal(typeof (await load()).query, 'function')
})

test('incomplete SDK exports are diagnosed before agent creation, and corrected imports retry', async () => {
  let sdk = { query() {}, tool: 'not callable' }
  const load = createClaudeSDKLoader({ readVersion: () => SDK_VERSION, importSDK: async () => sdk })
  await assert.rejects(load(), error => error.code === 'CLAUDE_SDK_API_UNAVAILABLE' && error.message.includes('tool') && error.message.includes('createSdkMcpServer'))
  sdk = sdkFixture()
  assert.equal(await load(), sdk)
})

test('failed ESM import is retryable', async () => {
  let fail = true
  const cause = new Error('fixture ESM import failure')
  const load = createClaudeSDKLoader({ readVersion: () => SDK_VERSION, importSDK: async () => { if (fail) throw cause; return sdkFixture() } })
  await assert.rejects(load(), error => error === cause)
  fail = false
  assert.equal(typeof (await load()).query, 'function')
})

test('native CLI mismatch and missing version fail with a repairable diagnostic', () => {
  assert.equal(assertClaudeRuntimeVersion(CLI_VERSION), CLI_VERSION)
  for (const value of ['2.1.308', '2.1.319', undefined, '']) {
    assert.throws(() => assertClaudeRuntimeVersion(value), error => error.code === 'CLAUDE_CLI_VERSION_MISMATCH' && error.message.includes(CLI_VERSION))
  }
})

test('preload runs only a credential-free version check and shares one in-flight attempt', async () => {
  let loads = 0, calls = 0
  const child = new EventEmitter(); child.kill = () => child.emit('close', 1)
  const preloader = new ClaudeRuntimePreloader({ executable: __filename,
    environment: { Path: 'path', SystemRoot: 'system', TEMP: 'temp', ANTHROPIC_API_KEY: 'secret', STABLE_TOKEN: 'secret', HOME: 'account-home', NODE_OPTIONS: 'injected' },
    loadSDK: async () => { loads++ }, spawnImpl: (file, args, options) => {
      calls++; assert.equal(file, __filename); assert.deepEqual(args, ['--version'])
      assert.deepEqual(options.env, { Path: 'path', SystemRoot: 'system', TEMP: 'temp' }); assert.equal(options.windowsHide, true)
      return child
    },
  })
  const first = preloader.prepare(), second = preloader.prepare()
  assert.equal(first, second); await Promise.resolve(); child.emit('close', 0)
  assert.equal(await first, true); assert.equal(await preloader.prepare(), true)
  assert.equal(loads, 1); assert.equal(calls, 1)
})

test('closing during module load prevents a background child from starting', async () => {
  let release; const loaded = new Promise(resolve => { release = resolve })
  const preloader = new ClaudeRuntimePreloader({ executable: __filename, loadSDK: () => loaded, spawnImpl: () => { throw Error('must not spawn after close') } })
  const pending = preloader.prepare(); preloader.close(); release()
  assert.equal(await pending, false)
})

test('runtime load and launch errors never prevent the independent cold start path', async () => {
  for (const loadFails of [false, true]) {
    const preloader = new ClaudeRuntimePreloader({ executable: __filename,
      loadSDK: async () => { if (loadFails) throw Error('missing module') },
      spawnImpl: () => { throw Error('blocked executable') },
    })
    assert.equal(await preloader.prepare(), false)
  }
})

test('shutdown reaps only the owned version process, and busy desktops skip preload', async () => {
  const child = new EventEmitter(); let kills = 0, loads = 0
  child.kill = () => { kills++; child.emit('close', 1) }
  const preloader = new ClaudeRuntimePreloader({ executable: __filename, loadSDK: async () => { loads++ }, spawnImpl: () => child })
  preloader.schedule(() => true, 1)
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(loads, 0)
  const pending = preloader.prepare(); await Promise.resolve(); preloader.close()
  assert.equal(await pending, false); assert.equal(kills, 1)
})
