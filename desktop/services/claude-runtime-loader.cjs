'use strict'

const fs = require('node:fs')
const { spawn } = require('node:child_process')

let sdkPromise
function loadClaudeSDK() {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk').catch(error => { sdkPromise = null; throw error })
  return sdkPromise
}

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

module.exports = { loadClaudeSDK, ClaudeRuntimePreloader }
