'use strict'
// Parse workbooks off the Electron UI thread. A cancelled/oversized operation
// can be terminated without leaving a half-written delivery file.
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { toolFile } = require('./tool-files.cjs')

async function run() {
  const { workspace, args, dependencyRoot } = workerData
  const vendorRequire = createRequire(path.join(dependencyRoot, 'package.json'))
  const ExcelJS = vendorRequire('exceljs')
  const JSZip = vendorRequire('jszip')
  const workbook = new ExcelJS.Workbook()
  const scalar = value => value == null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)
  if (!['inspect', 'read', 'create', 'update'].includes(args.action)) throw new Error('未知 Excel 操作。')
  if (args.action !== 'create') {
    const source = toolFile(workspace, args.path)
    if (path.extname(source).toLowerCase() !== '.xlsx') throw new Error('此工具支持 .xlsx；旧 .xls 请先另存为 .xlsx。')
    if (fs.statSync(source).size > 20 * 1024 * 1024) throw new Error('工作簿超过 20 MB，请先拆分。')
    const bytes = fs.readFileSync(source)
    const zip = await JSZip.loadAsync(bytes)
    const entries = Object.values(zip.files)
    if (entries.length > 5000 || entries.reduce((sum, item) => sum + (item._data?.uncompressedSize || 0), 0) > 100 * 1024 * 1024) throw new Error('工作簿解压体积过大，请先拆分。')
    if (entries.some(item => /vbaProject|pivotTable|pivotCache|xl\/charts\//i.test(item.name)) && args.action === 'update') throw new Error('工作簿含宏、图表或透视表，不能保证保真另存；请先导出普通数据副本。')
    if (['inspect', 'read'].includes(args.action)) {
      const start = args.startRow ?? 1, count = args.rowCount ?? 100
      if (args.action === 'read' && (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 200)) throw new Error('起始行必须 >=1，每次读取 1–200 行。')
      const reader = new ExcelJS.stream.xlsx.WorkbookReader(source, { sharedStrings: args.action === 'read' ? 'cache' : 'ignore', styles: args.action === 'read' ? 'cache' : 'ignore', hyperlinks: 'ignore', worksheets: 'emit' })
      // openpyxl writes absolute OPC relationship targets; ExcelJS expects
      // paths relative to xl/. Normalize on every parse, including ZIP replay.
      const parseRels = reader._parseRels.bind(reader)
      reader._parseRels = async entry => {
        await parseRels(entry)
        for (const rel of reader.workbookRels || []) {
          if (rel.TargetMode === 'External' || typeof rel.Target !== 'string') continue
          const target = path.posix.resolve('/xl', rel.Target)
          rel.Target = path.posix.relative('/xl', target)
        }
      }
      if (zip.file('xl/_rels/workbook.xml.rels')) await reader._parseRels(zip.file('xl/_rels/workbook.xml.rels').nodeStream())
      // ExcelJS 4.4.0 can encounter sheets before workbook metadata in ZIP order.
      await reader._parseWorkbook(zip.file('xl/workbook.xml').nodeStream())
      if (args.action === 'read' && zip.file('xl/styles.xml')) await reader._parseStyles(zip.file('xl/styles.xml').nodeStream())
      if (args.action === 'read' && zip.file('xl/sharedStrings.xml')) {
        for await (const _entry of reader._parseSharedStrings(zip.file('xl/sharedStrings.xml').nodeStream())) { /* cache shared strings */ }
      }
      // Iterate workbook relationships explicitly. ZIP order and empty sheets
      // must not control which worksheets ExcelJS emits.
      const WorksheetReader = vendorRequire('exceljs/lib/stream/xlsx/worksheet-reader')
      const sheets = []; let result
      for (const metadata of reader.model.sheets || []) {
        const rel = (reader.workbookRels || []).find(r => r.Id === metadata.rId)
        const file = rel && zip.file(path.posix.normalize('xl/' + rel.Target))
        if (!file) throw new Error(`无法读取工作表“${metadata.name}”的内容。`)
        const sheet = new WorksheetReader({ workbook: reader, id: metadata.id, iterator: file.nodeStream(), options: reader.options })
        sheet.name = metadata.name

        let totalRows = 0, totalColumns = 0, cellTextTruncated = false
        const rows = [], selected = args.action === 'read' && (args.sheet ? sheet.name === args.sheet : sheets.length === 0)
        for await (const row of sheet) {
          totalRows = Math.max(totalRows, row.number); totalColumns = Math.max(totalColumns, row.cellCount)
          if (selected && row.number >= start && row.number < start + count) {
            const values = []
            for (let col = 1; col <= Math.min(row.cellCount, 100); col++) {
              const cell = row.getCell(col); let value = cell.value
              if (cell.formula) value = { formula: cell.formula, cachedResult: cell.result ?? null }
              else if (value instanceof Date) value = value.toISOString()
              else if (value?.richText) value = value.richText.map(t => t.text).join('')
              else if (value && typeof value === 'object') value = cell.text
              if (typeof value === 'string' && value.length > 4000) { cellTextTruncated = true; value = value.slice(0, 4000) }
              values.push(value ?? null)
            }
            rows.push({ row: row.number, values })
          }
        }
        sheets.push({ name: sheet.name, rows: totalRows, columns: totalColumns })
        if (selected) {
          const indexed = new Map(rows.map(row => [row.row, row.values]))
          const padded = []
          for (let row = start; row <= Math.min(totalRows, start + count - 1); row++) {
            const values = indexed.get(row) || []; while (values.length < Math.min(totalColumns,100)) values.push(null)
            padded.push({row,values})
          }
          result = { sheet: sheet.name, rows: padded, totalRows, totalColumns, nextRow: start + count <= totalRows ? start + count : null, columnsTruncated: totalColumns > 100, cellTextTruncated, formulaCalculation: false }
        }
      }
      if (args.action === 'inspect') return { sheets, engine: 'ExcelJS 4.4.0', formulaCalculation: false }
      if (!result) throw new Error(`工作表“${args.sheet || ''}”不存在。可用工作表：${sheets.map(s => s.name).join('、')}。请使用准确名称。`)
      if (JSON.stringify(result).length > 200_000) throw new Error('结果过大，请减少 rowCount 分页读取。')
      return result
    }
    await workbook.xlsx.load(bytes)
  }
  const output = toolFile(workspace, args.output, { output: true })
  if (path.extname(output).toLowerCase() !== '.xlsx') throw new Error('输出文件必须使用 .xlsx 扩展名。')
  if (args.action === 'create') {
    if (!Array.isArray(args.sheets) || !args.sheets.length || args.sheets.length > 20) throw new Error('请提供 1–20 个工作表。')
    let total = 0
    for (const input of args.sheets) {
      if (typeof input.name !== 'string' || !input.name || input.name.length > 31 || /[\\/*?:\[\]]/.test(input.name) || workbook.getWorksheet(input.name)) throw new Error('工作表名称无效或重复。')
      if (!Array.isArray(input.rows)) throw new Error('rows 必须为二维数组。')
      const sheet = workbook.addWorksheet(input.name)
      for (const row of input.rows) {
        if (!Array.isArray(row) || row.length > 100 || row.some(v => !scalar(v) || typeof v === 'string' && v.length > 32767)) throw new Error('每行最多 100 列，值只能为文字、数字、布尔或 null。')
        total += row.length
        if (total > 20000) throw new Error('单次创建最多 20000 个单元格，请拆分或随后 update。')
        sheet.addRow(row)
      }
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
      sheet.getRow(1).font = { bold: true }
      sheet.columns.forEach(column => { column.width = 20 })
    }
  } else {
    const sheet = workbook.getWorksheet(args.sheet)
    if (!sheet) throw new Error('工作表不存在，请先 inspect。')
    if (!Array.isArray(args.cells) || args.cells.length > 2000) throw new Error('请提供最多 2000 个 cells。')
    for (const change of args.cells) {
      if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(change.address || '')) throw new Error('单元格地址必须为 A1 格式。')
      const cell = sheet.getCell(change.address)
      if (cell.col > 16384 || cell.row > 1048576) throw new Error('单元格地址超过 Excel 范围。')
      if (change.formula !== undefined) {
        if (typeof change.formula !== 'string' || !change.formula || change.formula.length > 8000 || /[\[\]|]/.test(change.formula) || /(?:HYPERLINK|WEBSERVICE|RTD|DDE)\s*\(/i.test(change.formula)) throw new Error('公式含外部引用或不支持的内容。')
        cell.value = { formula: change.formula.replace(/^=/, '') }
      } else if (Object.hasOwn(change, 'value')) {
        if (!scalar(change.value) || typeof change.value === 'string' && change.value.length > 32767) throw new Error('单元格值无效。')
        cell.value = change.value
      }
      if (change.numFmt !== undefined) {
        if (typeof change.numFmt !== 'string' || change.numFmt.length > 200) throw new Error('数字格式无效。')
        cell.numFmt = change.numFmt
      }
    }
  }
  workbook.calcProperties.fullCalcOnLoad = true
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
  // Re-open the exact bytes to validate workbook structure before parent commit.
  const checked = new ExcelJS.Workbook(); await checked.xlsx.load(bytes)
  return { output: args.output, bytes, sheets: checked.worksheets.map(s => ({ name: s.name, rows: s.rowCount, columns: s.columnCount })), formulaCalculation: false }
}

run().then(value => parentPort.postMessage({ value }), error => parentPort.postMessage({ error: String(error.message || error) }))
