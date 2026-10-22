'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const ExcelJS = require('../vendor/agent-tools/node_modules/exceljs'), JSZip = require('../vendor/agent-tools/node_modules/jszip')
const { executeExcel } = require('../desktop/services/excel-tool.cjs')
const { normalizeExcelXml } = require('../desktop/services/excel-xml-namespaces.cjs')
test('namespace normalization respects URI bindings and rejects entity declarations', () => {
  const xml = '<x:root xmlns:x="urn:unrelated"><x:t>literal x:row &amp; &lt;x:c&gt;</x:t></x:root>'
  assert.equal(normalizeExcelXml(xml), xml)
  const scoped = '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:ext xmlns:x="urn:unrelated">x:row</x:ext></x:worksheet>'
  assert.match(normalizeExcelXml(scoped), /<x:ext xmlns:x="urn:unrelated">x:row<\/x:ext>/)
  assert.throws(() => normalizeExcelXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]><x>&e;</x>'), /DTD/)
  const conflict = '<s:workbook xmlns="urn:other" xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="urn:other" xmlns:q="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><s:sheet name="one" q:id="rId1"/></s:workbook>'
  const normalized = normalizeExcelXml(conflict)
  assert.equal(normalizeExcelXml(normalized), normalized, 'normalization stays valid and idempotent with a conflicting default binding')
})
test('prefixed SpreadsheetML and relationship names preserve cells, formulas and originals', async t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-xlsx-ns-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('事实 & 来源')
  sheet.addRow(['字段', '值']); sheet.addRow(['x:literal <x:cell> & 文本', 123.125]); sheet.getCell('B3').value = { formula: 'B2*2', result: 246.25 }
  const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer())
  for (const item of Object.values(zip.files).filter(x => /\.xml$|\.rels$/.test(x.name))) {
    let xml = await item.async('string'), ns = /xmlns="([^"]+)"/.exec(xml)?.[1]
    if (!ns || !/spreadsheetml|package\/2006\/relationships/.test(ns)) continue
    xml = xml.replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2')
    xml = xml.replace(/<x:([\w.-]+)/, `<x:$1 xmlns:x="${ns}"`)
    if (item.name === 'xl/workbook.xml') xml = xml.replace('<x:workbook ', '<x:workbook xmlns:link="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ').replace(/r:id=/g, 'link:id=')
    zip.file(item.name, xml)
  }
  const original = await zip.generateAsync({ type: 'nodebuffer' }); fs.writeFileSync(path.join(workspace, 'input.xlsx'), original)
  const execute = args => executeExcel({ workspace, dependencyRoot: path.resolve(__dirname, '../vendor/agent-tools'), args })
  assert.deepEqual((await execute({ action: 'inspect', path: 'input.xlsx' })).sheets, [{ name: '事实 & 来源', rows: 3, columns: 2 }])
  const rows = (await execute({ action: 'read', path: 'input.xlsx', startRow: 2, rowCount: 2 })).rows
  assert.deepEqual(rows[0].values, ['x:literal <x:cell> & 文本', 123.125])
  assert.deepEqual(rows[1].values[1], { formula: 'B2*2', cachedResult: 246.25 })
  await execute({ action: 'update', path: 'input.xlsx', output: 'updated.xlsx', sheet: '事实 & 来源', cells: [{ address: 'B2', value: 10 }] })
  assert.equal((await execute({ action: 'read', path: 'updated.xlsx', startRow: 2, rowCount: 1 })).rows[0].values[1], 10)
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'input.xlsx')), original)
})
