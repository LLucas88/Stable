'use strict'

function publicError(error) {
  const message = String(error?.message || error || '更新服务暂不可用。')
  return message.replace(/https?:\/\/[^\s]+/g, 'Stable 云端更新服务').slice(0, 300)
}

function createUpdateController({ autoUpdater, isPackaged, currentVersion, publish = () => {}, onDiagnostic = () => {}, beforeInstall = async () => {}, prepareInstall, withInstallQuit = async commit => commit(), checkDelayMs = 1_500, checkIntervalMs = 6 * 60 * 60 * 1_000 }) {
  let installWindow
  let timer; let interval
  let state = { status: isPackaged ? 'idle' : 'development', currentVersion, progress: 0, oneClick: false }
  let epoch = 0, armed = false, installPromise = null
  let stageStarted = Date.now()
  const emit = (patch) => {
    if ((patch.status && patch.status !== state.status) || patch.error) {
      try { onDiagnostic({ version: currentVersion, updateStatus: patch.status, elapsedMs: Date.now() - stageStarted }) } catch { /* support logging is optional */ }
      stageStarted = Date.now()
    }
    state = { ...state, ...patch }; publish({ ...state }); return { ...state }
  }
  const recordError = error => {
    try { onDiagnostic({ version: currentVersion, updateStatus: 'error', updateCode: error?.code, elapsedMs: Date.now() - stageStarted }) } catch { /* keep update recovery available */ }
  }

  function closeInstallWindow() {
    installWindow?.cancel(); installWindow = null
  }
  function failed(error, status = 'error') {
    closeInstallWindow()
    epoch++; armed = false
    recordError(error)
    return emit({ status, oneClick: false, ...(status === 'downloaded' ? { progress: 100 } : {}), error: publicError(error) })
  }

  async function install() {
    if (installPromise) return installPromise
    if (state.status === 'installing') return true
    if (!isPackaged || !autoUpdater || state.status !== 'downloaded') throw new Error('更新尚未下载完成。')
    const attempt = epoch, version = state.availableVersion
    const current = () => attempt === epoch && state.status === 'downloaded' && state.availableVersion === version
    const cancel = () => {
      closeInstallWindow()
      if (attempt === epoch && state.status === 'downloaded') {
        armed = false
        emit({ oneClick: false })
      }
      return false
    }
    emit({ oneClick: true, error: undefined })
    installPromise = (async () => {
      try {
        // Recheck after download: work may have started since the user clicked.
        await beforeInstall()
        if (!current()) return cancel()
        if (prepareInstall) {
          installWindow = await prepareInstall(version)
          if (!current()) return cancel()
          await beforeInstall()
          if (!current()) return cancel()
        }
        let pending = true, launched = false
        try {
          // quitAndInstall may launch the installer before Electron's
          // before-quit event. Save or resolve active editors before this call.
          await withInstallQuit(() => {
            if (!pending || !current()) return false
            pending = false
            emit({ status: 'installing', progress: 0, error: undefined })
            if (installWindow) installWindow.install(autoUpdater)
            else autoUpdater.quitAndInstall(false, true)
            launched = state.status === 'installing'
            return launched
          })
        } finally { pending = false }
        return launched || cancel()
      } catch (error) {
        if (attempt === epoch) failed(error, 'downloaded')
        throw error
      }
    })().finally(() => { installPromise = null })
    return installPromise
  }

  async function oneClick() {
    if (!isPackaged || !autoUpdater) return check(true)
    if (state.oneClick || state.status === 'installing') return { ...state }
    const attempt = ++epoch
    emit({ oneClick: true, error: undefined })
    try {
      await beforeInstall()
      if (attempt !== epoch) return { ...state }
      armed = true
      if (state.status === 'downloaded') await install()
      else if (state.status === 'available') await download()
      else await check(true)
    } catch (error) {
      if (attempt === epoch) failed(error, state.status === 'downloaded' ? 'downloaded' : 'error')
    }
    return { ...state }
  }

  async function download() {
    if (!isPackaged || !autoUpdater || state.status !== 'available') throw new Error('当前没有可下载的更新。')
    emit({ status: 'downloading', progress: 0, error: undefined })
    try { await autoUpdater.downloadUpdate(); return { ...state } }
    catch (error) { return failed(error) }
  }

  if (isPackaged && autoUpdater) {
    // Let the controller start downloads so repeated checks cannot start a second one.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.autoRunAppAfterInstall = true
    autoUpdater.disableDifferentialDownload = false
    autoUpdater.disableWebInstaller = true
    autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: undefined }))
    autoUpdater.on('update-available', (info) => {
      if (['downloading', 'downloaded', 'installing'].includes(state.status)) return
      emit({ status: 'available', availableVersion: info.version, releaseName: info.releaseName || '', progress: 0, error: undefined })
      void download()
    })
    autoUpdater.on('update-not-available', (info) => { armed = false; emit({ status: 'current', oneClick: false, availableVersion: info?.version || currentVersion, progress: 0, error: undefined }) })
    autoUpdater.on('download-progress', (info) => emit({ status: 'downloading', progress: Math.max(0, Math.min(100, Math.round(info.percent || 0))) }))
    autoUpdater.on('update-downloaded', (info) => {
      if (state.status === 'installing') return
      emit({ status: 'downloaded', availableVersion: info.version, releaseName: info.releaseName || '', progress: 100, error: undefined })
      if (state.oneClick && armed) void install().catch(() => {})
    })
    autoUpdater.on('error', error => failed(error))
  }

  async function check(manual = false) {
    if (!isPackaged || !autoUpdater) return emit({ status: 'development', error: manual ? '开发版不连接远程更新；安装版会从 Stable 云端更新服务 自动检查。' : undefined })
    if (['checking', 'downloading', 'downloaded', 'installing'].includes(state.status)) return { ...state }
    emit({ status: 'checking', error: undefined })
    try { await autoUpdater.checkForUpdates(); return { ...state } }
    catch (error) { return failed(error) }
  }

  function start() {
    if (!isPackaged || !autoUpdater || timer || interval) return
    timer = setTimeout(() => { void check(false) }, checkDelayMs)
    interval = setInterval(() => { void check(false) }, checkIntervalMs)
  }

  function dispose() { epoch++; armed = false; clearTimeout(timer); clearInterval(interval); timer = undefined; interval = undefined }
  return { check, dispose, download, install, oneClick, start, state: () => ({ ...state }) }
}

module.exports = { createUpdateController, publicError }
