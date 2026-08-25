'use strict'

const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const PptxGenJS = require('pptxgenjs')
const XLSX = require('xlsx')
const { escapeHtml } = require('./reports.cjs')

const OUTPUT_FORMATS = new Set(['markdown', 'pptx', 'html', 'xlsx'])
const EXTENSIONS = { markdown: '.md', pptx: '.pptx', html: '.html', xlsx: '.xlsx' }

function normalizeOutputFormat(value) { return OUTPUT_FORMATS.has(value) ? value : 'markdown' }
function outputPath(directory, name, format) {
  const base = String(name || 'workflow-output').replace(/\.(?:md|markdown|pptx|html?|xlsx?)$/i, '')
  return path.join(directory, `${base}${EXTENSIONS[format]}`)
}
function existingArtifact(content, format) {
  const label = /^(?:处理完成|输出(?:文件)?|output(?:\s+file)?|result(?:\s+file)?)\s*[:：]\s*(.+)$/i
  for (const line of String(content || '').split(/\r?\n/).reverse()) {
    const match = line.trim().match(label)
    if (!match) continue
    const candidate = match[1].trim().replace(/^["']|["']$/g, '')
    if (path.isAbsolute(candidate) && path.extname(candidate).toLowerCase() === EXTENSIONS[format] && existsSync(candidate)) return candidate
  }
  return ''
}
function splitSlides(content) {
  const paragraphs = String(content || '').replace(/\r/g, '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  const slides = []; let current = ''
  for (const paragraph of paragraphs.length ? paragraphs : ['（无输出内容）']) {
    if (current && `${current}\n\n${paragraph}`.length > 1300) { slides.push(current); current = paragraph }
    else current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current) slides.push(current)
  return slides.slice(0, 40)
}
async function writePptx(target, name, content) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Stable'; pptx.subject = 'Stable 工作流输出'; pptx.title = name; pptx.company = 'Stable'; pptx.lang = 'zh-CN'
  const parts = splitSlides(content)
  parts.forEach((body, index) => {
    const slide = pptx.addSlide(); slide.background = { color: 'F7F9FC' }
    slide.addText(index ? `${name} · ${index + 1}` : name, { x: 0.72, y: 0.52, w: 11.85, h: 0.55, fontFace: 'Microsoft YaHei', fontSize: 24, bold: true, color: '172030', margin: 0 })
    slide.addShape(pptx.ShapeType.line, { x: 0.72, y: 1.22, w: 11.85, h: 0, line: { color: 'D5DDE8', width: 1 } })
    slide.addText(body, { x: 0.72, y: 1.48, w: 11.85, h: 5.15, fontFace: 'Microsoft YaHei', fontSize: 16, color: '26364A', margin: 0.04, breakLine: false, valign: 'top', fit: 'shrink' })
    slide.addText(`${index + 1} / ${parts.length}`, { x: 11.6, y: 7.05, w: 0.95, h: 0.2, fontFace: 'Aptos', fontSize: 9, color: '7B8798', align: 'right', margin: 0 })
  })
  await pptx.writeFile({ fileName: target })
}

async function writeWorkflowOutput({ directory, name, format: requestedFormat, content }) {
  mkdirSync(directory, { recursive: true })
  const format = normalizeOutputFormat(requestedFormat); const target = outputPath(directory, name, format); const text = String(content || '')
  const artifact = existingArtifact(text, format)
  if (artifact) {
    if (path.resolve(artifact) !== path.resolve(target)) copyFileSync(artifact, target)
    return { path: target, format, sourcePath: artifact }
  }
  if (format === 'markdown') writeFileSync(target, text, 'utf8')
  else if (format === 'html') writeFileSync(target, `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)}</title><style>body{max-width:960px;margin:48px auto;padding:0 24px;font-family:"Microsoft YaHei",sans-serif;line-height:1.75;color:#172030}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><h1>${escapeHtml(name)}</h1><pre>${escapeHtml(text)}</pre></body></html>`, 'utf8')
  else if (format === 'xlsx') {
    const workbook = XLSX.utils.book_new(); const rows = [['Stable 工作流输出'], ['文件名', name], [], ...text.replace(/\r/g, '').split('\n').map((line) => [line])]
    const sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!cols'] = [{ wch: 100 }]; XLSX.utils.book_append_sheet(workbook, sheet, '输出'); XLSX.writeFile(workbook, target)
  } else await writePptx(target, name, text)
  return { path: target, format }
}

module.exports = { OUTPUT_FORMATS, existingArtifact, normalizeOutputFormat, writeWorkflowOutput }
