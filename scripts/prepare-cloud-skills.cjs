'use strict'
const fs = require('node:fs'), path = require('node:path'), JSZip = require('jszip')
const { inspectBundle } = require('../desktop/services/filtered-skill-bundle.cjs')
const { digest, validatePackage } = require('../desktop/services/skill-package.cjs')
async function prepare(output) {
  const root = path.resolve(__dirname, '..'), source = path.join(root, 'desktop/skills/filtered/bundle')
  const bundle = inspectBundle(source), manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'))
  const catalog = { schema: 1, revision: manifest.bundle, packages: {}, items: [] }, groups = new Map()
  fs.mkdirSync(path.join(output, 'packages'), { recursive: true })
  for (const s of bundle.skills) {
    const group = s.path.split('/').slice(0, 2).join('/')
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(s)
  }
  for (const [group, skills] of groups) {
    const zip = new JSZip(), files = {}
    for (const f of manifest.files.filter(f => f.path.startsWith(group + '/')).sort((a, b) => a.path.localeCompare(b.path))) {
      const name = f.path.slice(group.length + 1), data = fs.readFileSync(path.join(source, f.path))
      if (digest(data) !== f.sha256) throw Error('资源在打包过程中发生变化。')
      files[name] = f.sha256; zip.file(name, data, { date: new Date('2020-01-01T00:00:00Z'), createFolders: false })
    }
    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const pkg = { sha256: digest(archive), bytes: archive.length, files }; validatePackage(pkg)
    catalog.packages[pkg.sha256] = pkg; fs.writeFileSync(path.join(output, 'packages', pkg.sha256 + '.zip'), archive)
    for (const s of skills) catalog.items.push({ id: 'filtered-' + s.id, name: (s.original_name + ' · ' + s.id).slice(0, 80), description: s.introduction_zh || s.description_original,
      kind: 'skill', group: s.matched_modules.join(' / '), version: s.source_version || s.revision || manifest.bundle, packageId: pkg.sha256,
      directory: s.path === group ? '' : s.path.slice(group.length + 1), source: s.source_type === 'skillhub' ? '腾讯 SkillHub' : 'GitHub', sourceURL: s.source_url, license: s.license, score: s.max_score })
  }
  for (const plugin of require('../desktop/plugins/catalog.json')) {
    const archive = fs.readFileSync(path.join(root, 'desktop/plugins', plugin.id + '.zip'))
    if (digest(archive) !== plugin.sha256) throw Error('业务插件哈希不一致。')
    const pkg = { sha256: plugin.sha256, bytes: archive.length, files: plugin.hashes }; validatePackage(pkg)
    catalog.packages[pkg.sha256] = pkg; fs.writeFileSync(path.join(output, 'packages', pkg.sha256 + '.zip'), archive)
    catalog.items.push({ id: plugin.id, name: plugin.name, description: plugin.description, content: plugin.content, kind: 'plugin', group: '会员经营', version: plugin.version, packageId: pkg.sha256,
      pluginSkills: plugin.skills.map(({ id, name, description, directory, defaultPrompt }) => ({ id, name, description, directory: 'skills/' + directory, defaultPrompt })) })
  }
  const bytes = JSON.stringify(catalog)
  fs.writeFileSync(path.join(output, 'catalog.json'), bytes)
  fs.writeFileSync(path.join(root, 'desktop/skills/cloud-catalog.json'), bytes)
  console.log(JSON.stringify({ items: catalog.items.length, packages: Object.keys(catalog.packages).length, downloadBytes: Object.values(catalog.packages).reduce((n, p) => n + p.bytes, 0), catalogBytes: Buffer.byteLength(bytes), output }))
  return catalog
}
if (require.main === module) prepare(path.resolve(process.argv[2] || '.local/cloud-skills')).catch(e => { console.error(e.message); process.exitCode = 1 })
module.exports = { prepare }
