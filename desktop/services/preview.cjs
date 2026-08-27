'use strict'

const { existsSync, readFileSync, realpathSync, statSync } = require('node:fs')
const path = require('node:path')

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024

function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2_048) throw new Error('请输入不超过 2048 个字符的网页地址。')
  let url
  try { url = new URL(raw) } catch { throw new Error('网页地址不是有效 URL。') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('网页预览只支持 HTTP 或 HTTPS。')
  if (url.username || url.password) throw new Error('网页地址不能包含账号或密码。')
  return url.toString()
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveMarkdownFile(value, trustedRoots = [], explicit = false) {
  const requested = String(value || '').trim()
  if (!requested || requested.length > 2_000) throw new Error('Markdown 文件路径无效。')
  if (!existsSync(requested)) throw new Error('Markdown 文件不存在。')
  const resolved = realpathSync(requested)
  const info = statSync(resolved)
  if (!info.isFile()) throw new Error('Markdown 预览只支持文件。')
  if (!['.md', '.markdown'].includes(path.extname(resolved).toLowerCase())) throw new Error('只能预览 .md 或 .markdown 文件。')
  if (info.size > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件不能超过 2 MB。')
  if (!explicit && !trustedRoots.some((root) => isInside(root, resolved))) throw new Error('只能预览 Stable 工作区内或对话中明确附带的 Markdown 文件。')
  return { path: resolved, size: info.size, content: readFileSync(resolved, 'utf8') }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function renderInline(value) {
  const token = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
  return String(value).split(token).filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`
    if (part.startsWith('`') && part.endsWith('`')) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link) {
      try { return `<a href="${escapeHtml(normalizeWebUrl(link[2]))}">${escapeHtml(link[1])}</a>` }
      catch { return escapeHtml(part) }
    }
    return escapeHtml(part)
  }).join('')
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function isTableStart(lines, index) {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) return false
  const separators = tableCells(lines[index + 1])
  return separators.length > 1 && separators.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim() || 'code'
      const code = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) { code.push(lines[index]); index += 1 }
      if (index < lines.length) index += 1
      blocks.push(`<div class="code-block"><div class="code-label">${escapeHtml(language)}</div><pre><code>${escapeHtml(code.join('\n'))}</code></pre></div>`)
      continue
    }
    if (isTableStart(lines, index)) {
      const headers = tableCells(line)
      const separators = tableCells(lines[index + 1])
      const alignments = separators.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left')
      const rows = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(tableCells(lines[index])); index += 1 }
      blocks.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell, cellIndex) => `<th style="text-align:${alignments[cellIndex] || 'left'}">${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td style="text-align:${alignments[cellIndex] || 'left'}">${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) { const level = heading[1].length; blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`); index += 1; continue }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const entries = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*([-*]|\d+\.)\s+(.+)$/)
        if (!match || /^\d+\.$/.test(match[1]) !== ordered) break
        entries.push(match[2]); index += 1
      }
      const tag = ordered ? 'ol' : 'ul'
      blocks.push(`<${tag}>${entries.map((entry) => `<li>${renderInline(entry)}</li>`).join('')}</${tag}>`)
      continue
    }
    if (line.trimStart().startsWith('> ')) {
      const quote = []
      while (index < lines.length && lines[index].trimStart().startsWith('> ')) { quote.push(lines[index].trimStart().slice(2)); index += 1 }
      blocks.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`)
      continue
    }
    if (/^\s*---+\s*$/.test(line)) { blocks.push('<hr>'); index += 1; continue }
    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isTableStart(lines, index) && !/^(#{1,6})\s+|^\s*([-*]|\d+\.)\s+|^\s*>\s+|^\s*```|^\s*---+\s*$/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1 }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
  }
  return blocks.join('\n')
}

function renderMarkdownDocument(markdown, title, theme = 'dark') {
  const light = theme === 'light'
  const colors = light
    ? { background: '#f8f5ee', surface: '#ffffff', text: '#172030', muted: '#5d6878', rule: '#d9d5cc', accent: '#155eef', code: '#f1eee7' }
    : { background: '#070b12', surface: '#0e1521', text: '#dbe7f7', muted: '#8e9bad', rule: '#283446', accent: '#72a7ff', code: '#111b2a' }
  const safeTitle = escapeHtml(title || 'Markdown 预览')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${safeTitle}</title><style>
    :root{color-scheme:${light ? 'light' : 'dark'};font-family:"IBM Plex Sans","Microsoft YaHei",sans-serif;background:${colors.background};color:${colors.text}}*{box-sizing:border-box}body{margin:0;background:${colors.background}}main{width:min(58rem,calc(100% - 2rem));min-height:100vh;margin:auto;padding:3rem clamp(1rem,4vw,3rem);background:${colors.surface}}h1,h2,h3,h4,h5,h6{margin:1.6em 0 .55em;line-height:1.25}h1{margin-top:0;font-size:2rem}h2{font-size:1.5rem;border-bottom:1px solid ${colors.rule};padding-bottom:.4rem}p,li,blockquote{font-size:1rem;line-height:1.72}p{margin:.8rem 0}a{color:${colors.accent}}code,pre{font-family:"Cascadia Code",Consolas,monospace}.code-block{margin:1rem 0;overflow:hidden;border:1px solid ${colors.rule};border-radius:.65rem;background:${colors.code}}.code-label{padding:.55rem .8rem;border-bottom:1px solid ${colors.rule};color:${colors.muted};font-size:.75rem}pre{margin:0;overflow:auto;padding:1rem;line-height:1.6}p code,li code{padding:.1rem .35rem;border-radius:.3rem;background:${colors.code}}blockquote{margin:1rem 0;padding:.2rem 1rem;border-left:3px solid ${colors.accent};color:${colors.muted}}.table-wrap{overflow:auto;margin:1rem 0}table{width:100%;border-collapse:collapse}th,td{padding:.65rem .75rem;border:1px solid ${colors.rule};vertical-align:top}th{background:${colors.code}}hr{border:0;border-top:1px solid ${colors.rule};margin:2rem 0}@media(max-width:600px){main{width:100%;padding:1.25rem}h1{font-size:1.65rem}}
  </style></head><body><main>${renderMarkdown(markdown)}</main></body></html>`
}

module.exports = { MAX_MARKDOWN_BYTES, isInside, normalizeWebUrl, renderMarkdown, renderMarkdownDocument, resolveMarkdownFile }
