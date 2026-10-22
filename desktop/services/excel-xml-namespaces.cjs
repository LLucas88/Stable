'use strict'
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom')
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const ELEMENT_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://schemas.openxmlformats.org/package/2006/relationships',
  'http://schemas.openxmlformats.org/package/2006/content-types',
])

// ExcelJS matches qualified names rather than namespace URIs. Canonicalize only
// known OOXML names in memory; never strip arbitrary prefixes or touch cell text.
function normalizeExcelXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('工作簿 XML 不支持 DTD 或实体声明。')
  // Ordinary ExcelJS/openpyxl sheets can be large. Preserve the streaming read
  // path without building a DOM when qualified names need no normalization.
  if (!/<\/?[A-Za-z_][\w.-]*:/.test(xml) && !/\s(?!xmlns:|r:)[A-Za-z_][\w.-]*:[\w.-]+\s*=/.test(xml)) return xml
  const fail = message => { throw new Error('工作簿 XML 无效：' + String(message).slice(0, 200)) }
  const doc = new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } }).parseFromString(xml, 'application/xml')
  let changed = false
  function visit(node) {
    if (node.nodeType !== 1) return
    let target = node
    if (node.prefix && ELEMENT_NAMESPACES.has(node.namespaceURI)) {
      target = doc.createElementNS(node.namespaceURI, node.localName)
      for (const attr of Array.from(node.attributes)) target.setAttributeNS(attr.namespaceURI, attr.name, attr.value)
      target.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', node.namespaceURI)
      while (node.firstChild) target.appendChild(node.firstChild)
      node.parentNode.replaceChild(target, node); changed = true
    }
    for (const attr of Array.from(target.attributes)) {
      if (attr.namespaceURI === RELATIONSHIPS && attr.prefix !== 'r') {
        target.removeAttributeNode(attr)
        target.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:r', RELATIONSHIPS)
        target.setAttributeNS(RELATIONSHIPS, 'r:' + attr.localName, attr.value)
        changed = true
      }
    }
    for (const child of Array.from(target.childNodes)) visit(child)
  }
  visit(doc.documentElement)
  return changed ? new XMLSerializer().serializeToString(doc) : xml
}
async function normalizeWorkbookNamespaces(zip) {
  let changed = false
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^(?:\[Content_Types\]\.xml|_rels\/.*\.rels|xl\/(?:workbook\.xml|styles\.xml|sharedStrings\.xml|_rels\/.*\.rels|worksheets\/[^/]+\.xml))$/.test(entry.name)) continue
    const xml = await entry.async('string'), normalized = normalizeExcelXml(xml)
    if (xml !== normalized) { zip.file(entry.name, normalized); changed = true }
  }
  return changed
}
module.exports = { normalizeExcelXml, normalizeWorkbookNamespaces }
