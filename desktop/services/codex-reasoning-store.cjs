'use strict'

const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const PREFIX = 'stable-reasoning-v1:'

// Provider state stays beside the private Codex rollout, never in a UI event.
// Responses encrypted_content carries only an opaque reference to this store.
class CodexReasoningStore {
  constructor(file) {
    this.file = file; this.values = new Map()
    if (file && fs.existsSync(file)) {
      try {
        for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
          const entry = JSON.parse(line)
          if (!entry.id?.startsWith(PREFIX) || typeof entry.text !== 'string') throw new Error('Invalid record')
          this.values.set(entry.id, entry.text)
        }
      } catch { throw new Error('Codex 模型上下文记录损坏，请新建对话重试；原有文件和对话记录不受影响。') }
    }
  }
  remember(text) {
    const id = `${PREFIX}${randomUUID()}`
    // Save before completing a Responses item so a restart can always replay it.
    if (this.file) fs.appendFileSync(this.file, `${JSON.stringify({ id, text })}\n`, { mode: 0o600, flush: true })
    this.values.set(id, text)
    return id
  }
  get(id) {
    if (id?.startsWith(PREFIX) && !this.values.has(id)) throw new Error('Codex 模型上下文记录缺失，请新建对话重试；原有文件和对话记录不受影响。')
    return this.values.get(id)
  }
}

module.exports = { CodexReasoningStore }
