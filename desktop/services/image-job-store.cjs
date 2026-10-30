'use strict'
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto')
class ImageJobStore {
  constructor(directory) { this.directory = directory; fs.mkdirSync(directory, { recursive: true }) }
  file(key) { if (!/^[a-f0-9]{64}$/.test(key)) throw Error('无效生图记录。'); return path.join(this.directory, key + '.json') }
  read(key) {
    try { const record = JSON.parse(fs.readFileSync(this.file(key), 'utf8')); if (record.version !== 1 || record.key !== key || !['submitted', 'generated', 'completed', 'failed'].includes(record.status)) throw Error('invalid'); return record }
    catch (error) { if (error.code === 'ENOENT') return null; throw Error('生图恢复记录无法读取，已停止以避免重复扣费。') }
  }
  list() {
    return fs.readdirSync(this.directory).filter(file => /^[a-f0-9]{64}\.json$/.test(file)).map(file => this.read(file.slice(0, -5)))
  }
  write(key, record) {
    const target = this.file(key), temp = target + '.' + randomUUID() + '.tmp'
    const fd = fs.openSync(temp, 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify({ ...record, version: 1, key })); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    try { fs.renameSync(temp, target) } catch (error) { fs.rmSync(temp, { force: true }); throw error }
  }
}
module.exports = { ImageJobStore }
