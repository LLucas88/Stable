'use strict'
const XLSX = require('xlsx')
const path = require('node:path')
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function renderSpreadsheetDocument(file, theme = 'light') {
  // Parse only a bounded row window; never execute workbook macros or formulas.
  const book = XLSX.readFile(file, { sheetRows: 501, cellFormula: true })
  const names = book.SheetNames
  const dark = theme !== 'light'
  const panels = names.map((name, i) => {
    const sheet = book.Sheets[name]
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
    const full = sheet['!fullref'] ? XLSX.utils.decode_range(sheet['!fullref']) : range
    const rows = full ? full.e.r + 1 : 0, columns = full ? full.e.c + 1 : 0
    const lastRow = Math.min(range?.e.r ?? -1, 499), lastCol = Math.min(range?.e.c ?? -1, 99)
    const cells = []
    for (let r = 0; r <= lastRow; r++) {
      const row = [`<th scope="row">${r + 1}</th>`]
      for (let c = 0; c <= lastCol; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })]
        const value = cell ? cell.w ?? (cell.v == null && cell.f ? '=' + cell.f : XLSX.utils.format_cell(cell)) : ''
        row.push(`<td${cell?.f ? ` title="${escape('=' + cell.f)}"` : ''}>${escape(value)}</td>`)
      }
      cells.push('<tr>' + row.join('') + '</tr>')
    }
    const truncated = rows > 500 || columns > 100
    return `<section id="sheet-panel-${i}" aria-label="${escape(name)}"><p>${rows} 行 · ${columns} 列 · 只读预览${truncated ? ' · 仅显示前 500 行、100 列，完整数据请打开原文件' : ''}</p>${rows ? `<div class="grid"><table><thead><tr><th></th>${Array.from({ length: lastCol + 1 }, (_, c) => `<th scope="col">${XLSX.utils.encode_col(c)}</th>`).join('')}</tr></thead><tbody>${cells.join('')}</tbody></table></div>` : '<p>此工作表为空</p>'}</section>`
  })
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(path.basename(file))}</title><style>
  :root{color-scheme:${dark ? 'dark' : 'light'};font:14px 'Microsoft YaHei',sans-serif;background:${dark ? '#17191c' : '#fff'};color:${dark ? '#eee' : '#202124'};--rule:${dark ? '#383a3e' : '#e7e7e7'};--muted:${dark ? '#24262a' : '#f5f5f5'}}*{box-sizing:border-box}body{margin:0;padding:20px;height:100vh;display:flex;flex-direction:column;gap:12px}h1{font-size:18px;margin:0;overflow-wrap:anywhere}nav{display:flex;gap:8px;overflow:auto;flex-shrink:0;padding:4px}nav label{white-space:nowrap;border-radius:8px;padding:8px 12px;background:var(--muted);cursor:pointer}input{position:absolute;opacity:0;width:1px;height:1px}.sheets{min-height:0;flex:1;display:flex}.sheets section{display:none;flex-direction:column;min-width:0;flex:1}p{color:${dark ? '#aaa' : '#777'};font-size:12px;margin:0 0 12px}.grid{overflow:auto;flex:1;border:1px solid var(--rule);border-radius:10px}table{border-collapse:separate;border-spacing:0;font-size:13px}td,th{padding:8px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);min-width:100px;max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere}th{background:var(--muted);font-weight:500}thead th{position:sticky;top:0;z-index:2}tbody th{position:sticky;left:0;min-width:46px}thead th:first-child{left:0;z-index:3;min-width:46px}
  ${names.map((_, i) => `#sheet-${i}:checked~.sheets #sheet-panel-${i}{display:flex}#sheet-${i}:checked~nav label[for="sheet-${i}"]{background:${dark ? '#eee' : '#252525'};color:${dark ? '#222' : '#fff'}}#sheet-${i}:focus-visible~nav label[for="sheet-${i}"]{outline:2px solid #329bff}`).join('')}
  </style><body><h1>${escape(path.basename(file))}</h1>${names.map((_, i) => `<input type="radio" name="sheet" id="sheet-${i}" aria-label="${escape(names[i])}" ${i === 0 ? 'checked' : ''}>`).join('')}<nav aria-label="工作表">${names.map((name, i) => `<label for="sheet-${i}">${escape(name)}</label>`).join('')}</nav><div class="sheets">${panels.join('') || '<p>没有工作表</p>'}</div></body></html>`
}
module.exports = { renderSpreadsheetDocument }
