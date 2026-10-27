'use strict'
// Local source preparation only; no DB migration, account changes or deployment.
const fs = require('node:fs'), path = require('node:path')
if (!process.argv[2]) throw Error('Provide the Stable Cloud source directory')
const target = path.resolve(process.argv[2]), backup = path.join(target, '.web-source-backup-' + Date.now())
const gatewayFile = 'lib/server/gateway.ts', catalogFile = 'lib/server/model-catalog.ts'
const gateway = fs.readFileSync(path.join(target, gatewayFile), 'utf8'), catalog = fs.readFileSync(path.join(target, catalogFile), 'utf8')
const anchor = '  const model = await getModelSnapshot(String(body.model));'
if (!gateway.includes(anchor) || !catalog.includes("WHERE m.status = 'active'")) throw Error('Source anchors changed; review before applying')
function write(relative, contents) {
  const file = path.join(target, relative)
  if (fs.existsSync(file)) { const old = fs.readFileSync(file); if (old.equals(Buffer.from(contents))) return; const saved = path.join(backup, relative); fs.mkdirSync(path.dirname(saved), { recursive: true }); fs.writeFileSync(saved, old) }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents)
}
function copy(directory, relative = '') { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const name = path.join(relative, entry.name), file = path.join(directory, entry.name); if (entry.isDirectory()) copy(file, name); else write(name, fs.readFileSync(file)) } }
copy(path.join(__dirname, 'overlay'))
if (!gateway.includes("'web_requires_tool_endpoint'")) write(gatewayFile, gateway.replace(anchor, anchor + "\n  if (['deepseek-search', 'deepseek-fetch'].includes(model.upstreamModel)) throw new AppError(400, 'web_requires_tool_endpoint', '请使用联网工具接口。');"))
if (!catalog.includes("m.upstream_model NOT IN ('deepseek-search', 'deepseek-fetch')")) write(catalogFile, catalog.replace("WHERE m.status = 'active'", "WHERE m.status = 'active' AND m.upstream_model NOT IN ('deepseek-search', 'deepseek-fetch')"))
console.log(JSON.stringify({ target, backup, sourcePrepared: true, databaseChanged: false, deployed: false }))
