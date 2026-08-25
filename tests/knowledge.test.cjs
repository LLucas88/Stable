'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { collectMarkdownFiles, copyMarkdownDocuments } = require('../desktop/services/knowledge.cjs')

test('knowledge import collects nested Markdown and copies private files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-knowledge-'))
  const source = path.join(root, 'source')
  const nested = path.join(source, 'CRM')
  const destination = path.join(root, 'private')
  mkdirSync(nested, { recursive: true })
  writeFileSync(path.join(source, 'index.md'), '# 索引', 'utf8')
  writeFileSync(path.join(nested, '复购.markdown'), '# 第二单', 'utf8')
  writeFileSync(path.join(nested, 'ignore.txt'), '不导入', 'utf8')
  try {
    const files = collectMarkdownFiles(source)
    const copied = copyMarkdownDocuments(files, destination, source)
    assert.deepEqual(copied.map((item) => item.name).sort(), ['CRM/复购.markdown', 'index.md'])
    assert.ok(copied.every((item) => existsSync(item.path)))
    assert.match(readFileSync(copied.find((item) => item.name.endsWith('复购.markdown')).path, 'utf8'), /第二单/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
