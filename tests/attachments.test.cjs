'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const { discardDraftImage, extractAttachmentText, inspectAttachmentPath, materializeAttachment, savePastedImage } = require('../desktop/services/attachments.cjs')

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

test('PNG images expose a bounded preview and pasted screenshots stay in a removable workspace draft', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-image-attachment-'))
  try {
    const workspace = path.join(root, 'workspace')
    const draftRoot = path.join(workspace, '.stable', 'draft-images')
    mkdirSync(workspace)
    const selectedPath = path.join(root, 'selected.png')
    writeFileSync(selectedPath, ONE_PIXEL_PNG)
    const selected = inspectAttachmentPath(selectedPath)
    assert.equal(selected.type, 'png')
    assert.equal(selected.mediaType, 'image/png')
    assert.match(selected.previewUrl, /^data:image\/png;base64,/)

    const pasted = savePastedImage({ name: '截图.png', mediaType: 'image/png', data: ONE_PIXEL_PNG }, draftRoot, workspace)
    assert.equal(pasted.draft, true)
    assert.ok(pasted.path.startsWith(draftRoot))
    assert.equal(existsSync(pasted.path), true)
    assert.equal(discardDraftImage(pasted.path, draftRoot, workspace), true)
    assert.equal(existsSync(pasted.path), false)

    const fakeImage = path.join(root, 'fake.jpg')
    writeFileSync(fakeImage, 'not an image')
    assert.throws(() => inspectAttachmentPath(fakeImage), /不是有效的 PNG、JPG 或 WebP/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

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
    const workspace = path.join(root, 'workspace')
    const workspaceRoot = path.join(workspace, '.stable', 'attachments')
    mkdirSync(sourceRoot, { recursive: true }); mkdirSync(workspace)
    const archive = new JSZip()
    archive.file('packages/tool.whl', 'wheel bytes')
    const sourcePath = path.join(sourceRoot, 'cli-package.zip')
    writeFileSync(sourcePath, await archive.generateAsync({ type: 'nodebuffer' }))
    const materialized = materializeAttachment(sourcePath, workspaceRoot, workspace)
    assert.equal(materialized.type, 'zip')
    assert.equal(materialized.name, 'cli-package.zip')
    assert.ok(materialized.path.startsWith(workspaceRoot))
    const escaped = path.join(root, 'escaped')
    const unsafeWorkspace = path.join(root, 'unsafe-workspace')
    mkdirSync(escaped); mkdirSync(unsafeWorkspace)
    symlinkSync(escaped, path.join(unsafeWorkspace, '.stable'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => materializeAttachment(sourcePath, path.join(unsafeWorkspace, '.stable', 'attachments'), unsafeWorkspace), /Junction 或符号链接/)
    assert.deepEqual(readdirSync(escaped), [])
    rmSync(sourceRoot, { recursive: true, force: true })
    const copiedArchive = await JSZip.loadAsync(readFileSync(materialized.path))
    assert.ok(copiedArchive.file('packages/tool.whl'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('large source files stay byte-for-byte complete after workspace materialization', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-large-materialized-'))
  try {
    const sourceRoot = path.join(root, 'outside')
    const workspace = path.join(root, 'workspace')
    const workspaceRoot = path.join(workspace, '.stable', 'attachments')
    mkdirSync(sourceRoot, { recursive: true }); mkdirSync(workspace)
    const sourcePath = path.join(sourceRoot, 'large.txt')
    const content = `HEAD\n${'正文'.repeat(180_000)}\nTAIL-BEYOND-PREVIEW`
    writeFileSync(sourcePath, content, 'utf8')
    const materialized = materializeAttachment(sourcePath, workspaceRoot, workspace)
    assert.equal(readFileSync(materialized.path, 'utf8'), content)
    assert.match(readFileSync(materialized.path, 'utf8'), /TAIL-BEYOND-PREVIEW$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('folder and ZIP extracted previews include headings within the 300000 character budget', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-large-container-preview-'))
  try {
    const folder = path.join(root, 'folder')
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, 'large.md'), `# Head\n${'A'.repeat(310_000)}`, 'utf8')
    const folderPreview = await extractAttachmentText(folder)
    assert.ok(folderPreview.text.length <= 300_000, `folder preview was ${folderPreview.text.length} characters`)

    const archive = new JSZip()
    archive.file('large.md', `# Head\n${'B'.repeat(310_000)}`)
    const zipPath = path.join(root, 'large.zip')
    writeFileSync(zipPath, await archive.generateAsync({ type: 'nodebuffer' }))
    const zipPreview = await extractAttachmentText(zipPath)
    assert.ok(zipPreview.text.length <= 300_000, `ZIP preview was ${zipPreview.text.length} characters`)
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
