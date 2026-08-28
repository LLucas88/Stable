'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const { extractAttachmentText, inspectAttachmentPath, materializeAttachment } = require('../desktop/services/attachments.cjs')

test('ordinary folders are accepted as temporary attachments without Skill metadata', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-folder-attachment-'))
  try {
    const source = path.join(root, 'project')
    mkdirSync(path.join(source, 'src'), { recursive: true })
    writeFileSync(path.join(source, 'README.md'), '# Project\nFolder attachment works.', 'utf8')
    writeFileSync(path.join(source, 'src', 'index.ts'), 'export const ready = true', 'utf8')
    const inspected = inspectAttachmentPath(source)
    assert.equal(inspected.type, 'folder')
    assert.equal(inspected.name, 'project')
    const extracted = await extractAttachmentText(source)
    assert.match(extracted.text, /README\.md/)
    assert.match(extracted.text, /Folder attachment works/)
    assert.match(extracted.text, /src[\\/]index\.ts/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ZIP files are accepted and readable text entries are added to attachment context', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-zip-attachment-'))
  try {
    const archive = new JSZip()
    archive.file('notes/brief.md', '# Brief\nZIP attachment works.')
    archive.file('src/app.ts', 'export const version = 28')
    const zipPath = path.join(root, 'project.zip')
    writeFileSync(zipPath, await archive.generateAsync({ type: 'nodebuffer' }))
    assert.equal(inspectAttachmentPath(zipPath).type, 'zip')
    const extracted = await extractAttachmentText(zipPath)
    assert.match(extracted.text, /notes\/brief\.md/)
    assert.match(extracted.text, /ZIP attachment works/)
    assert.match(extracted.text, /src\/app\.ts/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('selected ZIP files are materialized into an isolated workspace path for agent tools', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-zip-materialized-'))
  try {
    const sourceRoot = path.join(root, 'outside')
    const workspaceRoot = path.join(root, 'workspace', '.stable', 'attachments')
    mkdirSync(sourceRoot, { recursive: true })
    const archive = new JSZip()
    archive.file('packages/tool.whl', 'wheel bytes')
    const sourcePath = path.join(sourceRoot, 'cli-package.zip')
    writeFileSync(sourcePath, await archive.generateAsync({ type: 'nodebuffer' }))
    const materialized = materializeAttachment(sourcePath, workspaceRoot)
    assert.equal(materialized.type, 'zip')
    assert.equal(materialized.name, 'cli-package.zip')
    assert.ok(materialized.path.startsWith(workspaceRoot))
    rmSync(sourceRoot, { recursive: true, force: true })
    const copiedArchive = await JSZip.loadAsync(readFileSync(materialized.path))
    assert.ok(copiedArchive.file('packages/tool.whl'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ZIP traversal paths are rejected', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-zip-unsafe-'))
  try {
    const archive = new JSZip()
    archive.file('../escape.md', 'unsafe')
    const zipPath = path.join(root, 'unsafe.zip')
    writeFileSync(zipPath, await archive.generateAsync({ type: 'nodebuffer' }))
    await assert.rejects(() => extractAttachmentText(zipPath), /不安全的路径/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
