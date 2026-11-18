'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')

function acknowledgeUpdate(userData, version) {
  try {
    const root = path.join(userData, 'update-ui')
    const active = JSON.parse(fs.readFileSync(path.join(root, 'active.json'), 'utf8'))
    if (!/^[a-f0-9-]{36}$/.test(active.id) || active.version !== version || Date.now() - active.created > 86400000) return false
    const dir = path.join(root, active.id)
    if (!/^100\|complete\|success\|0\s*$/.test(fs.readFileSync(path.join(dir, 'progress'), 'utf8'))) return false
    fs.writeFileSync(path.join(dir, 'restarted'), 'ready')
    fs.unlinkSync(path.join(root, 'active.json'))
    return true
  } catch { return false }
}

async function prepareUpdateWindow({ userData, version, bounds, spawnProcess = spawn, timeoutMs = 15000 }) {
  const root = path.join(userData, 'update-ui'), id = randomUUID(), dir = path.join(root, id)
  // The observer must not hold files inside the directory being replaced.
  const relative = path.relative(path.dirname(process.execPath), dir)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw Error('更新提示的数据目录不能位于程序安装目录内。')
  fs.mkdirSync(dir, { recursive: true })
  const script = path.join(dir, 'update-window.ps1'), progress = path.join(dir, 'progress')
  fs.writeFileSync(script, Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),fs.readFileSync(path.join(__dirname, 'update-window.ps1'))]))
  fs.writeFileSync(path.join(root, 'active.json'), JSON.stringify({ id, version, created: Date.now() }))
  const args = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-STA','-File',script,'-Directory',dir]
  if (bounds) args.push('-CenterX',String(Math.round(bounds.x+bounds.width/2)),'-CenterY',String(Math.round(bounds.y+bounds.height/2)))
  let child, failure, finished = false
  const oldProgress = process.env.STABLE_UPDATE_PROGRESS_FILE, oldQuiet = process.env.STABLE_UPDATE_QUIET
  function cancel() {
    finished = true
    try { fs.writeFileSync(path.join(dir, 'cancel'), 'cancel') } catch {}
    if (process.env.STABLE_UPDATE_PROGRESS_FILE === progress) {
      if (oldProgress === undefined) delete process.env.STABLE_UPDATE_PROGRESS_FILE; else process.env.STABLE_UPDATE_PROGRESS_FILE = oldProgress
      if (oldQuiet === undefined) delete process.env.STABLE_UPDATE_QUIET; else process.env.STABLE_UPDATE_QUIET = oldQuiet
    }
  }
  try {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
    child = spawnProcess(executable,args,{detached:true,windowsHide:true,stdio:'ignore',cwd:dir})
    child.once('error', error => { failure = error })
    child.once('exit', () => { if (!finished) failure = Error('更新提示进程意外退出。') })
    child.unref()
    const deadline = Date.now()+timeoutMs
    while (!fs.existsSync(path.join(dir, 'ready'))) {
      if (failure) throw failure
      if (Date.now() > deadline) throw Error('更新提示未能启动，已保留当前应用。')
      await new Promise(resolve=>setTimeout(resolve,50))
    }
    if (failure) throw failure
    process.env.STABLE_UPDATE_PROGRESS_FILE = progress
    process.env.STABLE_UPDATE_QUIET = '1'
    return { cancel, install(autoUpdater) { if(failure)throw failure; autoUpdater.quitAndInstall(true,true) } }
  } catch(error) { cancel(); throw error }
}
module.exports = { prepareUpdateWindow, acknowledgeUpdate }
