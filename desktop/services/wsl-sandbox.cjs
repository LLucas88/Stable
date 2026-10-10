'use strict'

const path = require('node:path')
const { spawn } = require('node:child_process')
const { StringDecoder } = require('node:string_decoder')
const { randomUUID } = require('node:crypto')
const DISTRO = 'StableAgent'
const RUNNER = '/opt/stable-agent/runner.cjs'
const NODE = '/opt/stable-agent/node/bin/node'
const MAX_OUTPUT = 1_000_000

function linuxPath(value) {
  // Dedicated distro has fixed /mnt automounts. UNC, devices and drive roots
  // are intentionally unsupported; Windows canonicalization happens first.
  if (typeof value !== 'string' || !/^[a-z]:[\\/].+/i.test(value) || /[\0\r\n]/.test(value)) throw Error('WSL 沙箱仅支持本机盘符下的具体目录。')
  const normalized = path.win32.normalize(value)
  if (normalized === path.win32.parse(normalized).root || normalized.slice(2).includes(':')) throw Error('WSL 沙箱不允许盘符根目录或备用数据流。')
  return `/mnt/${normalized[0].toLowerCase()}${normalized.slice(2).replace(/\\/g, '/')}`
}
function commandEnvironment(base = process.env) {
  // WSLENV must never carry provider credentials or host PATH into Linux.
  const env = {}
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP']) if (base[key]) env[key] = base[key]
  env.WSLENV = ''
  env.WSL_UTF8 = '1'
  return env
}
function runWslCommand({ command, cwd, writableRoots, readableRoots, sandboxMode, networkAccess, timeoutMs = 60_000, signal, onOutput = () => {}, spawnImpl = spawn }) {
  if (signal?.aborted) return Promise.reject(Error('任务已停止。'))
  if (process.platform !== 'win32') return Promise.reject(Error('Stable WSL2 命令入口需要 Windows。'))
  const statusToken = randomUUID()
  const payload = { version: 1, command, cwd: linuxPath(cwd), writableRoots: writableRoots.map(linuxPath), readableRoots: readableRoots.map(linuxPath), readOnly: sandboxMode === 'read-only', networkAccess: sandboxMode !== 'read-only' && networkAccess === true, timeoutMs, statusToken }
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe')
  return new Promise((resolve, reject) => {
    let child, timer, killTimer, stopped, settled = false, output = '', stderr = '', pendingStderr = '', stage = -1
    const phases = [ ['prepare', '准备沙箱与工作区副本', 120_000], ['execute', '执行命令', timeoutMs + 5000], ['worker-cleanup', '清理命令进程', 30_000], ['sync', '校验并同步工作区文件', 120_000], ['cleanup', '清理沙箱', 30_000] ]
    function phase(name) {
      const next = phases.findIndex(item => item[0] === name)
      if (next <= stage || stopped || settled) return
      stage = next; clearTimeout(timer)
      const [, label, budget] = phases[next]
      onOutput('status', `WSL：${label}`)
      timer = setTimeout(() => stop(Error(`WSL ${label}阶段超过 ${budget} 毫秒，已停止等待。命令执行预算为 ${timeoutMs} 毫秒；${next >= 3 ? '文件可能已经写入，请先检查结果，勿盲目重试。' : '请检查该阶段的运行记录。'}`)), budget)
    }
    function stderrLine(line) {
      const match = line.trim().match(new RegExp('^@@STABLE_PHASE:' + statusToken + ':([a-z-]+)@@$'))
      if (match) { phase(match[1]); return }
      stderr = (stderr + line).slice(-MAX_OUTPUT)
      if (line) onOutput('stderr', line)
    }
    const decoders = {}, raw = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
    function finish(error, result) {
      if (settled) return
      settled = true; clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(result)
    }
    function stop(error) {
      if (stopped || settled) return
      stopped = error
      // EOF is a cancellation signal to the Linux supervisor. It kills the
      // sandbox process group; never terminate a whole distribution/task peer.
      child.stdin.end()
      killTimer = setTimeout(() => { child.kill(); finish(error) }, 5000)
    }
    const abort = () => stop(Error('任务已停止。'))
    try {
      child = spawnImpl(executable, ['--distribution', DISTRO, '--user', 'stable', '--exec', NODE, RUNNER], { env: commandEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      child.stdin.on('error', () => {})
      for (const stream of ['stdout', 'stderr']) child[stream].on('data', data => {
        // wsl.exe setup errors use UTF-16LE; Linux command output uses UTF-8.
        raw[stream] = Buffer.concat([raw[stream], data]).subarray(-MAX_OUTPUT)
        if (!decoders[stream]) decoders[stream] = new StringDecoder(data.includes(0) ? 'utf16le' : 'utf8')
        const value = decoders[stream].write(data)
        if (stream === 'stdout') { output = (output + value).slice(-MAX_OUTPUT); if (value) onOutput(stream, value) }
        else {
          pendingStderr = (pendingStderr + value).slice(-MAX_OUTPUT)
          let newline
          while ((newline = pendingStderr.indexOf('\n')) >= 0) { stderrLine(pendingStderr.slice(0, newline + 1)); pendingStderr = pendingStderr.slice(newline + 1) }
        }
      })
      child.on('error', error => finish(stopped || error))
      child.on('close', code => {
        output = (output + (decoders.stdout?.end() || '')).slice(-MAX_OUTPUT); stderrLine(pendingStderr + (decoders.stderr?.end() || '')); pendingStderr = ''
        if (code !== 0) {
          // The first chunk can end before an ASCII UTF-16 code unit occurs.
          for (const stream of ['stdout', 'stderr']) if (raw[stream].includes(Buffer.from('Wsl/', 'utf16le'))) {
            if (stream === 'stdout') output = raw[stream].toString('utf16le'); else stderr = raw[stream].toString('utf16le')
          }
        }
        const result = { code, output, stderr }
        const detail = [output && `标准输出：\n${output.slice(-4000)}`, stderr && `标准错误：\n${stderr.slice(-4000)}`].filter(Boolean).join('\n')
        const hint = /WSL_E_DISTRO_NOT_FOUND/.test(detail)
          ? 'StableAgent 命令沙箱尚未安装，命令未执行。请运行 npm run sandbox:setup；若安装器提示重启，请先重启 Windows 再运行安装。环境修复前不要重复尝试命令，可使用适用的 Stable 内置工具。'
          : /Wsl\//.test(detail) ? 'WSL2 沙箱启动失败，请检查 WSL 环境。' : '命令执行失败。'
        finish(stopped || (code !== 0 ? Object.assign(Error(`${hint}（退出码 ${code}）\n${detail}`), { result }) : null), result)
      })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      else { phase('prepare'); child.stdin.write(JSON.stringify(payload) + '\n') }
    } catch (error) { finish(error) }
  })
}
module.exports = { DISTRO, RUNNER, NODE, linuxPath, commandEnvironment, runWslCommand }
