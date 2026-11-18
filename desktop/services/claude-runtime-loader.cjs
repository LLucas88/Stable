'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const SDK_VERSION = '0.3.318'
const CLI_VERSION = '2.1.318'
const REQUIRED_SDK_EXPORTS = ['query', 'tool', 'createSdkMcpServer']

function runtimeError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}

// Keep the checks on the cached, default loader. Explicit SDK injection remains
// available for isolated tests, including old-session migration coverage.
function createClaudeSDKLoader({
  importSDK = () => import('@anthropic-ai/claude-agent-sdk'),
  readVersion = () => JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk')), 'package.json'), 'utf8')).version,
} = {}) {
  let pending
  return function load() {
    if (!pending) pending = Promise.resolve().then(async () => {
      let version
      try { version = readVersion() }
      catch (error) { throw runtimeError('CLAUDE_SDK_METADATA_UNAVAILABLE', '无法读取 Claude Agent SDK 的版本信息，请修复依赖或更新 Stable。', error) }
      if (version !== SDK_VERSION) throw runtimeError('CLAUDE_SDK_VERSION_MISMATCH', `Claude Agent SDK 版本不匹配：Stable 需要 ${SDK_VERSION}，实际为 ${version || '未知'}。请修复依赖或更新 Stable。`)
      const sdk = await importSDK()
      const missing = REQUIRED_SDK_EXPORTS.filter(name => typeof sdk?.[name] !== 'function')
      if (missing.length) throw runtimeError('CLAUDE_SDK_API_UNAVAILABLE', `Claude Agent SDK 运行时不完整，缺少接口：${missing.join('、')}。请修复依赖或更新 Stable。`)
      return sdk
    }).catch(error => { pending = null; throw error })
    return pending
  }
}

function assertClaudeRuntimeVersion(version) {
  if (version !== CLI_VERSION) throw runtimeError('CLAUDE_CLI_VERSION_MISMATCH', `Claude 运行时版本不匹配：SDK ${SDK_VERSION} 需要 Claude Code ${CLI_VERSION}，实际为 ${typeof version === 'string' && version ? version : '未返回版本'}。请更新完整的 Stable 运行时。`)
  return version
}

const loadClaudeSDK = createClaudeSDKLoader()

// Load immutable runtime code while the desktop is idle. No parked agent,
// account, session, tool server, hooks, prompt or permission grants are shared.
// --version exits without initializing a session or making a model request.
class ClaudeRuntimePreloader {
  constructor({ executable, loadSDK = loadClaudeSDK, spawnImpl = spawn, environment = process.env }) {
    this.executable = executable; this.loadSDK = loadSDK; this.spawn = spawnImpl; this.environment = environment
    this.closed = false; this.attempted = false
  }
  schedule(isBusy = () => false, delay = 1500) {
    if (this.closed || this.attempted || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (isBusy()) { this.schedule(isBusy); return }
      void this.prepare()
    }, delay)
    this.timer.unref?.()
  }
  prepare() {
    if (this.pending) return this.pending
    if (this.closed || this.attempted) return Promise.resolve(false)
    this.attempted = true
    this.pending = (async () => {
      try {
        await this.loadSDK()
        if (this.closed || !fs.existsSync(this.executable)) return false
        const env = Object.fromEntries(Object.entries(this.environment).filter(([key]) => /^(?:SystemRoot|windir|PATH|TEMP|TMP)$/i.test(key)))
        return await new Promise(resolve => {
          let settled = false
          const done = success => { if (settled) return; settled = true; clearTimeout(this.deadline); this.child = null; resolve(success) }
          try {
            const child = this.spawn(this.executable, ['--version'], { env, stdio: 'ignore', windowsHide: true })
            this.child = child
            child.once('error', () => done(false))
            child.once('close', code => done(code === 0))
            this.deadline = setTimeout(() => { child.kill(); done(false) }, 10000)
            this.deadline.unref?.()
          } catch { done(false) }
        })
      } catch { return false } // Cold-start remains available if preload fails.
    })()
    return this.pending
  }
  close() {
    this.closed = true; clearTimeout(this.timer); this.timer = null
    this.child?.kill()
  }
}

module.exports = { loadClaudeSDK, createClaudeSDKLoader, assertClaudeRuntimeVersion, SDK_VERSION, CLI_VERSION, ClaudeRuntimePreloader }
