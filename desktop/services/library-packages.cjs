'use strict'

const {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const JSZip = require('jszip')

const SCRIPT_EXTENSIONS = new Set(['.py', '.ps1', '.cmd', '.bat'])
const MAX_PACKAGE_FILES = 20_000
const MAX_PACKAGE_BYTES = 1_000_000_000

function isInside(root, target, allowRoot = false) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return (allowRoot && relative === '') || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function requireScriptPath(filePath, root) {
  if (!SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) throw new Error('入口文件必须是 PY、PS1、CMD 或 BAT 脚本。')
  if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error('找不到选择的入口脚本。')
  if (root && !isInside(root, filePath)) throw new Error('入口脚本必须位于所选脚本文件夹内。')
  return filePath
}

function scanPackage(root) {
  let fileCount = 0
  let totalBytes = 0
  const scripts = []
  const directoryLinks = []
  const visited = new Set()
  const visit = (directory, collectScripts = true, collectLinks = true) => {
    const realDirectory = realpathSync(directory)
    if (visited.has(realDirectory)) return
    visited.add(realDirectory)
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      const info = lstatSync(target)
      if (info.isSymbolicLink()) {
        if (statSync(target).isDirectory()) {
          const linkTarget = realpathSync(target)
          if (collectLinks) directoryLinks.push({ path: target, target: linkTarget })
          visit(linkTarget, false, false)
          continue
        }
        throw new Error('脚本包不能包含文件符号链接。请改为导入普通文件。')
      }
      if (info.isDirectory()) {
        visit(target, collectScripts, collectLinks)
        continue
      }
      if (!info.isFile()) continue
      fileCount += 1
      totalBytes += info.size
      if (fileCount > MAX_PACKAGE_FILES) throw new Error(`脚本包文件数量不能超过 ${MAX_PACKAGE_FILES.toLocaleString('zh-CN')} 个。`)
      if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('脚本包解压后不能超过 1 GB。')
      if (collectScripts && SCRIPT_EXTENSIONS.has(path.extname(target).toLowerCase())) scripts.push(target)
    }
  }
  visit(root)
  return { fileCount, totalBytes, scripts, directoryLinks }
}

function copySingleScript(sourcePath, destinationRoot) {
  requireScriptPath(sourcePath)
  mkdirSync(destinationRoot, { recursive: true })
  const targetPath = path.join(destinationRoot, path.basename(sourcePath))
  copyFileSync(sourcePath, targetPath)
  return targetPath
}

function copyScriptFolder(sourceRoot, destinationRoot, entryPath) {
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) throw new Error('找不到选择的脚本文件夹。')
  requireScriptPath(entryPath, sourceRoot)
  const { directoryLinks } = scanPackage(sourceRoot)
  mkdirSync(path.dirname(destinationRoot), { recursive: true })
  if (process.platform === 'win32') {
    const result = spawnSync('robocopy.exe', [
      sourceRoot,
      destinationRoot,
      '/E',
      '/COPY:DAT',
      '/DCOPY:DA',
      '/R:1',
      '/W:1',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NP',
      '/XJ',
    ], { windowsHide: true, encoding: 'utf8' })
    if (result.error) throw new Error(`复制脚本包失败：${result.error.message}`)
    if (result.status === null || result.status >= 8) throw new Error(`复制脚本包失败（Robocopy 退出码 ${result.status ?? '未知'}）。`)
  } else {
    cpSync(sourceRoot, destinationRoot, { recursive: true, errorOnExist: true, force: false, filter: (source) => !lstatSync(source).isSymbolicLink() })
  }
  for (const link of directoryLinks) {
    const target = path.join(destinationRoot, path.relative(sourceRoot, link.path))
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(link.target, target, { recursive: true, errorOnExist: true, force: false, dereference: true })
  }
  return path.join(destinationRoot, path.relative(sourceRoot, entryPath))
}

function migrateScriptPackage(entryPath, category, destinationRoot) {
  requireScriptPath(entryPath)
  let sourceRoot = path.dirname(path.resolve(entryPath))
  while (path.dirname(sourceRoot) !== sourceRoot) {
    const categoryRoot = path.dirname(sourceRoot)
    if (path.basename(categoryRoot).toLowerCase() === category.toLowerCase()
      && path.basename(path.dirname(categoryRoot)).toLowerCase() === 'data-library') {
      return copyScriptFolder(sourceRoot, destinationRoot, entryPath)
    }
    sourceRoot = categoryRoot
  }
  throw new Error('旧脚本路径不是可识别的 Stable 脚本包。')
}

function safeZipName(entry) {
  const original = String(entry.unsafeOriginalName || entry.name || '').replace(/\\/g, '/')
  const normalized = path.posix.normalize(original)
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) {
    throw new Error(`ZIP 中包含不安全的路径：${original || '(空路径)'}`)
  }
  const mode = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0
  if ((mode & 0o170000) === 0o120000) throw new Error(`ZIP 中包含符号链接：${original}`)
  return normalized
}

async function extractScriptZip(zipPath, destinationRoot) {
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) throw new Error('找不到选择的 ZIP 文件。')
  if (statSync(zipPath).size > MAX_PACKAGE_BYTES) throw new Error('ZIP 文件不能超过 1 GB。')
  const archive = await JSZip.loadAsync(readFileSync(zipPath), { createFolders: true })
  const entries = Object.values(archive.files)
  if (entries.length > MAX_PACKAGE_FILES) throw new Error(`ZIP 文件数量不能超过 ${MAX_PACKAGE_FILES.toLocaleString('zh-CN')} 个。`)
  mkdirSync(destinationRoot, { recursive: true })
  let totalBytes = 0
  for (const entry of entries) {
    const relative = safeZipName(entry)
    const target = path.join(destinationRoot, ...relative.split('/'))
    if (!isInside(destinationRoot, target)) throw new Error(`ZIP 中包含越界路径：${relative}`)
    if (entry.dir) {
      mkdirSync(target, { recursive: true })
      continue
    }
    const content = await entry.async('nodebuffer')
    totalBytes += content.length
    if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('ZIP 解压后不能超过 1 GB。')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  const result = scanPackage(destinationRoot)
  if (!result.scripts.length) throw new Error('ZIP 中没有找到 PY、PS1、CMD 或 BAT 入口脚本。')
  return result
}

function removeStoredAsset(libraryRoot, itemPath) {
  if (!isInside(libraryRoot, itemPath)) throw new Error('资产路径不在 Stable 私有目录内，已停止删除。')
  const relative = path.relative(libraryRoot, itemPath)
  const firstSegment = relative.split(path.sep)[0]
  const target = relative.includes(path.sep) ? path.join(libraryRoot, firstSegment) : itemPath
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  return target
}

function cleanupPackage(target) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
}

module.exports = {
  SCRIPT_EXTENSIONS,
  cleanupPackage,
  copyScriptFolder,
  copySingleScript,
  extractScriptZip,
  isInside,
  migrateScriptPackage,
  removeStoredAsset,
  requireScriptPath,
  scanPackage,
}
