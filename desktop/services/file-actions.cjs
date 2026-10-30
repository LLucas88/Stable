'use strict'
const fs = require('node:fs'), path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { pathToFileURL } = require('node:url')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const TEXT = new Set('.txt .md .markdown .mdx .html .htm .css .js .jsx .ts .tsx .cjs .mjs .json .jsonl .yaml .yml .toml .csv .tsv .xml .svg .py .sh .sql .log .ini'.split(' '))
const BROWSER = new Set('.html .htm .pdf .svg .png .jpg .jpeg .gif .webp .txt'.split(' '))
async function windowsFileAction(action, file, run = promisify(execFile)) {
  const env = {}
  for (const name of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA']) {
    const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase())
    if (key) env[name] = process.env[key]
  }
  env.STABLE_FILE_ACTION = action
  env.STABLE_FILE_TARGET = action === 'browser' ? pathToFileURL(file).href : file
  const script = fs.readFileSync(path.join(__dirname, 'windows-file-action.ps1'), 'utf8')
  const executable = path.join(env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const result = await run(executable, ['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {
    windowsHide: true, env, maxBuffer: 8192, ...(action !== 'openWith' ? { timeout: 20000 } : {}),
  })
  if (action === 'reveal' && !String(result?.stdout || '').split(/\r?\n/).includes('FILE_REVEAL_VISIBLE_AND_SELECTED')) {
    throw Error('Explorer did not confirm visible file selection')
  }
}
function createFileActions({ roots, shell, clipboard, dialog, getWindow, platform = process.platform, windows = windowsFileAction }) {
  const reveals = new Map()
  return async (action, value) => {
    if (!['openWith','browser','saveAs','copyPath','copyContent','reveal'].includes(action)) throw Error('未知的文件操作。')
    const file = resolveWorkspaceEntry(value, roots(value), { fileOnly: true })
    if (action === 'copyPath') { clipboard.writeText(file.path); return true }
    if (action === 'reveal') {
      if (platform === 'win32') {
        const key = file.path.toLowerCase()
        let pending = reveals.get(key)
        if (!pending) {
          pending = Promise.resolve().then(() => windows('reveal', file.path)).finally(() => reveals.delete(key))
          reveals.set(key, pending)
        }
        try { await pending } catch { throw Error('无法在资源管理器中定位文件，请重试或使用“复制路径”手动打开。') }
      } else { shell.showItemInFolder(file.path) }
      return true
    }
    if (action === 'copyContent') {
      if (!TEXT.has(file.extension)) throw Error('此文件不是可复制的文本格式，请使用复制路径或另存为。')
      const fd = fs.openSync(file.path, 'r')
      let bytes
      try {
        if (fs.fstatSync(fd).size > 2_000_000) throw Error('文件超过 2 MB，请在编辑器中复制所需内容。')
        bytes = Buffer.alloc(2_000_001); bytes = bytes.subarray(0, fs.readSync(fd, bytes, 0, bytes.length, 0))
      } finally { fs.closeSync(fd) }
      if (bytes.length > 2_000_000) throw Error('文件超过 2 MB，请在编辑器中复制所需内容。')
      let text
      try { text = new TextDecoder(bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : 'utf-8', { fatal: true }).decode(bytes) } catch { throw Error('文件编码无法识别，请在编辑器中打开后复制。') }
      if (text.includes('\0')) throw Error('文件包含二进制内容，不能作为文本复制。')
      clipboard.writeText(text); return true
    }
    if (action === 'saveAs') {
      const options = { title: '另存为', defaultPath: path.basename(file.path), properties: ['showOverwriteConfirmation', 'createDirectory'] }
      const window = getWindow?.()
      const result = await (window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) return false
      // Revalidate after the dialog; it may have remained open while files changed.
      resolveWorkspaceEntry(file.path, roots(file.path), { fileOnly: true })
      if (fs.existsSync(result.filePath)) {
        const from = fs.statSync(file.path), to = fs.statSync(result.filePath)
        if (fs.realpathSync(file.path) === fs.realpathSync(result.filePath) || from.dev === to.dev && from.ino === to.ino) throw Error('目标是原文件，请选择其他文件名。')
      }
      await fs.promises.copyFile(file.path, result.filePath); return true
    }
    if (action === 'openWith') {
      if (platform !== 'win32') throw Error('此功能目前仅支持 Windows 的选择应用窗口。')
      try { await windows('openWith', file.path) } catch { throw Error('无法打开“选择其他应用”窗口，请检查系统设置后重试。') }
      return true
    }
    if (!BROWSER.has(file.extension)) throw Error('此格式不能在浏览器中预览，请使用打开方式。')
    if (platform !== 'win32') throw Error('此功能目前仅支持 Windows 默认浏览器。')
    try { await windows('browser', file.path) } catch { throw Error('无法启动默认浏览器，请在 Windows 设置中选择默认浏览器后重试。') }
    return true
  }
}
function registerFileActions({ ipcMain, trusted, ...options }) {
  const perform = createFileActions(options)
  ipcMain.handle('stable:system:fileAction', (event, payload) => {
    if (!trusted(event)) throw Error('此页面无权操作本地文件。')
    return perform(payload?.action, payload?.path)
  })
  return perform
}
module.exports = { createFileActions, registerFileActions, windowsFileAction }
