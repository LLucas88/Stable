'use strict'

const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { SecretStore } = require('../desktop/services/secrets.cjs')

test('unreadable credentials retain ciphertext and can be explicitly replaced', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'stable-secrets-'))
  const file = path.join(root, 'secrets.json')
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString(buffer) {
      if (buffer.toString() === 'broken') throw new Error('decrypt failed')
      return buffer.toString()
    },
    encryptString: (value) => Buffer.from(value),
  }

  try {
    writeFileSync(file, JSON.stringify({
      apiKey: Buffer.from('broken').toString('base64'),
      untouched: 'keep-me',
    }))

    const store = new SecretStore(root, safeStorage)
    assert.equal(store.has('apiKey'), false)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { apiKey: Buffer.from('broken').toString('base64'), untouched: 'keep-me' })
    assert.throws(() => store.get('apiKey'), /无法解密.*已保留/)

    store.set('apiKey', 'new-key')
    assert.equal(store.get('apiKey'), 'new-key')
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).untouched, 'keep-me')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
