'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { linuxPath, commandEnvironment, runWslCommand } = require('../desktop/services/wsl-sandbox.cjs')

test('WSL separates preparation, execution and sync budgets and ignores untrusted phase text', { skip: process.platform !== 'win32' }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {}
  let payload, ended = false
  child.stdin.on('data', value => { payload = JSON.parse(String(value)) })
  child.stdin.on('finish', () => { ended = true; child.emit('close', 137) })
  const pending = runWslCommand({command:'echo ok',cwd:'D:\\task',writableRoots:['D:\\task'],readableRoots:['D:\\task'],timeoutMs:1000,spawnImpl:()=>child})
  const rejection = assert.rejects(pending, /同步工作区文件阶段超过 120000 毫秒.*文件可能已经写入/)
  const mark = name => child.stderr.write(`@@STABLE_PHASE:${payload.statusToken}:${name}@@\n`)
  t.mock.timers.tick(90_000); assert.equal(ended, false)
  mark('execute'); t.mock.timers.tick(500)
  mark('worker-cleanup'); t.mock.timers.tick(20_000)
  mark('sync'); t.mock.timers.tick(119_000); assert.equal(ended, false)
  child.stderr.write('@@STABLE_PHASE:untrusted:cleanup@@\n')
  mark('execute'); mark('sync') // Neither backwards nor repeated phases reset the budget.
  t.mock.timers.tick(1000)
  await rejection
})

test('WSL command errors retain stdout evidence instead of hiding it behind proxy warnings', { skip: process.platform !== 'win32' }, async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough()
  const pending = runWslCommand({command:'grep marker report.html',cwd:'D:\\task',writableRoots:['D:\\task'],readableRoots:['D:\\task'],spawnImpl:()=>child})
  child.stdout.write('0\n');child.stderr.write('proxy warning\n');child.emit('close',1)
  await assert.rejects(pending, error => {assert.match(error.message,/标准输出：\n0/);assert.match(error.message,/proxy warning/);assert.equal(error.result.code,1);return true})
})

test('missing distro explains setup/reboot while command failures do not request reinstall', { skip: process.platform !== 'win32' }, async () => {
  async function fail(text, encoding, code) {
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough()
    const result = runWslCommand({command:'echo test',cwd:'D:\\task',writableRoots:['D:\\task'],readableRoots:['D:\\task'],spawnImpl:()=>child})
    child.stdout.write(Buffer.from(text,encoding)); child.emit('close',code)
    return result
  }
  await assert.rejects(fail('不存在分发 Wsl/Service/WSL_E_DISTRO_NOT_FOUND','utf16le',-1), error => {
    assert.match(error.message,/命令未执行/); assert.match(error.message,/重启 Windows/); return true
  })
  await assert.rejects(fail('ValueError: invalid input','utf8',1), error => {
    assert.match(error.message,/命令执行失败/); assert.doesNotMatch(error.message,/sandbox:setup|安装/); return true
  })
})
test('WSL paths preserve Unicode and literal metacharacters while rejecting devices, UNC and drive roots', () => {
  assert.equal(linuxPath('D:\\项目 空格\\a[$x]'), '/mnt/d/项目 空格/a[$x]')
  for (const input of ['D:\\', '\\\\server\\share', '\\\\?\\C:\\x', 'C:\\x:stream', '/tmp/a', 'C:\\bad\npath']) assert.throws(() => linuxPath(input))
})
test('command launch uses an allowlisted environment with no WSLENV credential propagation', () => {
  const env = commandEnvironment({ SystemRoot: 'C:\\Windows', PATH: 'attacker', WSLENV: 'SECRET/u', SECRET: 'value', HTTP_PROXY: 'secret', NODE_OPTIONS: '--inspect' })
  assert.deepEqual(env, { SystemRoot: 'C:\\Windows', WSLENV: '', WSL_UTF8: '1' })
})
test('model command is JSON data, cancellation closes the supervisor pipe, no shell interpolation', { skip: process.platform !== 'win32' }, async () => {
  const controller = new AbortController()
  let captured, payload = '', ended = false
  const child = new EventEmitter()
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {}
  child.stdin.on('data', value => { payload += value })
  child.stdin.on('finish', () => { ended = true; child.emit('close', 137) })
  const command = 'printf "中文"; $(touch unsafe)'
  const pending = runWslCommand({ command, cwd: 'D:\\task', writableRoots: ['D:\\task'], readableRoots: ['D:\\task'], timeoutMs: 1000, signal: controller.signal, spawnImpl: (...args) => { captured = args; return child } })
  assert.equal(captured[2].shell, undefined); assert.equal(captured[2].windowsHide, true)
  assert(!captured[1].join(' ').includes(command)); assert.equal(JSON.parse(payload).command, command)
  controller.abort(); await assert.rejects(pending, /任务已停止/); assert(ended)
})
