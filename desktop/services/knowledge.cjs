'use strict'

const { copyFileSync, lstatSync, mkdirSync, readdirSync, statSync } = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const MAX_DOCUMENT_BYTES = 2_000_000
const MAX_DOCUMENTS = 500

function collectMarkdownFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (lstatSync(target).isSymbolicLink()) throw new Error('知识库文件夹不能包含符号链接。')
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(target)
      if (files.length > MAX_DOCUMENTS) throw new Error(`一次最多导入 ${MAX_DOCUMENTS} 个 Markdown 文件。`)
    }
  }
  visit(root)
  return files
}

function copyMarkdownDocuments(sourcePaths, destinationRoot, sourceRoot = '') {
  if (sourcePaths.length > MAX_DOCUMENTS) throw new Error(`一次最多导入 ${MAX_DOCUMENTS} 个 Markdown 文件。`)
  const documents = sourcePaths.map((sourcePath) => {
    const extension = path.extname(sourcePath).toLowerCase()
    if (!MARKDOWN_EXTENSIONS.has(extension)) throw new Error('知识库只支持 MD 和 MARKDOWN 文件。')
    const size = statSync(sourcePath).size
    if (size > MAX_DOCUMENT_BYTES) throw new Error(`“${path.basename(sourcePath)}”超过 2 MB，未导入。`)
    return { sourcePath, extension, size }
  })
  mkdirSync(destinationRoot, { recursive: true })
  return documents.map(({ sourcePath, extension, size }) => {
    const targetPath = path.join(destinationRoot, `${randomUUID()}${extension}`)
    copyFileSync(sourcePath, targetPath)
    return {
      name: sourceRoot ? path.relative(sourceRoot, sourcePath).replace(/\\/g, '/') : path.basename(sourcePath),
      path: targetPath,
      size,
    }
  })
}

module.exports = { collectMarkdownFiles, copyMarkdownDocuments, MARKDOWN_EXTENSIONS }
