'use strict'

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const path = require('node:path')

class SecretStore {
  constructor(root, safeStorage) {
    this.safeStorage = safeStorage
    this.file = path.join(root, 'secrets.json')
    this.invalid = new Set()
    mkdirSync(root, { recursive: true })
  }

  readAll() {
    if (!existsSync(this.file)) return {}
    try { return JSON.parse(readFileSync(this.file, 'utf8')) } catch { return {} }
  }

  has(key) {
    try { return Boolean(this.get(key)) } catch { return false }
  }

  remove(key) {
    const all = this.readAll()
    if (!Object.hasOwn(all, key)) return
    delete all[key]
    writeFileSync(this.file, JSON.stringify(all, null, 2), 'utf8')
  }

  get(key) {
    if (this.invalid.has(key)) {
      throw new Error('已保存的 API Key 无法解密，已安全清除。请在“设置”中重新填写。')
    }
    const encoded = this.readAll()[key]
    if (!encoded) return ''
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储当前不可用。')
    try {
      return this.safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      this.remove(key)
      this.invalid.add(key)
      throw new Error('已保存的 API Key 无法解密，已安全清除。请在“设置”中重新填写。')
    }
  }

  set(key, value) {
    if (!value) return
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储当前不可用，API Key 未保存。')
    const all = this.readAll()
    all[key] = this.safeStorage.encryptString(value).toString('base64')
    writeFileSync(this.file, JSON.stringify(all, null, 2), 'utf8')
    this.invalid.delete(key)
  }
}

module.exports = { SecretStore }
