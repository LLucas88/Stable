'use strict'
const { readSource } = require('./helpers/read-source.cjs')

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')

const source = (...parts) => readSource(path.join(__dirname, '..', ...parts), 'utf8')

test('desktop applies Cloud mode policy and restores it after window load with a redacted account bridge', () => {
  const main = source('desktop', 'main.cjs')
  const preload = source('desktop', 'preload.cjs')
  const types = source('src', 'types.ts')
  assert.match(main, /isCloudEnabled\(\{ isPackaged: app\.isPackaged \}\)/)
  assert.match(main, /cloudStartup = windowLoaded\.then\(async \(\) => \{\s+if \(!cloudAccount\) return\s+try \{\s+await cloudAccount\.restore\(\)/)
  assert.match(preload, /login: \(username, password\) => invoke\('stable:cloud:login'/)
  assert.match(preload, /changePassword: \(currentPassword, newPassword, confirmPassword\)/)
  assert.doesNotMatch(preload, /device-token|DEVICE_TOKEN_KEY/)
  assert.match(types, /cloud: CloudState/)
})

test('renderer places Cloud login in settings and keeps workspace accessible', () => {
  const app = source('src', 'App.tsx') + source('src', 'settings', 'CloudAccessSettings.tsx')
  const css = source('src', 'styles', 'app.css')
  assert.match(app, /<CloudAccessSettings state=\{state\}/)
  assert.match(app, /autoComplete="username"/)
  assert.match(app, /autoComplete="current-password"/)
  assert.match(app, /role="alert" tabIndex=\{-1\}/)
  assert.match(app, /账号/)
  assert.match(app, /role="progressbar"/)
  assert.match(app, /className="rail-account-trigger"/)
  assert.match(app, /className="account-menu-popover"/)
  assert.match(app, /className="settings-page"/)
  assert.match(app, /主题设置/)
  assert.match(app, /账号/)
  assert.match(app, /软件更新/)
  assert.match(app, /Agent 对话记录/)
  assert.doesNotMatch(app, /function CloudModelSettings|title="云端模型"/)
  assert.doesNotMatch(app, /id: 'settings'/)
  assert.match(css, /\.cloud-access-card/)
  assert.match(css, /\.cloud-quota-track/)
  assert.match(css, /\.account-menu-popover/)
  assert.match(source('src', 'styles', 'sidebar-layout.css'), /\.settings-page/)
})

test('authenticated cloud catalog replaces local provider keys and resolves through the loopback gateway', () => {
  const cloudState = { status: 'authenticated', models: [{ id: 'cloud-model', display_name: 'Cloud Model' }] }
  const route = { model: { id: 'cloud-model', providerId: 'stable-cloud', displayName: 'Cloud Model', baseURL: 'http://127.0.0.1:1234/v1', model: 'cloud-model' }, apiKey: 'local-secret' }
  const gateway = { baseURL: route.model.baseURL, account: { publicState: () => cloudState }, modelRoute: (id) => { assert.equal(id, 'cloud-model'); return route } }
  const store = { getSetting: () => undefined, modelCatalog: () => ({ items: [{ id: 'local' }], defaultModelId: 'local' }) }
  const secrets = { has: () => true, get: () => 'provider-secret' }
  const registry = new ModelRegistry(store, secrets, gateway)
  assert.deepEqual(registry.publicCatalog(), { items: [{ ...route.model, hasApiKey: true, cloudReasoning: false, reasoningOptions: [] }], defaultModelId: 'cloud-model' })
  assert.equal(registry.resolve('missing'), route)
  assert.throws(() => registry.save({ providerId: 'local-test' }), /管理员统一维护/)
})

test('signed-out Cloud blocks local credential fallback while preserving independent ChatGPT routing', () => {
  const gateway = { account: { publicState: () => ({ status: 'signed_out' }) } }
  const store = { modelCatalog: () => { throw Error('must not read local catalog') } }
  const chatModel = { id: 'chatgpt:test', hasApiKey: true }
  const registry = new ModelRegistry(store, {}, gateway, { catalog: () => [chatModel] })
  assert.deepEqual(registry.publicCatalog().items, [chatModel])
  assert.throws(() => registry.resolve('cloud-model'), /设置 → 账号/)
  assert.equal(registry.resolve('chatgpt:test').apiKey, 'chatgpt-subscription')
})
