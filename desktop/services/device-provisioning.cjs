'use strict'

const crypto = require('node:crypto')
const { promisify } = require('node:util')
const generate = promisify(crypto.generateKeyPair)
const fingerprint = key => crypto.createHash('sha256').update(crypto.createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex')
const fail = () => { throw new Error('配置包验证失败：请检查设备、有效期和签发者指纹。') }
function parse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128 * 1024) fail()
  try { return JSON.parse(text) } catch { fail() }
}
function endpoint(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('分发配置必须使用无用户名、查询参数和片段的 HTTPS API 地址。')
}

class DeviceProvisioning {
  constructor({ store, secrets, registry, now = Date.now }) { Object.assign(this, { store, secrets, registry, now }); this.keys = new Map() }
  async key(role) {
    if (this.keys.has(role)) return this.keys.get(role)
    const pending = (async () => {
      const name = `provisioning:${role}`
      let privateKey = this.secrets.get(name)
      if (!privateKey) {
        const pair = await generate(role === 'device' ? 'rsa' : 'ed25519', role === 'device' ? { modulusLength: 3072 } : {})
        privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
        this.secrets.set(name, privateKey)
      }
      const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()
      return { privateKey, publicKey, fingerprint: fingerprint(publicKey) }
    })()
    this.keys.set(role, pending)
    try { return await pending } catch (error) { this.keys.delete(role); throw error }
  }
  async identity() { return { issuerFingerprint: (await this.key('issuer')).fingerprint, trustedIssuer: this.store.getSetting('provisioning:issuer') || '' } }
  async request() {
    const device = await this.key('device')
    const request = { type: 'stable-device-request', version: 1, requestId: crypto.randomUUID(), publicKey: device.publicKey, deviceFingerprint: device.fingerprint, expiresAt: this.now() + 7 * 86400000 }
    this.store.setSetting('provisioning:pending', request)
    return JSON.stringify(request, null, 2)
  }
  validateRequest(text) {
    const request = parse(text)
    if (request.type !== 'stable-device-request' || request.version !== 1 || typeof request.requestId !== 'string' || request.requestId.length > 80 || !Number.isFinite(request.expiresAt) || request.expiresAt <= this.now() || request.expiresAt > this.now() + 8 * 86400000) fail()
    const key = crypto.createPublicKey(request.publicKey)
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072 || fingerprint(request.publicKey) !== request.deviceFingerprint) fail()
    return request
  }
  async issue(requestText, modelId, apiKey) {
    const request = this.validateRequest(requestText)
    const source = this.registry.publicCatalog().items.find(item => item.id === modelId)
    if (!source) throw new Error('请先保存并选择要分发的模型连接。')
    endpoint(source.baseURL)
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096) throw new Error('请填写接收设备专用的 API Key。')
    const profile = { providerId: source.providerId, displayName: source.displayName, baseURL: source.baseURL, model: source.model }
    const issuer = await this.key('issuer')
    const key = crypto.randomBytes(32), iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ profile, apiKey: apiKey.trim() })), cipher.final()])
    const body = JSON.stringify({ type: 'stable-device-config', version: 1, requestId: request.requestId, deviceFingerprint: request.deviceFingerprint, expiresAt: request.expiresAt, issuerPublicKey: issuer.publicKey, wrappedKey: crypto.publicEncrypt({ key: request.publicKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })
    key.fill(0)
    return JSON.stringify({ body, signature: crypto.sign(null, Buffer.from(body), issuer.privateKey).toString('base64') }, null, 2)
  }
  async import(text, expectedIssuer) {
    const outer = parse(text), body = parse(outer.body)
    const pending = this.store.getSetting('provisioning:pending', null)
    const trusted = this.store.getSetting('provisioning:issuer', '')
    const expected = String(trusted || expectedIssuer || '').replace(/\s/g, '').toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expected) || fingerprint(body.issuerPublicKey) !== expected) fail()
    if (crypto.createPublicKey(body.issuerPublicKey).asymmetricKeyType !== 'ed25519' || !crypto.verify(null, Buffer.from(outer.body), body.issuerPublicKey, Buffer.from(outer.signature || '', 'base64'))) fail()
    const device = await this.key('device')
    if (body.type !== 'stable-device-config' || body.version !== 1 || !pending || body.requestId !== pending.requestId || body.deviceFingerprint !== device.fingerprint || body.expiresAt !== pending.expiresAt || body.expiresAt <= this.now()) fail()
    let payload
    try {
      const key = crypto.privateDecrypt({ key: device.privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(body.wrappedKey, 'base64'))
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(body.iv, 'base64'))
        decipher.setAuthTag(Buffer.from(body.tag, 'base64'))
        payload = parse(Buffer.concat([decipher.update(Buffer.from(body.ciphertext, 'base64')), decipher.final()]).toString())
      } finally { key.fill(0) }
    } catch { fail() }
    endpoint(payload.profile.baseURL)
    if (typeof payload.apiKey !== 'string' || !payload.apiKey.trim() || payload.apiKey.length > 4096) fail()
    const existing = this.registry.publicCatalog().items.find(item => item.providerId === payload.profile.providerId && item.model === payload.profile.model)
    const id = existing?.id || crypto.randomUUID()
    this.registry.save({ ...payload.profile, id, apiKey: payload.apiKey })
    this.registry.setDefault(id)
    this.store.setSetting('provisioning:issuer', expected)
    this.store.setSetting('provisioning:pending', null)
    return { modelName: payload.profile.displayName }
  }
}
module.exports = { DeviceProvisioning }
