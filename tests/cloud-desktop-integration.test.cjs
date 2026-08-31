'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')

const source = (...parts) => readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('packaged desktop restores Stable Cloud before exposing a redacted account bridge', () => {
  const main = source('desktop', 'main.cjs')
  const preload = source('desktop', 'preload.cjs')
  const types = source('src', 'types.ts')
  assert.match(main, /const cloudEnabled = app\.isPackaged \|\| process\.env\.STABLE_CLOUD_ENABLED === '1'/)
  assert.ok(main.indexOf('await cloudAccount.restore()') < main.indexOf('modelRegistry = new ModelRegistry(store, secrets, cloudGateway)'))
  assert.match(preload, /login: \(username, password\) => invoke\('stable:cloud:login'/)
  assert.match(preload, /changePassword: \(currentPassword, newPassword, confirmPassword\)/)
  assert.doesNotMatch(preload, /device-token|DEVICE_TOKEN_KEY/)
  assert.match(types, /cloud: CloudState/)
})

test('renderer gates packaged access on login and shows quota plus a read-only cloud model catalog', () => {
  const app = source('src', 'App.tsx')
  const css = source('src', 'styles', 'app.css')
  assert.match(app, /<CloudAccessPage state=\{state\}/)
  assert.match(app, /autoComplete="username"/)
  assert.match(app, /autoComplete="current-password"/)
  assert.match(app, /role="alert" tabIndex=\{-1\}/)
  assert.match(app, /Stable Cloud 账号/)
  assert.match(app, /role="progressbar"/)
  assert.match(app, /云端模型由管理员统一维护|模型、价格和供应商凭据由管理员统一维护/)
  assert.match(css, /\.cloud-access-card/)
  assert.match(css, /\.cloud-quota-track/)
})

test('authenticated cloud catalog replaces local provider keys and resolves through the loopback gateway', () => {
  const cloudState = { status: 'authenticated', models: [{ id: 'cloud-model', display_name: 'Cloud Model' }] }
  const route = { model: { id: 'cloud-model', providerId: 'stable-cloud', displayName: 'Cloud Model', baseURL: 'http://127.0.0.1:1234/v1', model: 'cloud-model' }, apiKey: 'local-secret' }
  const gateway = { baseURL: route.model.baseURL, account: { publicState: () => cloudState }, modelRoute: (id) => { assert.equal(id, 'cloud-model'); return route } }
  const store = { modelCatalog: () => ({ items: [{ id: 'local' }], defaultModelId: 'local' }) }
  const secrets = { has: () => true, get: () => 'provider-secret' }
  const registry = new ModelRegistry(store, secrets, gateway)
  assert.deepEqual(registry.publicCatalog(), { items: [{ ...route.model, hasApiKey: true }], defaultModelId: 'cloud-model' })
  assert.equal(registry.resolve('missing'), route)
  assert.throws(() => registry.save({}), /管理员统一维护/)
})
