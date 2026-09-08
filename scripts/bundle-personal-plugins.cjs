// Snapshot reusable plugin files only; no account or browser state is imported.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), JSZip = require('jszip')
async function main() {
  const roots = process.argv.slice(2)
  if (roots.length !== 2) throw Error('Provide the two plugin source directories')
  const destination = path.join(__dirname, '../desktop/plugins')
  fs.mkdirSync(destination, { recursive: true })
  const catalog = []
  for (const root of roots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'))
    if (!['standard-data-processor', 'wending-crm-analysis'].includes(manifest.name)) throw Error('Unexpected plugin')
    const zip = new JSZip(), hashes = {}
    function walk(directory, relative = '') {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['.git', '.cache', '__pycache__', 'logs', 'browser-data', '.env'].includes(entry.name)) continue
        const name = relative + entry.name, file = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) throw Error('Unexpected symlink: ' + name)
        if (entry.isDirectory()) walk(file, name + '/')
        else {
          const data = fs.readFileSync(file)
          zip.file(name, data); hashes[name] = crypto.createHash('sha256').update(data).digest('hex')
        }
      }
    }
    walk(root)
    const skills = fs.readdirSync(path.join(root, 'skills')).filter(name => fs.existsSync(path.join(root, 'skills', name, 'SKILL.md'))).map(name => {
      const content = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')
      return { id: `plugin-${manifest.name}--${name}`, directory: name, name: content.match(/^# (.+)$/m)?.[1] || name, description: content.match(/^description: ["']?(.+?)["']?\r?$/m)?.[1] || '', content }
    })
    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(path.join(destination, manifest.name + '.zip'), archive)
    catalog.push({ id: manifest.name, name: manifest.interface.displayName, version: manifest.version, description: manifest.interface.shortDescription, content: manifest.interface.longDescription, skills, hashes, sha256: crypto.createHash('sha256').update(archive).digest('hex') })
    console.log(manifest.name, skills.length, 'skills', Object.keys(hashes).length, 'files', archive.length, 'bytes')
  }
  fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify(catalog, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
