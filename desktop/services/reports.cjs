'use strict'

const ICONS = {
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg>',
  database: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Zm-6 9-.8 2.2L3 15l2.2.8L6 18l.8-2.2L9 15l-2.2-.8L6 12Zm12 2-1 2.8-3 1.2 3 1.2 1 2.8 1-2.8 3-1.2-3-1.2L18 14Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function renderText(component) {
  const content = escapeHtml(component.content).replace(/\n/g, '<br>')
  if (component.variant === 'title') return `<h1>${content || '未命名报告'}</h1>`
  if (component.variant === 'heading') return `<h2>${content || '小节标题'}</h2>`
  return `<p>${content || '在这里填写正文。'}</p>`
}

function renderTable(component) {
  const rows = Array.isArray(component.rows) ? component.rows.slice(0, 100) : []
  if (!rows.length) return ''
  const width = Math.min(20, Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0), 1))
  const rendered = rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? 'th' : 'td'
    const cells = Array.from({ length: width }, (_, columnIndex) => `<${tag}>${escapeHtml(Array.isArray(row) ? row[columnIndex] : '')}</${tag}>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<div class="report-table"><table>${rendered}</table></div>`
}

function renderIcon(component) {
  const icon = ICONS[component.icon] || ICONS.sparkles
  return `<section class="report-icon-block"><span class="report-icon">${icon}</span><div><h2>${escapeHtml(component.title || '要点')}</h2><p>${escapeHtml(component.caption || '补充说明')}</p></div></section>`
}

function renderReportHtml(draft = {}) {
  if (draft.mode === 'source' || draft.mode === 'studio') return String(draft.html || '')
  const components = Array.isArray(draft.components) ? draft.components.slice(0, 200) : []
  const body = components.map((component) => {
    if (!component || typeof component !== 'object') return ''
    if (component.type === 'text') return renderText(component)
    if (component.type === 'table') return renderTable(component)
    if (component.type === 'icon') return renderIcon(component)
    return ''
  }).join('\n') || '<p class="empty">这份报告还没有内容。</p>'
  const title = escapeHtml(draft.name || 'Stable 报告')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{color-scheme:light;--paper:#f8f5ee;--surface:#fffdf8;--ink:#111827;--muted:#536174;--rule:#d9d4c9;--blue:#0969da}*{box-sizing:border-box}html{background:var(--paper)}body{max-width:920px;margin:0 auto;padding:clamp(28px,6vw,76px) clamp(20px,5vw,64px);background:var(--surface);color:var(--ink);font-family:"IBM Plex Sans","Microsoft YaHei",sans-serif;line-height:1.7}main{display:flex;flex-direction:column;gap:28px}h1,h2,p{margin:0}h1{max-width:18ch;font-size:clamp(34px,6vw,62px);line-height:1.04;letter-spacing:-.04em}h2{font-size:clamp(20px,3vw,28px);line-height:1.2}p{max-width:72ch;color:var(--muted);white-space:pre-wrap}.report-table{overflow:auto;border:1px solid var(--rule);border-radius:10px}table{width:100%;border-collapse:collapse;min-width:520px}th,td{padding:12px 14px;border-bottom:1px solid var(--rule);border-right:1px solid var(--rule);text-align:left;vertical-align:top}th{background:var(--paper);font-weight:700}tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}.report-icon-block{display:grid;grid-template-columns:48px minmax(0,1fr);gap:16px;align-items:start;padding:20px;background:var(--paper);border-radius:12px}.report-icon{display:grid;width:44px;height:44px;place-items:center;color:var(--blue)}.report-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.report-icon-block p{margin-top:6px}.empty{padding:48px 0;color:var(--muted)}@media print{html,body{background:var(--surface)}body{max-width:none;padding:0}.report-icon-block{break-inside:avoid}.report-table{break-inside:avoid}}
</style>
</head>
<body><main>${body}</main></body>
</html>`
}

module.exports = { escapeHtml, renderReportHtml }
