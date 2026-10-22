'use strict'

const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const digest = value => createHash('sha256').update(value).digest('hex')

// Archive the exact SDK-returned pixels (which may differ from the source file).
// The directory is an internal session directory made readable by the runner.
// Never create/overwrite a caller-supplied path or follow a substituted link.
function archiveToolImage(part, directory) {
  if (!directory || !path.isAbsolute(directory)) return
  const match = part?.image_url?.url?.match(/^data:(image\/(png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (part.type !== 'image_url' || !match) return
  try {
    const info = fs.lstatSync(directory)
    const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
    if (!info.isDirectory() || info.isSymbolicLink() || !samePath(fs.realpathSync(directory), path.resolve(directory))) return
    const bytes = Buffer.from(match[3], 'base64')
    if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes.toString('base64') !== match[3]) return
    const sha256 = digest(bytes), file = path.join(directory, `${sha256}.${match[2]}`)
    try { fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') return }
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== bytes.length || digest(fs.readFileSync(file)) !== sha256) return
    return { path: file, sha256, mimeType: match[1] }
  } catch { /* Evidence storage is optional; retain inline pixels on failure. */ }
}

function screenshotEvidence(messages, imageDirectory) {
  const calls = new Map(), artifacts = new Map(), ordered = []
  for (const message of messages) {
    for (const call of message.tool_calls || []) calls.set(call.id, call.function)
    const call = calls.get(message.tool_call_id)
    if (message.role !== 'tool' || !Array.isArray(message.content) || message.content.some(p => p.text?.startsWith('Tool execution error:'))) continue
    if (call?.name === 'Read') {
      for (const part of message.content) {
        const metadata = archiveToolImage(part, imageDirectory)
        if (metadata) { artifacts.set(part, metadata); ordered.push(metadata.sha256) }
      }
      continue
    }
    if (!/^(?:mcp__stable__)?stable_browser$/.test(call?.name || '')) continue
    let args; try { args = JSON.parse(call.arguments) } catch { continue }
    if (!['screenshot', 'batch'].includes(args.action) || message.content.some(p => p.text === 'Tool execution error:')) continue
    for (let index = 0; index < message.content.length; index++) {
      let metadata
      try { const value = JSON.parse(message.content[index].text); if (!value.error) metadata = value.screenshotArtifact } catch {}
      if (!metadata || !path.isAbsolute(metadata.path || '') || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) continue
      // Each batch observation has its own adjacent metadata/image pair. Do not
      // associate the first image with all screenshots in a multi-image result.
      const image = message.content[index + 1]
      if (image?.type !== 'image_url' || !/^data:image\/(png|jpeg|gif|webp);base64,/.test(image.image_url?.url || '')) continue
      const bytes = Buffer.from(image.image_url.url.split(',')[1], 'base64')
      try {
        const stat = fs.lstatSync(metadata.path)
        if (!stat.isFile() || stat.isSymbolicLink() || digest(fs.readFileSync(metadata.path)) !== metadata.sha256) continue
      } catch { continue }
      // SDK image limits can resize/re-encode an MCP image while leaving its
      // original metadata intact. Preserve both: archive the actual returned
      // pixels separately instead of attributing them to the original hash.
      const actual = digest(bytes) === metadata.sha256 && image.image_url.url.startsWith(`data:${metadata.mimeType};base64,`)
        ? metadata : archiveToolImage(image, imageDirectory)
      if (!actual) continue
      artifacts.set(image, actual)
      ordered.push(actual.sha256)
    }
  }
  // Keep three recent distinct views (current, before/after, other viewport). No cross-request
  // state: after SDK compaction the surviving history chooses its own window.
  const recent = new Set()
  for (const sha of ordered.reverse()) { recent.add(sha); if (recent.size === 3) break }
  return { artifacts, recent }
}

// Request-local references survive replay/compaction without relying on an image
// or result that the SDK may already have removed from its retained history.
function compactToolContext(messages, { imageDirectory } = {}) {
  const calls = new Map(), images = new Map(), fields = new Map(), results = new Map()
  const { artifacts, recent } = screenshotEvidence(messages, imageDirectory)
  const notebooks = new Map(), notebookCalls = new Map()
  for (const message of messages) {
    for (const call of message.tool_calls || []) notebookCalls.set(call.id, call.function.name)
    if (message.role !== 'tool' || !/^(?:mcp__stable__)?stable_browser$/.test(notebookCalls.get(message.tool_call_id) || '')) continue
    const parts = typeof message.content === 'string' ? [{ text: message.content }] : message.content
    if (!Array.isArray(parts) || parts.some(p => p.text?.startsWith('Tool execution error:'))) continue
    for (const part of parts) {
      try {
        const value = JSON.parse(part.text), book = value?.reviewNotebook
        if (!value.error && value.ok !== false && typeof book?.scope === 'string' && Number.isInteger(book.revision) && Array.isArray(book.checks) && Array.isArray(book.evidence)) {
          notebooks.set(book.scope, { id: message.tool_call_id, revision: book.revision })
        }
      } catch {}
    }
  }
  return messages.map(message => {
    for (const call of message.tool_calls || []) calls.set(call.id, call.function)
    if (message.role !== 'tool') return message
    const call = calls.get(message.tool_call_id)
    const parts = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
    if (!call || !Array.isArray(parts) || parts.some(p => p.type === 'text' && p.text === 'Tool execution error:') || (typeof message.content === 'string' && message.content.startsWith('Tool execution error:'))) return message
    const browser = /^(?:mcp__stable__)?stable_browser$/.test(call.name)
    const reference = `tool_call_id=${message.tool_call_id}`
    const content = parts.map((part, index) => {
      if (part.type === 'image_url' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(part.image_url?.url || '')) {
        const artifact = artifacts.get(part)
        if (artifact && !recent.has(artifact.sha256)) {
          return { type: 'text', text: `[Earlier tool image stored at ${JSON.stringify(artifact.path)}; sha256=${artifact.sha256}. Recent views remain inline. Use Read on this actual file if this earlier view is needed; do not guess SDK temporary paths or repeat the browser capture solely to recover it.]` }
        }
        const key = digest(JSON.stringify(part)), prior = images.get(key)
        if (prior) return { type: 'text', text: `[Image bytes identical to ${prior}; use that retained image for this observation.]` }
        images.set(key, `${reference}, content[${index}]`)
        return part
      }
      if (part.type !== 'text') return part
      if (browser) {
        let value
        try { value = JSON.parse(part.text) } catch { return part }
        if (!value || typeof value !== 'object' || value.error || value.ok === false) return part
        const updated = { ...value }
        const book = value.reviewNotebook, latest = notebooks.get(book?.scope)
        if (latest && latest.id !== message.tool_call_id && latest.revision > book.revision) {
          delete updated.reviewNotebook
          delete updated.reviewProgress
          updated.reviewNotebookReference = `Superseded review state for scope=${book.scope}; use the latest complete reviewNotebook for this scope in the retained messages. This result's own observation remains historical.`
        }
        // Never deduplicate controls, refs, viewport, truncation flags or errors.
        for (const field of value.untrustedContent === true ? ['text', 'tables', 'imageInventory', 'hiddenHeadings', 'hiddenText', 'imageGeometry', 'charts', 'overlays', 'horizontalOverflow'] : []) {
          const serialized = JSON.stringify(value[field])
          if (!serialized || serialized.length < 512) continue
          const key = digest(JSON.stringify([value.tabId, value.url, field, value[field]])), prior = fields.get(key)
          if (prior) {
            delete updated[field]
            updated.contextReferences = { ...updated.contextReferences, [field]: `Identical to ${prior}; current controls and viewport are in this result.` }
          } else fields.set(key, `${reference}.${field}`)
        }
        return { ...part, text: JSON.stringify(updated) }
      }
      if (part.text.length < 512) return part
      if (!['Read', 'Grep', 'Glob'].includes(call.name)) return part
      const key = digest(JSON.stringify([call.name, call.arguments, part.text])), prior = results.get(key)
      if (prior) return { ...part, text: `[Result text identical to ${prior}; the tool was executed again successfully.]` }
      results.set(key, `${reference}, content[${index}]`)
      return part
    })
    return { ...message, content: typeof message.content === 'string' ? content.map(p => p.text).join('\n\n') : content }
  })
}

module.exports = { compactToolContext }
