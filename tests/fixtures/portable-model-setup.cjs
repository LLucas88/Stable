'use strict'
const { app, safeStorage } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { StableStore } = require('../../desktop/services/store.cjs')
const { SecretStore } = require('../../desktop/services/secrets.cjs')
const { ModelRegistry } = require('../../desktop/services/model-registry.cjs')
const { applyPortableModelSetup, PENDING } = require('../../desktop/services/portable-model-setup.cjs')
const root = process.argv[2]
app.setPath('userData', root)
app.whenReady().then(() => {
  let store
  try {
    store = new StableStore(root)
    const secrets = new SecretStore(root, safeStorage), registry = new ModelRegistry(store, secrets)
    const before = JSON.stringify(store.listConversations())
    const options = { userData: root, registry, cloudEnabled: false }
    assert.equal(applyPortableModelSetup({ ...options, cloudEnabled: true }).status, 'error')
    assert.ok(fs.existsSync(path.join(root, PENDING)))
    const result = applyPortableModelSetup(options)
    assert.equal(result.status, 'loaded')
    assert.equal(registry.resolve().apiKey, 'fixture-recipient-key')
    assert.equal(registry.resolve().model.model, 'actual-test-model')
    assert.ok(!fs.readFileSync(path.join(root, 'secrets.json'), 'utf8').includes('fixture-recipient-key'))
    assert.ok(!JSON.stringify(registry.publicCatalog()).includes('fixture-recipient-key'))
    assert.equal(fs.existsSync(path.join(root, PENDING)), false)
    assert.equal(applyPortableModelSetup(options), null)
    assert.equal(store.listConversations().length, JSON.parse(before).length)
    store.db.close(); store = new StableStore(root)
    assert.equal(new ModelRegistry(store, new SecretStore(root, safeStorage)).resolve().apiKey, 'fixture-recipient-key')
    fs.writeFileSync(path.join(root, PENDING), '{broken')
    assert.equal(applyPortableModelSetup({ ...options, registry: new ModelRegistry(store, secrets) }).status, 'error')
    assert.equal(new ModelRegistry(store, secrets).resolve().apiKey, 'fixture-recipient-key')
    store.db.close(); console.log('PORTABLE_MODEL_SETUP_PASS'); app.exit(0)
  } catch (error) { console.error(error); try { store?.db.close() } catch {}; app.exit(1) }
})
