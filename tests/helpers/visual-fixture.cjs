'use strict'

// Test the normal visual state independently of Windows Server accessibility
// defaults and animation timing. Reduced-motion/fallback tests remain separate.
module.exports = async function prepareVisualFixture(window) {
  if (!window.webContents.debugger.isAttached()) window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'no-preference' },
    { name: 'forced-colors', value: 'none' },
  ] })
  await window.webContents.insertCSS('*,*::before,*::after{transition:none!important}')
}
