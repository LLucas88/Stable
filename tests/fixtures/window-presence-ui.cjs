'use strict'
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdtempSync, rmSync, readFileSync } = require('node:fs')
const path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict')
const { createWindowPresence, badgeScript } = require('../../desktop/services/window-presence.cjs')
const directory = mkdtempSync(path.join(os.tmpdir(), 'stable-window-presence-'))
app.setPath('userData', directory); app.disableHardwareAcceleration()
let window
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  await app.whenReady()
  window = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  const presence = createWindowPresence({ app, nativeImage }); presence.attach(window)
  const css = readFileSync(path.join(__dirname, '../../src/styles/app.css'), 'utf8')
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>${css}</style>
    <div id="root"><article class="conversation-list-item" style="position:absolute;top:100px;left:100px;width:350px;height:44px">
    <button class="conversation-select" style="height:44px">任务</button>
    <span class="conversation-activity"><svg class="spin" width="15" height="15" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10" fill="none" stroke="black" stroke-width="2"/></svg></span>
    <div class="conversation-item-actions"><button aria-expanded="false">⋮</button></div></article></div>`))
  const js = source => window.webContents.executeJavaScript(source)
  window.webContents.debugger.attach('1.3')
  const media = value => window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] })
  const move = (x,y) => window.webContents.sendInputEvent({ type: 'mouseMove', x,y })
  const status = () => js(`(() => {const s=getComputedStyle(document.querySelector('.conversation-activity')), m=getComputedStyle(document.querySelector('.conversation-item-actions'));return {visible:s.visibility,opacity:m.opacity,transition:s.transitionDuration,menuTransition:m.transitionDuration}})()`)
  for (const preference of ['no-preference', 'reduce']) {
    await media(preference); move(700,500); await pause(40)
    const before = await js("getComputedStyle(document.querySelector('.spin')).transform")
    await pause(340)
    assert.notEqual(await js("getComputedStyle(document.querySelector('.spin')).transform"), before, preference + ': spinner is not rotating')
    assert.equal((await status()).visible, 'visible')
    move(140,122); await pause(25)
    assert.deepEqual(await status(), { visible: 'hidden', opacity: '1', transition: '0s', menuTransition: '0s' })
    // Real mouse focus remains after pointer leaves, but must not hide progress.
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x:140,y:122,clickCount:1 })
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x:140,y:122,clickCount:1 })
    move(700,500); await pause(25)
    assert.equal((await status()).visible, 'visible', 'mouse focus hid progress')
    await js("document.querySelector('.conversation-item-actions button').setAttribute('aria-expanded','true')")
    assert.equal((await status()).visible, 'hidden')
    await js("document.querySelector('.conversation-item-actions button').setAttribute('aria-expanded','false')")
  }
  for (const count of [1, 12, 105]) {
    const image = nativeImage.createFromDataURL(await js(badgeScript(count)))
    assert.equal(image.isEmpty(), false); assert.deepEqual(image.getSize(), { width:64,height:64 })
    const bitmap = image.toBitmap(); let black=0, white=0, clear=0
    for (let i=0;i<bitmap.length;i+=4) {
      if (!bitmap[i+3]) clear++
      if (bitmap[i+3]===255 && bitmap[i]===0 && bitmap[i+1]===0 && bitmap[i+2]===0) black++
      if (bitmap[i+3]===255 && bitmap[i]===255 && bitmap[i+1]===255 && bitmap[i+2]===255) white++
    }
    assert.ok(black>1500 && white>50 && clear>500, 'badge must contain black circle, white count and transparent corners')
    await presence.setCompletedCount(count) // actual Windows Electron API, no mock
  }
  await presence.setCompletedCount(0)
  await js('window.backgroundTicks=0;setInterval(()=>window.backgroundTicks++,20)')
  window.close(); await pause(140)
  assert.equal(window.isDestroyed(), false)
  assert.ok(await js('window.backgroundTicks') > 1, 'close stopped background execution')
  presence.allowQuit(); window.destroy()
  console.log('WINDOW_PRESENCE_UI_PASSED'); app.exit(0)
}
run().catch(error => { console.error(error); window?.destroy(); app.exit(1) })
process.on('exit', () => { try { rmSync(directory, { recursive:true, force:true }) } catch {} })
