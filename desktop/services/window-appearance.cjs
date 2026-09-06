'use strict'

const { release } = require('node:os')

const WINDOW_CHROME = {
  light: { backgroundColor: '#f6f6f6', symbolColor: '#1a1c1f', height: 40 },
  dark: { backgroundColor: '#141414', symbolColor: '#dfdfdf', height: 40 },
}

// Native material and renderer transparency must change together. The OS can
// still substitute a solid Mica backdrop when transparency or battery settings
// require it; the content surfaces remain readable in either case.
function createWindowAppearance({ app, nativeTheme, platform = process.platform, osRelease = release }) {
  const themes = new WeakMap()
  function apply(window, theme) {
    if (!window || window.isDestroyed()) return 'opaque'
    const mode = theme === 'light' ? 'light' : 'dark'
    themes.set(window, mode)
    const chrome = WINDOW_CHROME[mode]
    if (nativeTheme.themeSource !== mode) nativeTheme.themeSource = mode
    let mica = false
    try {
      const [major, , build] = osRelease().split('.').map(Number)
      mica = platform === 'win32' && (major > 10 || (major === 10 && build >= 22621)) &&
        !nativeTheme.shouldUseHighContrastColors &&
        app.getGPUFeatureStatus().gpu_compositing === 'enabled' &&
        typeof window.setBackgroundMaterial === 'function'
      if (platform === 'win32' && typeof window.setBackgroundMaterial === 'function') {
        window.setBackgroundMaterial(mica ? 'mica' : 'none')
      }
    } catch {
      mica = false
      try { window.setBackgroundMaterial?.('none') } catch { /* Solid renderer is sufficient. */ }
    }
    const material = mica ? 'mica' : 'opaque'
    const background = mica ? '#00000000' : chrome.backgroundColor
    window.setBackgroundColor(background)
    if (platform === 'win32' && typeof window.setTitleBarOverlay === 'function') {
      window.setTitleBarOverlay({ color: background, symbolColor: chrome.symbolColor, height: chrome.height })
    }
    if (!window.webContents.isDestroyed()) window.webContents.send('stable:appearance:surface', { material, theme: mode })
    return material
  }
  function watch(window) {
    const refresh = () => { if (themes.has(window)) apply(window, themes.get(window)) }
    nativeTheme.on('updated', refresh)
    window.once('closed', () => nativeTheme.removeListener('updated', refresh))
  }
  return { apply, watch }
}

module.exports = { WINDOW_CHROME, createWindowAppearance }
