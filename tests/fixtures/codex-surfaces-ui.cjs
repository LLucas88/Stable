'use strict'
// Isolated, never-shown window: production CSS + preload, no network or user data.
const { app, BrowserWindow, session, nativeTheme } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createWindowAppearance } = require('../../desktop/services/window-appearance.cjs')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/codex-design')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1200, height: 800, ...(process.platform === 'win32' ? {titleBarStyle:'hidden',titleBarOverlay:true} : {}), webPreferences: {
    preload: path.join(root, 'desktop/preload.cjs'), sandbox: true, contextIsolation: true,
    nodeIntegration: false, offscreen: true, backgroundThrottling: false,
  } })
  const html = '<html lang="zh-CN" data-theme="light"><body><div id="root"><div class="window-shell"><div class="window-titlebar">Stable · 主题与材质验证</div><div class="app-shell"><aside class="side-rail"><div class="rail-mode-switch"><button data-active="true">工作</button><button>实验室</button></div><button class="rail-button" data-active="true">新建任务</button><div class="conversation-history-card"><button class="conversation-list-item" data-active="true">色彩与背景复刻</button></div></aside><main class="main-frame"><section style="padding:40px"><h1>稳定内容表面</h1><p>侧栏保留环境色，阅读和输入使用独立表面。</p><div class="composer"><div class="composer-box"><textarea placeholder="输入任务…"></textarea><button class="composer-tool">＋</button></div></div><div class="composer-popover" style="position:relative;inset:auto;margin-top:32px"><strong>模型与任务选项</strong><button class="composer-option">默认状态</button><button class="composer-option" data-active="true">已选中</button></div><div class="field"><input value="普通输入控件" /></div></section></main></div></div></div></body></html>'
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  for (const name of ['tokens.css', 'app.css', 'codex-surfaces.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', name), 'utf8'))
  // Inspect settled colors, independent of the runner's animation frame rate.
  await win.webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}')
  const appearance = createWindowAppearance({ app, nativeTheme })
  appearance.watch(win)
  const result = []
  for (const theme of ['light', 'dark']) {
    assert.equal(appearance.apply(win, theme), 'opaque') // Disabled GPU: actual host fallback.
    await new Promise(resolve => setTimeout(resolve, 80))
    for (const material of ['opaque', 'mica']) {
      // Synthetic Mica notification checks CSS contract, not OS wallpaper pixels.
      if (material === 'mica') win.webContents.send('stable:appearance:surface', { theme, material })
      await new Promise(resolve => setTimeout(resolve, 80))
      const metrics = await win.webContents.executeJavaScript(`(() => {
        const style = selector => getComputedStyle(document.querySelector(selector));
        const rgba = color => { const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data]; };
        return { theme:document.documentElement.dataset.theme, material:document.documentElement.dataset.windowMaterial,
          root:rgba(style('#root').backgroundColor), shell:rgba(style('.window-shell').backgroundColor),
          rail:rgba(style('.side-rail').backgroundColor), app:rgba(style('.app-shell').backgroundColor),
          main:rgba(style('.main-frame').backgroundColor), composer:rgba(style('.composer-box').backgroundColor),
          popover:rgba(style('.composer-popover').backgroundColor), selected:rgba(style('.conversation-list-item').backgroundColor),
          blur:style('.composer-box').backdropFilter, radius:style('.composer-box').borderRadius,
          shadow:style('.composer-box').boxShadow, text:style('body').color, overflow:document.documentElement.scrollWidth > innerWidth };
      })()`)
      assert.equal(metrics.theme, theme); assert.equal(metrics.material, material)
      assert.equal(metrics.main[3], 255, 'Reading surface must stay opaque')
      assert.equal(metrics.rail[3], 0, 'Do not double-tint the sidebar')
      assert.equal(metrics.app[3], 0, 'Do not mask the backdrop in the app shell')
      assert.ok(metrics.selected[3] < 20, 'Selected row should use the subtle state layer')
      assert.equal(metrics.overflow, false); assert.equal(metrics.radius, '20px'); assert.notEqual(metrics.shadow, 'none')
      if (material === 'opaque') {
        assert.equal(metrics.root[3], 255); assert.equal(metrics.composer[3], 255); assert.equal(metrics.popover[3], 255); assert.equal(metrics.blur, 'none')
      } else {
        assert.equal(metrics.root[3], 0); assert.equal(metrics.shell[3], 0, 'Application-menu shell must expose native Mica without white wash'); assert.ok(Math.abs(metrics.popover[3]-245)<=1); assert.equal(metrics.blur, 'blur(16px)')
        if(theme==='light') assert.ok(Math.abs(metrics.composer[3]-220)<=1)
      }
      result.push(metrics)
      fs.writeFileSync(path.join(output, theme+'-'+material+'.png'), (await win.webContents.capturePage()).toPNG())
    }
  }
  fs.writeFileSync(path.join(output, 'surface-metrics.json'), JSON.stringify(result,null,2))
  console.log('CODEX_SURFACES_UI_PASSED',JSON.stringify(result))
  win.destroy(); app.exit(0)
}
main().catch(error=>{console.error('CODEX_SURFACES_UI_FAILED',error.stack);win?.destroy();app.exit(1)})
