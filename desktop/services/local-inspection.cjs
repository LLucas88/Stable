'use strict'
const fs = require('node:fs')
const path = require('node:path')
const abort = signal => signal?.throwIfAborted()

function withFile(file, resolve, fn) {
  const target = resolve(file), before = fs.statSync(target)
  if (!before.isFile()) throw Error('需要普通文件。')
  const fd = fs.openSync(target, 'r')
  try {
    const actual = fs.fstatSync(fd)
    if (resolve(file) !== target || actual.dev !== before.dev || actual.ino !== before.ino) throw Error('读取期间文件路径已变化，请重新检查。')
    const result = fn(fd, actual), after = fs.fstatSync(fd)
    if (actual.size !== after.size || actual.mtimeMs !== after.mtimeMs) throw Error('读取期间文件内容已变化，请重新检查。')
    return result
  } finally { fs.closeSync(fd) }
}

async function listFiles(args, { resolve, signal }) {
  const root = resolve(args.path), pattern = args.pattern || '**/*'
  const offset = args.offset || 0, limit = args.limit || 100
  const matches = [], excluded = []
  let visited = 0, matched = 0, truncated = false, excludedCount = 0
  const skip = (file, reason) => { excludedCount++; if (excluded.length < 30) excluded.push({ path: file.slice(0, 512), pathTruncated: file.length > 512, reason }) }
  async function walk(directory) {
    abort(signal)
    const relativeDir = path.relative(root, directory).replaceAll('\\', '/')
    try {
      if (fs.lstatSync(directory).isSymbolicLink()) { skip(relativeDir, 'link-not-followed'); return }
      if (resolve(directory) !== directory) { skip(relativeDir, 'path-changed'); return }
      const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
      for (const entry of entries) {
        abort(signal)
        if (++visited > 30000) { truncated = true; return }
        if (visited % 128 === 0) { await new Promise(resolve => setImmediate(resolve)); abort(signal) }
        const file = path.join(directory, entry.name), relative = path.relative(root, file).replaceAll('\\', '/')
        if (entry.isSymbolicLink()) { skip(relative, 'link-not-followed'); continue }
        if (entry.isFile() && path.matchesGlob(relative, pattern)) {
          if (matched++ >= offset) matches.push(relative)
          if (matches.length > limit) return
        }
        if (entry.isDirectory() && args.recursive !== false) await walk(file)
        if (truncated || matches.length > limit) return
      }
    } catch (error) {
      abort(signal)
      if (!relativeDir) throw error
      skip(relativeDir, error.code || 'unreadable-or-outside-root')
    }
  }
  await walk(root)
  const files = matches.slice(0, limit)
  while (files.length > 1 && Buffer.byteLength(JSON.stringify(files)) > 20000) files.pop()
  const more = matches.length > files.length
  return { root, files, nextOffset: more ? offset + files.length : null,
    truncated, excludedCount, excluded, complete: !more && !truncated && !excludedCount,
    note: '不跟随目录链接；排除项和扫描上限均已披露。分页期间目录变化时请从头枚举。' }
}

function readText(args, context) {
  abort(context.signal)
  return withFile(args.path, context.resolve, (fd, stat) => {
    const offset = args.offset || 0, limit = args.bytes || 16384
    if (offset > stat.size) throw Error('offset 超出文件大小。')
    const buffer = Buffer.alloc(Math.min(limit, stat.size - offset))
    const size = fs.readSync(fd, buffer, 0, buffer.length, offset), atEnd = offset + size === stat.size
    let text
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, size), { stream: !atEnd }) }
    catch { throw Error('文件不是 UTF-8 文本，或 offset 不在字符边界；请使用上次返回的 nextOffset。') }
    const next = offset + Buffer.byteLength(text)
    return { text, offset, bytes: next - offset, totalBytes: stat.size, nextOffset: next < stat.size ? next : null, truncated: next < stat.size }
  })
}

function inspectJson(args, context) {
  abort(context.signal)
  return withFile(args.path, context.resolve, (fd, stat) => {
    if (stat.size > 32 * 1024 * 1024) throw Error('结构检查最多解析 32 MB JSON；更大文件请使用字节分页或专用流式解析。')
    const buffer = Buffer.alloc(stat.size)
    let read = 0
    while (read < buffer.length) {
      abort(context.signal)
      const n = fs.readSync(fd, buffer, read, buffer.length - read, read)
      if (!n) throw Error('JSON 读取期间被截断。')
      read += n
    }
    let value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
    const pointer = args.pointer || ''
    if (pointer && !pointer.startsWith('/')) throw Error('pointer 必须为 JSON Pointer，例如 /sheets/0。')
    for (const part of pointer ? pointer.slice(1).split('/') : []) {
      if (/~(?![01])/u.test(part)) throw Error('JSON Pointer 转义无效。')
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~')
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw Error('JSON Pointer 对应的字段不存在。')
      value = value[key]
    }
    const preview = item => typeof item === 'string' ? { type: 'string', value: item.slice(0, 300), length: item.length, truncated: item.length > 300 }
      : Array.isArray(item) ? { type: 'array', length: item.length }
      : item && typeof item === 'object' ? { type: 'object', length: Object.keys(item).length }
      : { type: item === null ? 'null' : typeof item, value: item }
    const keys = value && typeof value === 'object' ? Object.keys(value) : []
    const offset = args.offset || 0, limit = Math.min(args.limit || 30, 30)
    const entries = keys.slice(offset, offset + limit).map(key => {
      const child = pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')
      return { key: key.slice(0, 200), keyTruncated: key.length > 200,
        pointer: child.length <= 2000 ? child : null, ...preview(value[key]) }
    })
    while (entries.length > 1 && Buffer.byteLength(JSON.stringify(entries)) > 24000) entries.pop()
    return { pointer, ...preview(value), entries,
      nextOffset: offset + entries.length < keys.length ? offset + entries.length : null,
      note: '仅返回此层结构和有界预览；嵌套值须按 pointer 继续检查，不能把预览当作完整数据。' }
  })
}

module.exports = { listFiles, readText, inspectJson }
