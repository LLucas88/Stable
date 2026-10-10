'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { DeviceProvisioning } = require('../desktop/services/device-provisioning.cjs')
const { ModelRegistry } = require('../desktop/services/model-registry.cjs')
function device(clock) {
  const settings = new Map(), keys = new Map(), items = []
  const store = { getSetting: (key, fallback) => settings.has(key) ? settings.get(key) : fallback, setSetting: (key, value) => settings.set(key, value), modelCatalog: () => ({ items, defaultModelId: settings.get('default') }), modelProfile: id => items.find(m => m.id === id), saveModelProfile: model => { const i = items.findIndex(m => m.id === model.id); if (i >= 0) items[i] = model; else items.push(model) }, setDefaultModel: id => settings.set('default', id) }
  const secrets = { get: key => keys.get(key) || '', set: (key, value) => keys.set(key, value), has: key => keys.has(key) }
  const registry = new ModelRegistry(store, secrets)
  return { store, secrets, registry, service: new DeviceProvisioning({ store, secrets, registry, now: clock }) }
}
test('device-bound signed packages: restart, trust, tampering, replay, expiry, and no public secrets', async () => {
  let now = Date.now()
  const admin = device(() => now), target = device(() => now), stranger = device(() => now)
  admin.registry.save({ id: 'supplier', providerId: 'supplier', displayName: 'Test', model: 'actual-model', baseURL: 'https://example.com/v1', apiKey: 'admin-private-key' })
  const request = await target.service.request()
  const issuer = (await admin.service.identity()).issuerFingerprint
  const bundle = await admin.service.issue(request, 'supplier', 'target-private-key')
  assert.ok(!bundle.includes('target-private-key'))
  assert.ok(!bundle.includes('admin-private-key'))
  await assert.rejects(() => stranger.service.import(bundle, issuer))
  await assert.rejects(() => target.service.import(bundle, '0'.repeat(64)))
  const tampered = JSON.parse(bundle); const body = JSON.parse(tampered.body); body.expiresAt += 1; tampered.body = JSON.stringify(body)
  await assert.rejects(() => target.service.import(JSON.stringify(tampered), issuer))
  assert.equal(target.registry.publicCatalog().items.length, 0)
  target.service = new DeviceProvisioning({ ...target, now: () => now })
  await target.service.import(bundle, issuer)
  assert.equal(target.registry.resolve().apiKey, 'target-private-key')
  assert.ok(!JSON.stringify(target.registry.publicCatalog()).includes('target-private-key'))
  await assert.rejects(() => target.service.import(bundle, issuer))
  const request2 = await target.service.request()
  const renewal = await admin.service.issue(request2, 'supplier', 'rotated-key')
  await target.service.import(renewal, '')
  assert.equal(target.registry.resolve().apiKey, 'rotated-key')
  const request3 = await target.service.request()
  const expired = await admin.service.issue(request3, 'supplier', 'expired-key')
  now += 8 * 86400000
  await assert.rejects(() => target.service.import(expired, issuer))
  assert.equal(target.registry.resolve().apiKey, 'rotated-key')
})
test('configuration rejects insecure destinations and key reuse across endpoint changes', () => {
  const { registry } = device()
  const profile = { id: 'a', providerId: 'a', displayName: 'A', model: 'a', baseURL: 'https://example.com', apiKey: 'key' }
  registry.save(profile)
  assert.throws(() => registry.save({ ...profile, baseURL: 'http://remote.example' }))
  assert.throws(() => registry.save({ ...profile, baseURL: 'https://other.example', apiKey: '' }))
  assert.throws(() => registry.save({ ...profile, baseURL: 'https://user:password@example.com' }))
})
