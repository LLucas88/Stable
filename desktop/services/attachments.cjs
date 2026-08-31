'use strict'

const { constants: { COPYFILE_EXCL }, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, statSync, unlinkSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const JSZip = require('jszip')
const { SUPPORTED_DATA_EXTENSIONS, extractText, inspectDataFile } = require('./importers.cjs')

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const MAX_ATTACHMENT_FILES = 2_000
const MAX_ATTACHMENT_TEXT = 300_000
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.yaml', '.yml', '.html', '.log', '.xml',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.py', '.ps1', '.bat', '.cmd',
  '.sh', '.sql', '.toml', '.ini', '.conf', '.java', '.go', '.rs', '.c', '.cc', '.cpp',
  '.h', '.hpp', '.vue', '.svelte',
])
const READABLE_FILE_EXTENSIONS = new Set([...TEXT_FILE_EXTENSIONS, ...SUPPORTED_DATA_EXTENSIONS])

function validateSource(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim() || !existsSync(sourcePath)) throw new Error('找不到要添加的附件。')
  return sourcePath
}

function scanAttachmentFolder(sourcePath) {
  validateSource(sourcePath)
  if (!statSync(sourcePath).isDirectory()) throw new Error('选择的路径不是文件夹。')
  let size = 0
  let fileCount = 0
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      const info = lstatSync(target)
      if (info.isSymbolicLink()) throw new Error(`附件文件夹不能包含符号链接：“${entry.name}”。`)
      if (info.isDirectory()) visit(target)
      else if (info.isFile()) {
        size += info.size
        fileCount += 1
        files.push({ path: target, relativePath: path.relative(sourcePath, target) })
      }
      if (size > MAX_ATTACHMENT_BYTES) throw new Error('附件文件夹不能超过 100 MB。')
      if (fileCount > MAX_ATTACHMENT_FILES) throw new Error('附件文件夹不能超过 2000 个文件。')
    }
  }
  visit(sourcePath)
  return { size, fileCount, files }
}

function inspectAttachmentPath(sourcePath) {
  validateSource(sourcePath)
  const info = statSync(sourcePath)
  if (info.isDirectory()) {
    const scanned = scanAttachmentFolder(sourcePath)
    return { name: path.basename(sourcePath), path: sourcePath, size: scanned.size, type: 'folder' }
  }
  if (!info.isFile()) throw new Error('选择的附件既不是文件也不是文件夹。')
  if (path.extname(sourcePath).toLowerCase() !== '.zip') return inspectDataFile(sourcePath)
  if (info.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${path.basename(sourcePath)}”超过 100 MB，未添加。`)
  return { name: path.basename(sourcePath), path: sourcePath, size: info.size, type: 'zip' }
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function ensureAttachmentDestination(destinationRoot, workspaceRoot) {
  if (typeof destinationRoot !== 'string' || !destinationRoot.trim()) throw new Error('缺少附件暂存目录。')
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) throw new Error('缺少 Stable 工作区路径。')
  const workspaceAbsolute = path.resolve(workspaceRoot)
  const destinationAbsolute = path.resolve(destinationRoot)
  if (!isInside(workspaceAbsolute, destinationAbsolute)) throw new Error('附件只能暂存到 Stable 工作区内。')
  if (!existsSync(workspaceAbsolute) || !statSync(workspaceAbsolute).isDirectory()) throw new Error('Stable 工作区不存在。')
  const workspacePath = realpathSync(workspaceAbsolute)
  let current = workspaceAbsolute
  const relative = path.relative(workspaceAbsolute, destinationAbsolute)
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    let info
    try { info = lstatSync(current) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    if (info) {
      if (info.isSymbolicLink()) throw new Error('附件暂存目录不能包含 Junction 或符号链接。')
      if (!info.isDirectory()) throw new Error('附件暂存路径不是文件夹。')
    } else mkdirSync(current)
  }
  const destinationPath = realpathSync(destinationAbsolute)
  if (!isInside(workspacePath, destinationPath)) throw new Error('附件只能暂存到 Stable 工作区内。')
  return { destinationPath, workspacePath }
}

function removeWithoutFollowingLinks(target) {
  let info
  try { info = lstatSync(target) } catch (error) { if (error?.code === 'ENOENT') return; throw error }
  if (info.isSymbolicLink() || !info.isDirectory()) { unlinkSync(target); return }
  for (const name of readdirSync(target)) removeWithoutFollowingLinks(path.join(target, name))
  rmdirSync(target)
}

function removeMaterializedAttachmentRoot(value, workspaceRoot) {
  const workspaceAbsolute = path.resolve(workspaceRoot || '')
  const workspacePath = workspaceRoot && existsSync(workspaceAbsolute) ? realpathSync(workspaceAbsolute) : workspaceAbsolute
  const target = path.resolve(String(value || ''))
  if (!workspaceRoot || (!isInside(workspaceAbsolute, target) && !isInside(workspacePath, target)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path.basename(target))) {
    throw new Error('拒绝清理非 Stable 工作区附件目录。')
  }
  removeWithoutFollowingLinks(target)
}

function materializeAttachment(sourcePath, destinationRoot, workspaceRoot) {
  const inspected = inspectAttachmentPath(sourcePath)
  const destination = ensureAttachmentDestination(destinationRoot, workspaceRoot)
  const itemRoot = path.join(destination.destinationPath, randomUUID())
  const targetPath = path.join(itemRoot, inspected.name)
  mkdirSync(itemRoot)
  try {
    const materializedRoot = realpathSync(itemRoot)
    if (!isInside(destination.workspacePath, materializedRoot)) throw new Error('附件只能暂存到 Stable 工作区内。')
    if (inspected.type === 'folder') cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false })
    else copyFileSync(sourcePath, targetPath, COPYFILE_EXCL)
    const resolvedTarget = realpathSync(targetPath)
    if (!isInside(destination.workspacePath, resolvedTarget)) throw new Error('附件只能暂存到 Stable 工作区内。')
    const materialized = inspectAttachmentPath(resolvedTarget)
    return { ...materialized, name: inspected.name, materializedRoot }
  } catch (error) {
    removeWithoutFollowingLinks(itemRoot)
    throw error
  }
}

function appendText(parts, heading, text, used) {
  if (!text || used >= MAX_ATTACHMENT_TEXT) return used
  const remaining = MAX_ATTACHMENT_TEXT - used
  const prefix = `\n\n## ${heading}\n`
  if (prefix.length >= remaining) {
    const block = prefix.slice(0, remaining)
    parts.push(block)
    return used + block.length
  }
  const block = `${prefix}${String(text).slice(0, remaining - prefix.length)}`
  parts.push(block)
  return used + block.length
}

async function extractBufferText(fileName, buffer) {
  const extension = path.extname(fileName).toLowerCase()
  if (TEXT_FILE_EXTENSIONS.has(extension)) return buffer.toString('utf8')
  if (extension === '.docx') {
    const mammoth = require('mammoth')
    return (await mammoth.extractRawText({ buffer })).value
  }
  if (extension === '.pdf') {
    const pdf = require('pdf-parse')
    return (await pdf(buffer)).text
  }
  if (extension === '.xlsx' || extension === '.xls') {
    const XLSX = require('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    return workbook.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n')
  }
  return ''
}

function safeZipEntryName(value) {
  const original = String(value || '')
  const normalized = original.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`ZIP 中包含不安全的路径：“${original || '(空路径)'}”。`)
  }
  return normalized
}

async function extractFolderText(sourcePath) {
  const scanned = scanAttachmentFolder(sourcePath)
  const readable = scanned.files.filter((item) => READABLE_FILE_EXTENSIONS.has(path.extname(item.path).toLowerCase()))
  const parts = [`文件夹：${path.basename(sourcePath)}\n文件数量：${scanned.fileCount}\n可读取文件：${readable.length}`]
  let used = parts[0].length
  for (const item of readable) {
    if (used >= MAX_ATTACHMENT_TEXT) break
    try {
      const extension = path.extname(item.path).toLowerCase()
      const text = TEXT_FILE_EXTENSIONS.has(extension) && !SUPPORTED_DATA_EXTENSIONS.has(extension)
        ? readFileSync(item.path, 'utf8')
        : (await extractText(item.path)).text
      used = appendText(parts, item.relativePath, text, used)
    } catch (error) {
      used = appendText(parts, item.relativePath, `[无法读取：${error.message}]`, used)
    }
  }
  return { text: parts.join(''), size: scanned.size, type: 'folder' }
}

async function extractZipText(sourcePath) {
  const inspected = inspectAttachmentPath(sourcePath)
  const archive = await JSZip.loadAsync(readFileSync(sourcePath), { createFolders: true })
  const entries = Object.values(archive.files).filter((entry) => !entry.dir)
  if (entries.length > MAX_ATTACHMENT_FILES) throw new Error('ZIP 文件不能超过 2000 个文件。')
  let totalBytes = 0
  for (const entry of entries) {
    safeZipEntryName(entry.unsafeOriginalName || entry.name)
    const declaredSize = Number(entry?._data?.uncompressedSize)
    if (Number.isFinite(declaredSize)) totalBytes += declaredSize
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('ZIP 解压后不能超过 100 MB。')
  }
  const readable = entries.filter((entry) => READABLE_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
  const parts = [`压缩包：${path.basename(sourcePath)}\n文件数量：${entries.length}\n可读取文件：${readable.length}`]
  let used = parts[0].length
  for (const entry of readable) {
    if (used >= MAX_ATTACHMENT_TEXT) break
    const name = safeZipEntryName(entry.unsafeOriginalName || entry.name)
    try {
      const buffer = await entry.async('nodebuffer')
      if (!Number.isFinite(Number(entry?._data?.uncompressedSize))) {
        totalBytes += buffer.length
        if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('ZIP 解压后不能超过 100 MB。')
      }
      used = appendText(parts, name, await extractBufferText(name, buffer), used)
    } catch (error) {
      used = appendText(parts, name, `[无法读取：${error.message}]`, used)
    }
  }
  return { text: parts.join(''), size: inspected.size, type: 'zip' }
}

async function extractAttachmentText(sourcePath) {
  const inspected = inspectAttachmentPath(sourcePath)
  if (inspected.type === 'folder') return extractFolderText(sourcePath)
  if (inspected.type === 'zip') return extractZipText(sourcePath)
  return extractText(sourcePath)
}

module.exports = { extractAttachmentText, inspectAttachmentPath, materializeAttachment, removeMaterializedAttachmentRoot, scanAttachmentFolder, safeZipEntryName }
