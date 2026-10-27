'use strict'
const fs = require('node:fs/promises')
const { createReadStream } = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const yaml = require('yaml')
const { planRelease } = require('./sync-cloud-updates.cjs')
async function main() {
  const directory = path.resolve(process.argv[2])
  const tag = process.argv[3]
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Stable release tag required')
  const token = process.env.STABLE_UPDATE_PUBLISH_TOKEN
  if (!token) throw Error('Missing publish credential')
  const raw = await fs.readFile(path.join(directory, 'latest.yml'), 'utf8')
  const manifest = yaml.parse(raw)
  const names = [`Stable-Update-${tag.slice(1)}-x64.exe`, `Stable-Update-${tag.slice(1)}-x64.exe.blockmap`, `Stable-Setup-${tag.slice(1)}-x64.exe`]
  const release = { tag_name: tag, assets: [] }
  for (const name of names) {
    const filename = path.join(directory, name); const hash = createHash('sha256')
    for await (const chunk of createReadStream(filename)) hash.update(chunk)
    release.assets.push({ name, size: (await fs.stat(filename)).size, digest: 'sha256:' + hash.digest('hex'), browser_download_url: `https://github.com/LLucas88/Stable/releases/download/${tag}/${name}` })
  }
  planRelease(release, manifest)
  const base = 'https://116.62.83.85/updates/_publish/'
  for (const asset of release.assets) {
    const response = await fetch(base + asset.name, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(asset.size), 'X-Content-SHA256': asset.digest.slice(7) }, body: createReadStream(path.join(directory, asset.name)), duplex: 'half', signal: AbortSignal.timeout(60 * 60 * 1000) })
    if (!response.ok) throw Error(`Upload failed: ${asset.name} HTTP ${response.status}`)
    await response.arrayBuffer(); console.log(`Cloud verified ${asset.name}`)
  }
  const response = await fetch(base + 'commit', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ release, raw }), signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw Error(`Cloud publication failed HTTP ${response.status}`)
  await response.arrayBuffer()
  const live = await fetch('https://116.62.83.85/updates/latest.yml', { signal: AbortSignal.timeout(30_000) })
  if (!live.ok || yaml.parse(await live.text()).version !== manifest.version) throw Error('Public channel verification failed')
  console.log(`Cloud channel verified: ${manifest.version}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
