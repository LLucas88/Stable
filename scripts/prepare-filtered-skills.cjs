'use strict'

const fs = require('node:fs'), path = require('node:path')
const { digest, contained } = require('../desktop/services/tencenthub-skill-bundle.cjs')
const SOURCE_SHA256 = '54d8091cbebce5f80fde384d18133ee92172bb886c0165d8560ef3fdd984589c'
const BUNDLE = 'ops-filtered-617-20260907'
const selectedByScreenshot = s => s.external_service_possible === false && ['MIT', 'MIT-0', 'Apache-2.0'].includes(s.license)

function prepare(source, destination) {
  const bytes = fs.readFileSync(path.join(source, 'manifest.json'))
  if (digest(bytes) !== SOURCE_SHA256) throw Error('源清单与图示 1586 项版本不一致。')
  const original = JSON.parse(bytes), selected = original.skills.filter(selectedByScreenshot)
  if (original.skills.length !== 1586 || selected.length !== 617 || new Set(selected.map(s => s.id)).size !== 617) throw Error('筛选数量或编号不一致。')
  if (fs.existsSync(destination)) throw Error('目标目录已存在；请使用新的空目录，避免覆盖技能。')
  const roots = original.skills.map(s => s.path + '/'), selectedRoots = selected.map(s => s.path + '/')
  const packages = new Set(selected.map(s => s.path.split('/').slice(0, 2).join('/') + '/'))
  const wanted = relative => selectedRoots.some(root => relative.startsWith(root)) ||
    ([...packages].some(root => relative.startsWith(root)) && !roots.some(root => relative.startsWith(root)))
  const checksums = fs.readFileSync(path.join(source, 'checksums.sha256'), 'utf8').trim().split(/\r?\n/).map(line => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/)
    if (!match) throw Error('无效的源校验清单。')
    return { path: match[2], sha256: match[1] }
  }).filter(file => wanted(file.path))
  // Validate the entire selection before any copy; only data is read, never run.
  for (const file of checksums) {
    if (digest(fs.readFileSync(contained(source, file.path))) !== file.sha256) throw Error('源资源校验失败：' + file.path)
  }
  fs.mkdirSync(destination, { recursive: true })
  for (const file of checksums) {
    const target = path.join(destination, file.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(contained(source, file.path), target)
  }
  const manifest = { schemaVersion: 1, bundle: BUNDLE, sourceManifestSha256: SOURCE_SHA256,
    filter: { search: '', direction: '全部方向', external_service_possible: false, licenses: ['MIT', 'MIT-0', 'Apache-2.0'], sourceCount: 1586, selectedCount: 617 },
    skills: selected, files: checksums }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return { selected: selected.length, files: checksums.length, destination, manifestSha256: digest(fs.readFileSync(path.join(destination, 'manifest.json'))) }
}
module.exports = { prepare, selectedByScreenshot, SOURCE_SHA256, BUNDLE }
if (require.main === module) {
  if (!process.argv[2] || !process.argv[3]) throw Error('用法：node scripts/prepare-filtered-skills.cjs <1586 项源目录> <新目标目录>')
  console.log(JSON.stringify(prepare(path.resolve(process.argv[2]), path.resolve(process.argv[3])), null, 2))
}
