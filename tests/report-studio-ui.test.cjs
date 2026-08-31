'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const root = join(__dirname, '..')

test('advanced report studio is bridged to the Stable report library', () => {
  const page = readFileSync(join(root, 'src', 'ReportPage.tsx'), 'utf8')
  const studio = readFileSync(join(root, 'src', 'assets', 'stable-report-studio.txt'), 'utf8')

  assert.match(page, /mode: 'studio'/)
  assert.match(page, /stable-report-snapshot/)
  assert.match(page, /window\.stable\.reports\.save\(nextDraft\)/)
  assert.match(page, /window\.stable\.reports\.export\(result\.item\.id\)/)
  assert.match(studio, /Stable 报告编辑器/)
  assert.match(studio, /stable-report-ready/)
  assert.match(studio, /stable-report-command/)
  assert.match(studio, /addBlock\('chart'\)/)
  assert.match(studio, /addBlock\('table'\)/)
  assert.match(studio, /addBlock\('swot'\)/)
  assert.doesNotMatch(studio, /localStorage\.setItem\('report_autosave'/)
})

test('version is visible in the left rail and the direct launcher accepts isolated user data', () => {
  const app = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
  const main = readFileSync(join(root, 'desktop', 'main.cjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  assert.equal(pkg.version, '0.9.39')
  assert.match(app, /className="rail-version"/)
  assert.match(app, />v\{state\.appVersion\}</)
  assert.match(main, /--stable-user-data=/)
  assert.match(main, /!process\.env\.STABLE_QA_CAPTURE && !userDataPath/)
  assert.match(main, /app\.isPackaged[\s\S]*appendSwitch\('no-sandbox'\)/)
  assert.doesNotMatch(main, /appendSwitch\('disable-gpu'\)|appendSwitch\('in-process-gpu'\)/)
  assert.match(main, /stable:appearance:launchReady[\s\S]*window\.show\(\)[\s\S]*window\.focus\(\)/)
})

test('full installer ships the runtime while the lightweight updater reuses it', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const update = require(join(root, 'build', 'update-builder.config.cjs'))
  const resources = pkg.build.extraResources.map((item) => `${item.from}:${item.to}`)
  const updateResources = update.extraResources.map((item) => `${item.from}:${item.to}`)
  const targets = pkg.build.win.target.map((item) => item.target)

  assert.deepEqual(targets, ['nsis'])
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false)
  assert.ok(resources.includes('runtime:runtime'))
  assert.equal(updateResources.includes('runtime:runtime'), false)
  assert.equal(update.win.artifactName, 'Stable-Update-${version}-x64.${ext}')
  assert.doesNotMatch(JSON.stringify(pkg.build), /stable-userdata|secrets\.json/)
})
