'use strict'

// A fixed Windows CLI entrypoint for the bundled business service. No shell,
// executable path, Python source or environment supplied by the model is used.
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { StringDecoder } = require('node:string_decoder')
function validateArguments(args) {
  if (!Array.isArray(args) || !args.length || args.length > 100 || args.some(arg => typeof arg !== 'string' || arg.length > 4096 || /[\0\r\n]/.test(arg))) throw Error('无效 CLI 参数。')
  if (args.some(arg => /^(?:login|logout|config|auth|token|exec|shell|eval)$/i.test(arg))) throw Error('登录与凭据管理必须通过 Stable 专用界面完成。')
  return args
}
function wendingEnvironment(base = {}) {
  const env = {}
  for (const [key, value] of Object.entries(base)) {
    if (/^(?:SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|WENDING_CONFIG_DIR|WENDING_SHARED_AUTH_DIR|WENDING_SESSION_LOCK_DIR)$/i.test(key)) env[key] = value
  }
  env.PYTHONUTF8 = '1'; env.PYTHONIOENCODING = 'utf-8'
  return env
}
function runWending({ trustedCli, args, cwd, signal }) {
  validateArguments(args)
  if (signal?.aborted) return Promise.reject(Error('任务已停止。'))
  const executable = path.join(trustedCli.root, 'python', 'python.exe')
  if (!fs.existsSync(executable)) return Promise.reject(Error('内置问鼎 CLI 不完整。'))
  const env = wendingEnvironment(trustedCli.environment)
  return new Promise((resolve, reject) => {
    let output = '', stderr = '', timer, stopped = false
    const out = new StringDecoder('utf8'), err = new StringDecoder('utf8')
    const child = spawn(executable, ['-I', '-X', 'utf8', '-m', 'crm_cli.cli', ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const abort = () => { stopped = true; child.kill() }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    child.stdout.on('data', value => { output = (output + out.write(value)).slice(-1_000_000) })
    child.stderr.on('data', value => { stderr = (stderr + err.write(value)).slice(-1_000_000) })
    child.on('error', error => { cleanup(); reject(error) })
    child.on('close', code => { cleanup(); output += out.end(); stderr += err.end(); if (stopped) reject(Error('问鼎调用已停止或超时。')); else if (code) reject(Error(`问鼎调用失败（${code}）：${stderr.slice(-2000)}`)); else resolve({ code, output, stderr }) })
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort()
    timer = setTimeout(abort, 120_000)
  })
}
module.exports = { validateArguments, runWending, wendingEnvironment }
