'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')

const unknown = () => ({ phase: 'unknown', channel: '0', detail: '登录态尚未检查。' })
const phases = new Set(['unknown', 'signed_out', 'code_sent', 'choose_account', 'choose_brand', 'ready'])

// This bridge never routes requests through Agent runners, run_logs or shell arguments.
class WendingLoginBridge {
  constructor(options) {
    this.options = options
    this.state = unknown()
    this.child = undefined
    this.pending = undefined
    this.idleTimer = undefined
    this.nextSmsAt = 0
    this.generation = 0
  }

  snapshot() {
    return { ...this.state, retryAfter: Math.max(0, Math.ceil((this.nextSmsAt - Date.now()) / 1000)) }
  }

  error(code, message) {
    return { ...this.snapshot(), error: { code, message } }
  }

  start() {
    if (this.child) return
    const root = this.options.root()
    const child = (this.options.spawn || spawn)(path.join(root, 'python', 'python.exe'), ['-B', '-X', 'utf8', '-u', path.join(root, 'stable-login.py')], {
      cwd: this.options.workspace,
      env: this.options.environment(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      if (this.child !== child) return
      buffer += chunk.toString('utf8')
      if (buffer.length > 128_000) return this.dispose('INVALID_RESPONSE', '登录服务响应异常，请重新检查。')
      const end = buffer.indexOf('\n')
      if (end < 0) return
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      try {
        const value = JSON.parse(line)
        if (!phases.has(value.phase) || !['0', '1'].includes(value.channel) || typeof value.detail !== 'string') throw new Error()
        const state = { phase: value.phase, channel: value.channel, detail: value.detail.slice(0, 400) }
        for (const key of ['mobileHint', 'brandLabel']) if (typeof value[key] === 'string') state[key] = value[key].slice(0, 200)
        for (const key of ['accounts', 'brands']) {
          if (Array.isArray(value[key])) state[key] = value[key].filter((item) => item && /^[a-f0-9]{24}$/.test(item.id) && typeof item.label === 'string').map((item) => ({ id: item.id, label: item.label.slice(0, 200) }))
        }
        this.state = state
        const output = this.snapshot()
        if (value.error && typeof value.error.code === 'string' && typeof value.error.message === 'string') output.error = { code: value.error.code.slice(0, 60), message: value.error.message.slice(0, 400) }
        this.finish(output)
      } catch { this.dispose('INVALID_RESPONSE', '登录服务响应异常，请重新检查。') }
    })
    // Drain, but never log raw SDK errors/tracebacks or attach them to IPC errors.
    child.stderr.on('data', () => {})
    child.stdin.on('error', () => { if (this.child === child) this.dispose('CONNECTION_LOST', '登录进程连接已中断，请重新检查。') })
    child.once('error', () => { if (this.child === child) this.dispose('START_FAILED', '无法启动内置登录服务，请检查运行资源。') })
    child.once('close', () => { if (this.child === child) this.dispose('CONNECTION_LOST', '登录进程已退出，请重新检查。') })
  }

  finish(value) {
    const pending = this.pending
    this.pending = undefined
    if (pending) { clearTimeout(pending.timer); pending.resolve(value) }
    clearTimeout(this.idleTimer)
    if (this.child) {
      this.idleTimer = setTimeout(() => this.dispose(), this.options.idleTimeoutMs || 10 * 60_000)
      this.idleTimer.unref?.()
    }
  }

  async request(operation, payload = {}) {
    if (this.pending) return this.error('BUSY', '正在处理上一次登录操作，请稍候。')
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return this.error('INVALID_INPUT', '登录请求格式不正确。')
    let input = {}
    if (operation === 'send') {
      if (!['0', '1'].includes(payload.channel) || typeof payload.mobile !== 'string' || !/^1\d{10}$/.test(payload.mobile)) return this.error('INVALID_MOBILE', '请选择渠道并输入 11 位手机号。')
      if (this.nextSmsAt > Date.now()) return this.error('SMS_COOLDOWN', '请等待发送间隔结束，再确认发送验证码。')
      input = { channel: payload.channel, mobile: payload.mobile }
    } else if (operation === 'verify') {
      if (typeof payload.code !== 'string' || !/^\d{4,8}$/.test(payload.code)) return this.error('INVALID_CODE', '请输入 4 至 8 位数字验证码。')
      input = { code: payload.code }
    } else if (operation === 'account' || operation === 'brand') {
      if (typeof payload.id !== 'string' || !/^[a-f0-9]{24}$/.test(payload.id)) return this.error('INVALID_SELECTION', '请选择本次登录返回的选项。')
      input = { id: payload.id }
    } else if (!['check', 'reset', 'brands'].includes(operation)) return this.error('INVALID_OPERATION', '不支持的登录操作。')
    try { this.start() } catch { return this.error('START_FAILED', '无法启动内置登录服务，请检查运行资源。') }
    clearTimeout(this.idleTimer)
    // Do not retry SMS on uncertain network failures, including after cancel/reopen.
    if (operation === 'send') this.nextSmsAt = Date.now() + (this.options.smsIntervalMs ?? 60_000)
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.dispose('TIMEOUT', '登录请求超时，结果尚未确认。请重新检查，不会自动重发短信。'), this.options.timeoutMs || 45_000)
      this.pending = { resolve, timer }
      try { this.child.stdin.write(`${JSON.stringify({ operation, payload: input })}\n`) }
      catch { this.dispose('CONNECTION_LOST', '登录进程连接已中断，请重新检查。') }
    })
  }

  dispose(code, message) {
    this.generation++
    const child = this.child
    this.child = undefined
    clearTimeout(this.idleTimer)
    this.state = unknown()
    this.finish(code ? this.error(code, message) : this.snapshot())
    try { child?.kill() } catch {}
    return this.snapshot()
  }
}

function registerWendingLoginIpc(ipcMain, { service, isTrusted }) {
  const handle = (channel, action) => ipcMain.handle(channel, (event, payload) => {
    if (!isTrusted(event)) throw new Error('此页面无权访问登录接口。')
    return action(service(payload?.conversationId, channel), payload)
  })
  handle('stable:extensions:sendWendingCode', (cli, payload) => cli.login.request('send', payload))
  handle('stable:extensions:verifyWendingCode', (cli, payload) => cli.login.request('verify', payload))
  handle('stable:extensions:selectWendingAccount', (cli, payload) => cli.login.request('account', payload))
  handle('stable:extensions:selectWendingBrand', (cli, payload) => cli.login.request('brand', payload))
  handle('stable:extensions:refreshWendingBrands', (cli) => cli.login.request('brands'))
  handle('stable:extensions:resetWendingLogin', (cli) => cli.login.request('reset'))
  handle('stable:extensions:cancelWendingLogin', (cli) => cli.login.dispose())
}

module.exports = { WendingLoginBridge, registerWendingLoginIpc }
