'use strict'

const { readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const FORMAT_RULES = [
  { extensions: ['.html', '.htm'], pattern: /(?:html|网页|网站)/i },
  { extensions: ['.md', '.markdown'], pattern: /(?:markdown|\.md\b)/i },
  { extensions: ['.xlsx', '.xls'], pattern: /(?:excel|工作簿|\.xlsx?\b)/i },
  { extensions: ['.pptx', '.ppt'], pattern: /(?:pptx?|powerpoint|演示文稿|幻灯片)/i },
  { extensions: ['.pdf'], pattern: /(?:pdf|\.pdf\b)/i },
  { extensions: ['.docx', '.doc'], pattern: /(?:word|docx?|\.docx?\b)/i },
  { extensions: ['.csv'], pattern: /(?:csv|\.csv\b)/i },
]

const ACTION = /(?:生成|创建|制作|导出|保存|写入|写成|做(?:一个|一份|成)|转成|转换成|输出|搭建|create|generate|export|save|build|write|convert|make)/i
const DIRECT_REQUEST = /(?:帮我|给我|请|直接|替我|为我|我要|需要|把[^。！？\n]{0,80}|please|can you)/i
const EXPLANATION_QUESTION = /(?:怎么|如何|为什么|是什么|什么是|能否|可不可以|是否可以|how (?:do|can|to)|why|what is)/i

function deliveryRequest(query) {
  const text = String(query || '').trim()
  const action = text.match(ACTION)
  if (!action) return { type: 'text', extensions: [] }
  const targetText = text.slice(action.index || 0)
  const extensions = FORMAT_RULES.filter((rule) => rule.pattern.test(targetText)).flatMap((rule) => rule.extensions)
  if (!extensions.length) return { type: 'text', extensions: [] }
  if (EXPLANATION_QUESTION.test(text) && !DIRECT_REQUEST.test(text)) return { type: 'text', extensions: [] }
  return { type: 'artifact', extensions: [...new Set(extensions)] }
}

function artifactSnapshot(root, extensions) {
  const wanted = new Set((extensions || []).map((extension) => extension.toLowerCase()))
  const files = new Map()
  if (!root || !wanted.size) return files
  const skipped = new Set(['.git', 'node_modules'])
  let visited = 0
  function visit(directory) {
    if (visited >= 20_000) return
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (visited >= 20_000) return
      visited += 1
      if (entry.isDirectory() && skipped.has(entry.name)) continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) { visit(fullPath); continue }
      if (!entry.isFile() || !wanted.has(path.extname(entry.name).toLowerCase())) continue
      try {
        const stats = statSync(fullPath)
        files.set(fullPath, `${stats.size}:${stats.mtimeMs}`)
      } catch {}
    }
  }
  visit(root)
  return files
}

function changedArtifacts(before, after) {
  return [...after.entries()].filter(([filePath, signature]) => before.get(filePath) !== signature).map(([filePath]) => filePath)
}

function appendArtifactPaths(answer, artifacts) {
  const missing = artifacts.filter((filePath) => !String(answer).includes(filePath))
  if (!missing.length) return String(answer).trim()
  return `${String(answer).trim()}\n\n交付文件：\n${missing.map((filePath) => `- ${filePath}`).join('\n')}`.trim()
}

module.exports = { appendArtifactPaths, artifactSnapshot, changedArtifacts, deliveryRequest }
