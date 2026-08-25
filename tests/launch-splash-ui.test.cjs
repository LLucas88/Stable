'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('launch splash plays every mount, supports skip, and restores the saved window theme', () => {
  const app = readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8')
  const css = readFileSync(path.join(__dirname, '..', 'src', 'styles', 'app.css'), 'utf8')
  const main = readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8')
  const preload = readFileSync(path.join(__dirname, '..', 'desktop', 'preload.cjs'), 'utf8')

  assert.match(app, /const \[showLaunch, setShowLaunch\] = useState\(true\)/)
  assert.match(app, /onLaunchStart\(\(\) => setLaunchRunning\(true\)\)/)
  assert.match(app, /window\.setTimeout\([\s\S]*2100\)/)
  assert.match(app, /className="launch-splash"[\s\S]*onPointerDown=\{onFinish\}/)
  assert.match(app, /import launchLogoUrl from '\.\.\/build\/stable_launch_logo\.png'/)
  assert.match(app, /className="launch-logo" src=\{launchLogoUrl\}/)
  assert.match(css, /\.launch-splash[\s\S]*background: #000/)
  assert.match(css, /@keyframes launch-logo-arrive/)
  assert.match(css, /@keyframes launch-scan-pass/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(preload, /completeLaunch: \(\) => invoke\('stable:appearance:launchComplete'\)/)
  assert.match(preload, /stable:appearance:launchStart/)
  assert.match(preload, /ipcRenderer\.send\('stable:appearance:launchReady'\)/)
  assert.match(main, /backgroundColor: '#000000'/)
  assert.match(main, /backgroundThrottling: false/)
  assert.match(main, /stable:appearance:launchReady[\s\S]*event\.sender\.send\('stable:appearance:launchStart'\)/)
  assert.match(main, /stable:appearance:launchComplete[\s\S]*applyWindowTheme/)
})

test('QA capture delay can inspect a frame during the launch animation', () => {
  const main = readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8')
  assert.match(main, /STABLE_QA_CAPTURE_DELAY/)
  assert.match(main, /setTimeout\(async \(\) => \{[\s\S]*\}, captureDelay\)/)
})
