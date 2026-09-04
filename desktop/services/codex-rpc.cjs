'use strict'

const { spawn, spawnSync } = require('node:child_process')
const { StringDecoder } = require('node:string_decoder')

class CodexRpc {
  constructor({ executable, args = [], cwd, env, spawnImpl = spawn, onNotification = () => {}, onRequest = () => {}, onClose = () => {} }) {
    this.pending = new Map(); this.nextId = 1; this.closed = false; this.stderr = ''
    this.child = spawnImpl(executable, [...args, 'app-server', '--listen', 'stdio://'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const decoder = new StringDecoder('utf8'); let buffer = ''
    this.child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk)
      if (buffer.length > 32 * 1024 * 1024) { this.fail(new Error('Codex 事件超过大小限制。')); this.close(); return }
      let end
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
        if (!line) continue
        try {
          const message = JSON.parse(line)
          if (message.method) {
            if (message.id !== undefined) onRequest(message)
            else onNotification(message)
          } else {
            const pending = this.pending.get(message.id)
            if (!pending) continue
            clearTimeout(pending.timer); this.pending.delete(message.id)
            if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code }))
            else pending.resolve(message.result)
          }
        } catch (error) { this.fail(new Error(`Codex 通信失败：${error.message}`)); this.close(); return }
      }
    })
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk.toString('utf8')).slice(-16_000) })
    this.child.stdin.on('error', (error) => this.fail(error))
    this.child.on('error', (error) => { this.fail(error); onClose(error) })
    this.child.on('close', (code) => {
      const error = new Error(`Codex 运行时已退出（${code ?? 'unknown'}）。${this.stderr ? `\n${this.stderr}` : ''}`)
      this.closed = true; this.fail(error); onClose(error)
    })
  }
  send(message) { if (this.closed) throw new Error('Codex 连接已关闭。'); this.child.stdin.write(`${JSON.stringify(message)}\n`) }
  request(method, params = {}, timeoutMs = 60_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  reply(id, result) { this.send({ id, result }) }
  fail(error) { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error) }; this.pending.clear() }
  close({ terminate = false } = {}) {
    if (this.closePromise) return this.closePromise
    if (this.closed) return Promise.resolve()
    this.closed = true; this.fail(new Error('Codex 连接已关闭。'))
    const child = this.child
    this.closePromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.pid) {
          if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          else child.kill('SIGKILL')
        }
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); resolve()
      }, 2000)
      child.once('close', () => { clearTimeout(timer); resolve() })
      if (terminate && child.pid && child.exitCode === null) {
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        else child.kill('SIGKILL')
      } else child.stdin.end()
    })
    return this.closePromise
  }
}

module.exports = { CodexRpc }
