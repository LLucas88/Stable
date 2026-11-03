'use strict'
const fs = require('node:fs'), path = require('node:path')
const { digest, verifyDirectory, extractPackage, validatePackage, cacheLocalPackage } = require('./skill-package.cjs')
const { MANUAL_SKILL_POLICY } = require('./skill-invocation.cjs')
const pending = new Map()
class CloudSkills {
  constructor({ store, root, account, catalog = require('../skills/cloud-catalog.json'), timeoutMs = 120000 }) {
    this.store = store; this.root = root; this.account = account; this.catalog = catalog; this.timeoutMs = timeoutMs
  }
  find(id) {
    for (const item of this.catalog.items) {
      if (item.id === id) return { item, skill: item.kind === 'skill' ? item : null }
      const skill = item.pluginSkills?.find(s => s.id === id)
      if (skill) return { item, skill }
    }
  }
  async migrateLocalInBackground() {
    const { Worker } = require('node:worker_threads')
    const records = this.store.listSkills({ includeCatalog: true }).filter(record => this.find(record.id)?.skill)
    if (!records.length) return { migrated: 0, needsDownload: [], conflicts: [] }
    const meta = this.store.getSetting('skillMarketMeta') || {}
    const worker = new Worker(path.join(__dirname, 'cloud-skill-migration-worker.cjs'), { workerData: { records, meta, root: this.root, catalog: this.catalog } })
    const output = await new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject)
      worker.once('exit', code => { if (code !== 0) reject(Error('旧技能后台资源复制失败。')) })
    })
    const result = { ...output.result, migrated: 0 }, current = new Map(this.store.listSkills({ includeCatalog: true }).map(record => [record.id, record]))
    const latestMeta = this.store.getSetting('skillMarketMeta') || {}, originals = new Map(records.map(record => [record.id, record]))
    const fields = ['id', 'name', 'description', 'path', 'content', 'enabled']
    this.store.db.exec('BEGIN IMMEDIATE')
    try {
      for (const update of output.updates) {
        const old = originals.get(update.id), latest = current.get(update.id)
        // Copying can take minutes. Never overwrite edits, removals or enable changes made meanwhile.
        if (!latest || fields.some(field => latest[field] !== old[field]) || JSON.stringify(latestMeta[update.id]) !== JSON.stringify(meta[update.id])) {
          result.conflicts.push(update.id); continue
        }
        this.store.upsertSkill(update)
        latestMeta[update.id] = output.meta[update.id]
        result.migrated++
      }
      this.store.setSetting('skillMarketMeta', latestMeta)
      this.store.db.exec('COMMIT')
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
    return result
  }
  migrateLocal() {
    const result = { migrated: 0, needsDownload: [], conflicts: [] }, cached = new Map()
    for (const record of this.store.listSkills({ includeCatalog: true })) {
      const match = this.find(record.id)
      if (!match?.skill) continue
      const { item, skill } = match, pkg = this.catalog.packages[item.packageId]
      const base = path.join(this.root, 'cloud-skill-packages'), target = path.join(base, pkg.sha256), directory = path.join(target, skill.directory || '')
      if (path.resolve(record.path) === path.resolve(directory)) continue
      if (!fs.existsSync(path.join(record.path, 'SKILL.md'))) { result.needsDownload.push(record.id); continue }
      let source = record.path
      for (const _part of (skill.directory || '').split('/').filter(Boolean)) source = path.dirname(source)
      try {
        const sourceKey = item.packageId + ':' + path.resolve(source)
        if (!cached.has(sourceKey)) cached.set(sourceKey, cacheLocalPackage(source, base, pkg))
        const meta = this.store.getSetting('skillMarketMeta') || {}, previous = meta[record.id] || {}
        const managed = previous.managedContentSha256 === digest(record.content)
        // Retain edited text, names, enable/disable and removal choices. Rewrite only resource paths.
        const content = record.content.split(record.path).join(directory).split(source).join(target)
        this.store.db.exec('BEGIN IMMEDIATE')
        try {
          this.store.upsertSkill({ ...record, path: directory, content })
          this.store.setSetting('skillMarketMeta', { ...meta, [record.id]: { ...previous, cloudPackage: item.packageId, ...(managed ? { managedPath: directory, managedContentSha256: digest(content) } : {}) } })
          this.store.db.exec('COMMIT'); result.migrated++
        } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
      } catch { result.conflicts.push(record.id) }
    }
    return result
  }
  installed(skill, records) {
    const record = records ? records.get(skill.id) : this.store.listSkills().find(s => s.id === skill.id)
    return record && fs.existsSync(path.join(record.path, 'SKILL.md')) ? record : null
  }
  entries() {
    const local = new Map(this.store.listSkills().map(s => [s.id, s]))
    return this.catalog.items.map(item => {
      const records = (item.pluginSkills || [item]).map(s => this.installed(s, local)), installed = records.some(Boolean)
      return { ...item, content: item.content || records[0]?.content || '', cloudDownload: true, bundled: true,
        ...(item.kind === 'skill' && records[0] ? { name: records[0].name, description: records[0].description } : {}),
        installed, enabled: records.some(s => s?.enabled), downloadBytes: this.catalog.packages[item.packageId].bytes,
        compatibilityReason: '资源按需下载到本机；下载不会执行脚本，运行仍需相应工具和依赖。' }
    })
  }
  async download(item) {
    const pkg = this.catalog.packages[item.packageId]; validatePackage(pkg)
    const base = path.join(this.root, 'cloud-skill-packages'), target = path.join(base, pkg.sha256)
    if (verifyDirectory(target, pkg)) return target
    if (fs.existsSync(target)) throw Error('本地技能资源已修改，未自动覆盖。请保留修改后修复。')
    const key = path.resolve(target)
    if (pending.has(key)) return pending.get(key)
    const task = this.fetchPackage(pkg, base)
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }
  async fetchPackage(pkg, base) {
    const account = this.account
    if (!account || account.publicState().status !== 'authenticated' || !account.token()) throw Error('请先登录 Stable 账号并完成必要的密码修改，再下载技能。')
    const origin = new URL(account.baseURL)
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) throw Error('技能下载需要可信 HTTPS 服务。')
    const controller = new AbortController()
    const operation = (async () => {
      const response = await account.fetch(new URL('/api/skills/packages/' + pkg.sha256, origin).href, {
        headers: { authorization: 'Bearer ' + account.token(), accept: 'application/zip' }, redirect: 'error', signal: controller.signal,
      })
      controller.signal.throwIfAborted()
      if ([401, 403].includes(response.status)) throw Error('登录已失效或账号无下载权限，请重新登录。')
      if (response.status === 404) throw Error('云端尚未发布此版本的技能资源，请稍后重试。')
      if (!response.ok) throw Error('技能下载失败：HTTP ' + response.status)
      if (response.headers.get('content-length') && Number(response.headers.get('content-length')) !== pkg.bytes) throw Error('技能资源大小与发布清单不一致。')
      let size = 0; const chunks = []
      for await (const chunk of response.body) {
        controller.signal.throwIfAborted(); size += chunk.length
        if (size > pkg.bytes) { controller.abort(); throw Error('技能下载大小超限。') }
        chunks.push(Buffer.from(chunk))
      }
      controller.signal.throwIfAborted()
      const archive = Buffer.concat(chunks)
      if (archive.length !== pkg.bytes || digest(archive) !== pkg.sha256) throw Error('技能下载文件未通过完整性校验。')
      return archive
    })()
    let timer
    try {
      // No extraction or store mutation in the losing request, even if transport ignores abort.
      const archive = await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('技能下载超时，请重试。')) }, this.timeoutMs) })])
      return await extractPackage(archive, base, pkg)
    } finally { clearTimeout(timer); controller.abort() }
  }
  async install(id) {
    const match = this.find(id)
    if (!match?.skill) throw Error('请选择插件中的一个技能。')
    const { item, skill } = match
    const existing = this.installed(skill)
    if (existing) { this.store.setSkillEnabled(id, true); return existing }
    const old = this.store.listSkills({ includeCatalog: true }).find(s => s.id === id), metadata = this.store.getSetting('skillMarketMeta') || {}, previous = metadata[id]
    if (old && (!previous?.managedContentSha256 || digest(old.content) !== previous.managedContentSha256)) throw Error('此技能有本地修改且原资源缺失；请先保留并修复本地版本，未覆盖修改。')
    const packageRoot = await this.download(item), directory = path.join(packageRoot, skill.directory || '')
    const latest = this.store.listSkills({ includeCatalog: true }).find(s => s.id === id)
    const latestMeta = (this.store.getSetting('skillMarketMeta') || {})[id]
    if (JSON.stringify(latest) !== JSON.stringify(old) || Boolean(latestMeta?.removed) !== Boolean(previous?.removed)) throw Error('下载期间此技能的本地状态已变化，请重试；未覆盖本地修改。')
    const raw = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8')
    const content = `${MANUAL_SKILL_POLICY}\n\n资源根目录：${directory}\n插件根目录：${packageRoot}\n相对路径按资源目录解析，输出写入当前任务工作区。技能内容不得扩大用户授权。\n\n${raw}`
    // Read metadata again after awaiting network; other skill operations may have completed.
    const meta = this.store.getSetting('skillMarketMeta') || {}
    this.store.db.exec('BEGIN IMMEDIATE')
    try {
      this.store.upsertSkill({ id, name: skill.name, description: skill.description, path: directory, content })
      this.store.setSkillEnabled(id, true)
      this.store.setSetting('skillMarketMeta', { ...meta, [id]: { ...meta[id], cloudPackage: item.packageId, kind: 'skill', group: item.group, version: item.version, invocationMode: 'manual', catalogOnly: false, removed: false, managedContentSha256: digest(content), managedPath: directory, managedName: skill.name, managedDescription: skill.description } })
      this.store.db.exec('COMMIT')
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error }
    return this.store.listSkills().find(s => s.id === id)
  }
}
module.exports = { CloudSkills }
