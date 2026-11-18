'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SDK_VERSION, CLI_VERSION, loadClaudeSDK, assertClaudeRuntimeVersion } = require('../desktop/services/claude-runtime-loader.cjs')

const root = path.resolve(__dirname, '..')
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const versionEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:SystemRoot|windir|PATH|TEMP|TMP)$/i.test(key)))

test('declared, locked, installed SDK and native package form the supported deployment pair', () => {
  const manifest = readJSON(path.join(root, 'package.json'))
  const lock = readJSON(path.join(root, 'package-lock.json'))
  const sdk = readJSON(path.join(path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk')), 'package.json'))
  const nativeName = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const native = readJSON(path.join(path.dirname(require.resolve(`${nativeName}/${binary}`)), 'package.json'))
  assert.equal(manifest.dependencies['@anthropic-ai/claude-agent-sdk'], SDK_VERSION)
  assert.equal(lock.packages[''].dependencies['@anthropic-ai/claude-agent-sdk'], SDK_VERSION)
  assert.equal(lock.packages['node_modules/@anthropic-ai/claude-agent-sdk'].version, SDK_VERSION)
  assert.equal(sdk.version, SDK_VERSION)
  assert.equal(sdk.optionalDependencies[nativeName], SDK_VERSION)
  assert.equal(lock.packages[`node_modules/${nativeName}`].version, SDK_VERSION)
  assert.equal(native.version, SDK_VERSION)
})

test('installed SDK exposes the interfaces used by Stable', async () => {
  const sdk = await loadClaudeSDK()
  assert.equal(typeof sdk.query, 'function')
  assert.equal(typeof sdk.tool, 'function')
  assert.equal(typeof sdk.createSdkMcpServer, 'function')
})

test('the Windows packaging resource is the installed supported native CLI', { skip: process.platform !== 'win32' || process.arch !== 'x64', timeout: 30000 }, () => {
  const manifest = readJSON(path.join(root, 'package.json'))
  const resource = manifest.build.extraResources.find(entry => entry.to === 'claude/claude.exe')
  assert.ok(resource, 'the packaged app must receive a native CLI outside app.asar')
  const source = path.resolve(root, resource.from)
  assert.equal(source, require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'))
  const result = spawnSync(source, ['--version'], { env: versionEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 20000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const reported = result.stdout.trim().match(/^(\d+\.\d+\.\d+)(?:\s|$)/)?.[1]
  assert.equal(assertClaudeRuntimeVersion(reported), CLI_VERSION)
})

test('Electron can import and validate the SDK in its actual embedded Node runtime', { timeout: 30000 }, () => {
  const executable = require('electron')
  const loader = path.join(root, 'desktop/services/claude-runtime-loader.cjs')
  const script = `require(${JSON.stringify(loader)}).loadClaudeSDK().then(sdk => { process.stdout.write(JSON.stringify({electron:process.versions.electron,node:process.versions.node,query:typeof sdk.query,tool:typeof sdk.tool,mcp:typeof sdk.createSdkMcpServer})); process.exit(0) }, error => { console.error(error.code || error.message); process.exit(1) })`
  const result = spawnSync(executable, ['-e', script], { cwd: root, env: { ...versionEnvironment(), ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 20000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.ok(output.electron, 'must exercise Electron rather than the system Node binary')
  assert.deepEqual([output.query, output.tool, output.mcp], ['function', 'function', 'function'])
})
