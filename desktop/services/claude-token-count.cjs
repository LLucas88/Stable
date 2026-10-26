'use strict'

const fs = require('node:fs')
const { createHash, randomUUID } = require('node:crypto')
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const MAX_AGE = 24 * 60 * 60 * 1000

function modelScope(model) {
  return digest([model.providerId, model.model, model.displayName, model.providerId === 'stable-cloud' ? 'stable-cloud' : model.baseURL,
    model.contextWindow, model.maxOutputTokens])
}

function measuredPart(value) {
  let images = 0
  const serialized = JSON.stringify(value, (_key, part) => {
    if (part?.type === 'image_url') { images++; return { type: 'image_url', image_url: { url: digest(part.image_url) } } }
    return part
  })
  return { hash: digest(value), bytes: Buffer.byteLength(serialized || '', 'utf8') + images * 4096 + 8 }
}

function snapshot(body) {
  // Count the provider representation: restored reasoning and loaded schemas,
  // not SDK-only signatures, binary base64, or undiscovered tool definitions.
  const header = measuredPart({ tools: body.tools || [], response_format: body.response_format })
  const messages = (body.messages || []).map(measuredPart)
  return { header: header.hash, messages, fallback: header.bytes + messages.reduce((sum, m) => sum + m.bytes, 0) }
}

class CalibratedTokenCounter {
  constructor({ model, file, now = Date.now } = {}) {
    this.scope = modelScope(model || {}); this.file = file; this.now = now; this.samples = []
    if (file) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (saved.scope === this.scope && Array.isArray(saved.samples)) this.samples = saved.samples.filter(s => this.valid(s)).slice(-8)
      } catch { /* Calibration is optional; invalid cache always falls back. */ }
    }
  }
  valid(s) {
    return s && /^[a-f0-9]{64}$/.test(s.header) && Number.isSafeInteger(s.tokens) && s.tokens > 0 && s.tokens <= 10_000_000
      && Number.isFinite(s.at) && s.at <= this.now() && this.now() - s.at < MAX_AGE
      && Array.isArray(s.messages) && s.messages.length <= 20_000
      && s.messages.every(m => /^[a-f0-9]{64}$/.test(m.hash) && Number.isSafeInteger(m.bytes) && m.bytes >= 0)
  }
  estimate(body) {
    const current = snapshot(body)
    let result = { tokens: current.fallback, method: 'conservative-bytes', calibrated: false }
    let matched = -1
    for (const sample of this.samples) {
      if (!this.valid(sample) || sample.header !== current.header || sample.messages.length > current.messages.length) continue
      if (!sample.messages.every((m, i) => m.hash === current.messages[i].hash)) continue
      if (sample.messages.length < matched) continue
      matched = sample.messages.length
      const appended = current.messages.slice(matched).reduce((sum, m) => sum + m.bytes, 0)
      // Keep a margin for provider wrappers. Never scale arbitrary new content
      // by an average token/byte ratio learned from unrelated text or images.
      result = { tokens: Math.ceil(sample.tokens * 1.02) + 64 + appended, method: 'provider-prefix', calibrated: true }
    }
    return result
  }
  observe(body, usage) {
    if (!Number.isSafeInteger(usage?.prompt_tokens) || usage.prompt_tokens <= 0 || usage.prompt_tokens > 10_000_000) return
    const { header, messages } = snapshot(body)
    const sample = { header, messages, tokens: usage.prompt_tokens, at: this.now() }
    if (!this.valid(sample)) return
    this.samples = [...this.samples.filter(s => this.valid(s)), sample].slice(-8)
    if (!this.file) return
    const temporary = this.file + '.' + randomUUID() + '.tmp'
    try {
      fs.writeFileSync(temporary, JSON.stringify({ scope: this.scope, samples: this.samples }), { mode: 0o600 })
      fs.renameSync(temporary, this.file)
    } catch { try { fs.unlinkSync(temporary) } catch {} }
  }
}

module.exports = { CalibratedTokenCounter, modelScope, snapshot }
