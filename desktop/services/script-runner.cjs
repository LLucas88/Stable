'use strict'

const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const { StringDecoder } = require('node:string_decoder')

const ALLOWED_EXTENSIONS = new Set(['.py', '.ps1', '.cmd', '.bat'])
const MAX_OUTPUT = 1_000_000

function powershellInteractiveCommand(filePath) {
  const quotedPath = String(filePath).replace(/'/g, "''")
  return [
    'function global:Read-Host {',
    '  [CmdletBinding()] param([Parameter(Position=0)][object]$Prompt, [switch]$AsSecureString, [switch]$MaskInput)',
    "  if ($null -ne $Prompt) { [Console]::Out.Write(([string]$Prompt) + ': ') }",
    '  $value = [Console]::In.ReadLine()',
    '  if ($AsSecureString) { ConvertTo-SecureString $value -AsPlainText -Force } else { $value }',
    '}',
    `& '${quotedPath}'`,
    'if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE } elseif (-not $?) { exit 1 }',
  ].join('\n')
}

function commandFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('只允许执行 PY、PS1、CMD 或 BAT 脚本。')
  if (extension === '.py') return { command: process.env.STABLE_PYTHON || 'python.exe', args: [filePath] }
  if (extension === '.ps1') return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', powershellInteractiveCommand(filePath)] }
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', filePath] }
}

function scriptEnvironment() {
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) {
    if (/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)/i.test(key)) delete environment[key]
  }
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  delete environment.ELECTRON_RUN_AS_NODE
  return environment
}

function killProcessTree(child) {
  if (!child?.pid) return
  try { child.stdin?.end() } catch { /* stdin already closed */ }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
  } else {
    try { child.kill('SIGKILL') } catch { /* process already exited */ }
  }
  try { child.kill('SIGKILL') } catch { /* process already exited */ }
  child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); child.unref?.()
}

function childIsRunning(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return false
  try { process.kill(child.pid, 0); return true }
  catch (error) { return error?.code === 'EPERM' }
}

class ScriptRunner {
  constructor({ workspace, timeoutMs = 5 * 60_000 }) {
    this.workspace = workspace
    this.timeoutMs = timeoutMs
    this.child = null
    this.itemId = ''
    this.onEvent = null
    this.cancelRequested = false
  }

  release(child) {
    if (this.child !== child) return
    this.child = null
    this.itemId = ''
    this.onEvent = null
  }

  async run(item, onEvent = () => {}, options = {}) {
    if (this.child && !childIsRunning(this.child)) this.release(this.child)
    if (this.child) throw new Error('已有脚本正在执行，请等待完成或先停止。')
    const spec = commandFor(item.path)
    const timeoutMs = options.timeoutMs === 0 ? 0 : Number(options.timeoutMs || this.timeoutMs)
    const idleNoticeMs = Math.max(0, Number(options.idleNoticeMs || 0))
    this.cancelRequested = false
    return new Promise((resolve, reject) => {
      let settled = false
      let output = ''
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')
      let timer
      let idleTimer
      let exitTimer
      const scheduleIdleNotice = () => {
        clearTimeout(idleTimer)
        if (!idleNoticeMs) return
        idleTimer = setTimeout(() => onEvent({
          itemId: item.id,
          stream: 'status',
          chunk: '脚本已 5 分钟没有新输出，仍在等待。',
          status: 'waiting',
          time: Date.now(),
        }), idleNoticeMs)
      }
      const append = (stream, chunk) => {
        if (settled || !chunk) return
        output = `${output}${chunk}`.slice(-MAX_OUTPUT)
        onEvent({ itemId: item.id, stream, chunk, time: Date.now() })
        scheduleIdleNotice()
      }
      const finish = (error, result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(idleTimer)
        clearTimeout(exitTimer)
        this.release(child)
        if (error) reject(error); else resolve(result)
      }
      const complete = (code, signal) => {
        if (settled) return
        append('stdout', stdoutDecoder.end())
        append('stderr', stderrDecoder.end())
        if (this.cancelRequested) return finish(new Error('脚本已停止。'))
        if (code === 0) return finish(null, { code, signal, output })
        finish(new Error(`脚本执行失败（退出码 ${code ?? '未知'}）。${output.trim() ? `\n${output.slice(-4000)}` : ''}`))
      }
      const child = spawn(spec.command, spec.args, {
        cwd: path.dirname(item.path) || this.workspace,
        env: scriptEnvironment(),
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.child = child
      this.itemId = item.id
      this.onEvent = onEvent
      onEvent({ itemId: item.id, stream: 'status', chunk: '脚本已启动', status: 'running', time: Date.now() })
      scheduleIdleNotice()
      child.stdout.on('data', (chunk) => append('stdout', stdoutDecoder.write(chunk)))
      child.stderr.on('data', (chunk) => append('stderr', stderrDecoder.write(chunk)))
      child.stdin.on('error', (error) => {
        if (!settled && error.code !== 'EPIPE') finish(new Error(`无法向脚本发送输入：${error.message}`))
      })
      child.on('error', (error) => {
        const message = error.code === 'ENOENT' && path.extname(item.path).toLowerCase() === '.py'
          ? '未找到 Python。请先安装 Python，或通过 STABLE_PYTHON 指定解释器路径。'
          : `无法启动脚本：${error.message}`
        finish(new Error(message))
      })
      child.on('exit', (code, signal) => { exitTimer = setTimeout(() => complete(code, signal), 250); exitTimer.unref?.() })
      child.on('close', (code, signal) => complete(code, signal))
      if (timeoutMs > 0) timer = setTimeout(() => {
        killProcessTree(child)
        const timeoutMinutes = Math.max(1, Math.round(timeoutMs / 60_000))
        finish(new Error(`脚本执行超过 ${timeoutMinutes} 分钟，已自动停止。`))
      }, timeoutMs)
    })
  }

  async writeInput(itemId, value) {
    if (!this.child || !this.itemId) throw new Error('当前没有正在等待输入的脚本。')
    if (itemId !== this.itemId) throw new Error('当前输入不属于正在运行的脚本。')
    if (typeof value !== 'string') throw new Error('脚本输入无效。')
    if (value.length > 8_192) throw new Error('单次脚本输入不能超过 8,192 个字符。')
    if (!this.child.stdin || this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error('脚本已经停止接收输入。')
    const line = `${value.replace(/[\r\n]+$/g, '')}\r\n`
    await new Promise((resolve, reject) => {
      this.child.stdin.write(line, 'utf8', (error) => error ? reject(new Error(`发送输入失败：${error.message}`)) : resolve())
    })
    this.onEvent?.({
      itemId,
      stream: 'stdin',
      chunk: value ? `› ${value}\n` : '› [回车]\n',
      time: Date.now(),
    })
    return true
  }

  cancel() {
    if (!this.child) return false
    this.cancelRequested = true
    killProcessTree(this.child)
    return true
  }
}

module.exports = { ScriptRunner, commandFor, powershellInteractiveCommand, scriptEnvironment }
