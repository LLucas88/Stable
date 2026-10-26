'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const { ClaudeRuntimePreloader } = require('../desktop/services/claude-runtime-loader.cjs')

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
