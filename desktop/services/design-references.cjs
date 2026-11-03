'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  throw Error('参考图内容不是支持的 PNG、JPEG 或 WebP 图片。')
}
class DesignReferences {
  constructor(directory, nativeImage) { this.directory = directory; this.nativeImage = nativeImage }
  capture(attachments, rootsForFile) {
    const images = attachments.filter(item => TYPES[path.extname(item.path || '').toLowerCase()])
    if (!images.length) return []
    if (images.length > 4) throw Error('本次最多使用 4 张参考图片，请减少图片后发送。')
    let total = 0
    const prepared = images.map(item => {
      const source = resolveWorkspaceEntry(item.path, rootsForFile(item.path), { fileOnly: true })
      const file = typeof source === 'string' ? source : source.path
      const size = fs.statSync(file).size
      if (!size || size > 10 * 1024 * 1024 || (total += size) > 20 * 1024 * 1024) throw Error('参考图单张不能超过 10 MB，合计不能超过 20 MB。')
      const bytes = fs.readFileSync(file), mimeType = imageType(bytes)
      total += bytes.length - size
      if (!bytes.length || bytes.length > 10 * 1024 * 1024 || total > 20 * 1024 * 1024) throw Error('参考图读取期间大小发生变化，请重新添加。')
      const image = this.nativeImage.createFromBuffer(bytes), dimensions = image.getSize()
      if (image.isEmpty() || dimensions.width > 8192 || dimensions.height > 8192 || dimensions.width * dimensions.height > 32_000_000) throw Error('参考图无法读取或尺寸过大。')
      const id = hash(bytes)
      if (item.designReferenceId && item.designReferenceId !== id) throw Error('已发送的参考图快照被修改，请重新添加图片。')
      return { id, name: path.basename(file), mimeType, bytes, ...dimensions }
    })
    fs.mkdirSync(this.directory, { recursive: true })
    for (const item of prepared) {
      const { bytes, ...metadata } = item
      const destination = path.join(this.directory, item.id + '.image')
      if (!fs.existsSync(destination)) fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
      if (hash(fs.readFileSync(destination)) !== item.id) throw Error('参考图快照已改变，请重新添加。')
      fs.writeFileSync(path.join(this.directory, item.id + '.json'), JSON.stringify(metadata), { mode: 0o600 })
    }
    return prepared.map(item => item.id)
  }
  read(ids) {
    if (!Array.isArray(ids) || ids.length > 4 || ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw Error('参考图片标识无效。')
    return ids.map(id => {
      const item = JSON.parse(fs.readFileSync(path.join(this.directory, id + '.json'), 'utf8'))
      const bytes = fs.readFileSync(path.join(this.directory, id + '.image'))
      if (hash(bytes) !== id || imageType(bytes) !== item.mimeType) throw Error('参考图片快照无效，未提交生图请求。')
      return { ...item, id, bytes }
    })
  }
  materialize(attachments, ids, workspace) {
    const references = this.read(ids)
    if (!references.length) return attachments
    let directory = workspace
    for (const name of ['.stable', 'design-reference-previews']) {
      directory = path.join(directory, name)
      if (!fs.existsSync(directory)) fs.mkdirSync(directory)
      resolveWorkspaceEntry(directory, workspace)
    }
    let index = 0
    return attachments.map(item => {
      if (!TYPES[path.extname(item.path || '').toLowerCase()]) return item
      const reference = references[index++]
      const extension = reference.mimeType === 'image/png' ? '.png' : reference.mimeType === 'image/jpeg' ? '.jpg' : '.webp'
      const file = path.join(directory, reference.id + extension)
      if (!fs.existsSync(file)) fs.writeFileSync(file, reference.bytes, { flag: 'wx' })
      if (hash(fs.readFileSync(resolveWorkspaceEntry(file, workspace, { fileOnly: true }).path)) !== reference.id) throw Error('参考图预览快照被修改，请重新添加。')
      return { ...item, path: file, size: reference.bytes.length, designReferenceId: reference.id }
    })
  }
}
module.exports = { DesignReferences }
