'use strict'

function publicError(error) {
  const message = String(error?.message || error || '更新服务暂不可用。')
  return message.replace(/https?:\/\/[^\s]+/g, 'GitHub Releases').slice(0, 300)
}

function createUpdateController({ autoUpdater, isPackaged, currentVersion, publish = () => {}, checkDelayMs = 12_000, checkIntervalMs = 6 * 60 * 60 * 1_000 }) {
  let timer; let interval
  let state = { status: isPackaged ? 'idle' : 'development', currentVersion, progress: 0 }
  const emit = (patch) => { state = { ...state, ...patch }; publish({ ...state }); return { ...state } }

  function install() {
    if (!isPackaged || !autoUpdater || state.status !== 'downloaded') throw new Error('更新尚未下载完成。')
    emit({ status: 'installing', progress: 0, error: undefined })
    autoUpdater.quitAndInstall(false, false)
    return true
  }

  if (isPackaged && autoUpdater) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.autoRunAppAfterInstall = false
    autoUpdater.disableDifferentialDownload = false
    autoUpdater.disableWebInstaller = true
    autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: undefined }))
    autoUpdater.on('update-available', (info) => emit({ status: 'downloading', availableVersion: info.version, releaseName: info.releaseName || '', error: undefined }))
    autoUpdater.on('update-not-available', (info) => emit({ status: 'current', availableVersion: info?.version || currentVersion, progress: 0, error: undefined }))
    autoUpdater.on('download-progress', (info) => emit({ status: 'downloading', progress: Math.max(0, Math.min(100, Math.round(info.percent || 0))) }))
    autoUpdater.on('update-downloaded', (info) => emit({ status: 'downloaded', availableVersion: info.version, releaseName: info.releaseName || '', progress: 100, error: undefined }))
    autoUpdater.on('error', (error) => emit({ status: 'error', error: publicError(error) }))
  }

  async function check(manual = false) {
    if (!isPackaged || !autoUpdater) return emit({ status: 'development', error: manual ? '开发版不连接远程更新；安装版会从 GitHub Releases 自动检查。' : undefined })
    emit({ status: 'checking', error: undefined })
    try { await autoUpdater.checkForUpdates(); return { ...state } }
    catch (error) { return emit({ status: 'error', error: publicError(error) }) }
  }

  function start() {
    if (!isPackaged || !autoUpdater) return
    timer = setTimeout(() => { void check(false) }, checkDelayMs)
    interval = setInterval(() => { void check(false) }, checkIntervalMs)
  }

  function dispose() { clearTimeout(timer); clearInterval(interval) }
  return { check, dispose, install, start, state: () => ({ ...state }) }
}

module.exports = { createUpdateController, publicError }
