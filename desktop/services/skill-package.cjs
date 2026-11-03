'use strict'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), JSZip = require('jszip')
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
const MAX_ARCHIVE = 160 * 1024 * 1024, MAX_EXPANDED = 256 * 1024 * 1024
function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..' || /[:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('技能资源包含不安全路径。')
  return name
}
function validatePackage(pkg) {
  if (!pkg || !/^[a-f0-9]{64}$/.test(pkg.sha256) || !Number.isSafeInteger(pkg.bytes) || pkg.bytes < 1 || pkg.bytes > MAX_ARCHIVE || !pkg.files || Object.keys(pkg.files).length > 10000 || !Object.keys(pkg.files).length) throw Error('技能资源清单无效。')
  const names = new Set()
  for (const [name, hash] of Object.entries(pkg.files)) {
    safeName(name)
    if (!/^[a-f0-9]{64}$/.test(hash) || names.has(name.toLowerCase())) throw Error('技能文件清单无效。')
    names.add(name.toLowerCase())
  }
}
function verifyDirectory(root, pkg) {
  try {
    if (fs.lstatSync(root).isSymbolicLink()) return false
    for (const [name, hash] of Object.entries(pkg.files)) {
      let current = root
      for (const part of name.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) return false }
      if (digest(fs.readFileSync(current)) !== hash) return false
    }
    return true
  } catch { return false }
}
async function extractPackage(archive, base, pkg) {
  validatePackage(pkg)
  if (archive.length !== pkg.bytes || digest(archive) !== pkg.sha256) throw Error('技能下载文件未通过完整性校验。')
  const zip = await JSZip.loadAsync(archive), names = new Set(); let advertised = 0
  for (const entry of Object.values(zip.files)) {
    const name = entry.unsafeOriginalName || entry.name
    safeName(entry.dir ? name.replace(/\/$/, '') : name)
    if ((Number(entry.unixPermissions) & 0o170000) === 0o120000) throw Error('技能资源不能包含符号链接。')
    if (entry.dir) continue
    if (!Object.hasOwn(pkg.files, name) || names.has(name.toLowerCase())) throw Error('技能压缩包包含未登记或重复文件。')
    names.add(name.toLowerCase()); advertised += Number(entry._data?.uncompressedSize) || 0
    if (advertised > MAX_EXPANDED) throw Error('技能解压大小超限。')
  }
  if (names.size !== Object.keys(pkg.files).length) throw Error('技能压缩包缺少资源。')
  fs.mkdirSync(base, { recursive: true })
  if (fs.lstatSync(base).isSymbolicLink()) throw Error('技能缓存目录不能是符号链接。')
  const staging = fs.mkdtempSync(path.join(base, '.install-')), target = path.join(base, pkg.sha256)
  try {
    let total = 0
    for (const [name, hash] of Object.entries(pkg.files)) {
      const data = await zip.file(name).async('nodebuffer'); total += data.length
      if (total > MAX_EXPANDED || digest(data) !== hash) throw Error('技能资源文件校验失败。')
      const file = path.join(staging, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data, { flag: 'wx' })
    }
    if (fs.existsSync(target)) {
      if (!verifyDirectory(target, pkg)) throw Error('已缓存资源被修改，请保留本地修改后再修复；未覆盖原文件。')
    } else fs.renameSync(staging, target)
    return target
  } finally { fs.rmSync(staging, { recursive: true, force: true }) }
}
function cacheLocalPackage(source, base, pkg) {
  validatePackage(pkg)
  if (!verifyDirectory(source, pkg)) throw Error('旧版技能资源不完整或已修改，未自动迁移。')
  fs.mkdirSync(base, { recursive: true })
  if (fs.lstatSync(base).isSymbolicLink()) throw Error('技能缓存目录不能是符号链接。')
  const target = path.join(base, pkg.sha256)
  if (fs.existsSync(target)) {
    if (!verifyDirectory(target, pkg)) throw Error('已有缓存被修改，未覆盖。')
    return target
  }
  const staging = fs.mkdtempSync(path.join(base, '.migrate-'))
  try {
    for (const name of Object.keys(pkg.files)) {
      const file = path.join(staging, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(path.join(source, name), file)
    }
    if (!verifyDirectory(staging, pkg)) throw Error('旧版资源复制校验失败。')
    fs.renameSync(staging, target)
    return target
  } finally { fs.rmSync(staging, { recursive: true, force: true }) }
}
module.exports = { digest, safeName, validatePackage, verifyDirectory, extractPackage, cacheLocalPackage, MAX_ARCHIVE }
