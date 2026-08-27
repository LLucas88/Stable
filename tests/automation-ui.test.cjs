'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('scheduled tasks replace overview and support manual, template and chat-confirmed creation', () => {
  const app = readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8')
  const main = readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8')
  const preload = readFileSync(path.join(__dirname, '..', 'desktop', 'preload.cjs'), 'utf8')
  assert.match(app, /\{ id: 'agent', label: '对话'/)
  assert.match(app, /\{ id: 'automations', label: '定时'/)
  assert.doesNotMatch(app.slice(app.indexOf('const NAV'), app.indexOf('function errorMessage')), /label: '总览'/)
  assert.match(app, /已配置/)
  assert.match(app, /执行历史/)
  assert.match(app, /任务模板/)
  assert.match(app, /手动新建/)
  assert.match(app, /在对话中创建/)
  assert.match(app, /确认创建/)
  assert.match(main, /setInterval\(checkDueAutomations, 15_000\)/)
  assert.match(main, /parseProposalOutput/)
  assert.match(preload, /stable:automations:proposal/)
})

test('GitHub Releases updater is configured for the Stable repository', () => {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.9.27')
  assert.deepEqual(pkg.build.publish[0], { provider: 'github', owner: 'LLucas88', repo: 'Stable', releaseType: 'release' })
  assert.equal(pkg.build.directories.output, 'release-0.9.27')
  const workflow = readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8')
  assert.match(workflow, /gh release download runtime-v1/)
  assert.match(workflow, /electron-builder --win --x64 --publish always/)
})
