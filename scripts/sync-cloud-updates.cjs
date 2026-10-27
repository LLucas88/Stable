'use strict'

// Run on the download host. Only complete, verified releases become visible.
const fs = require('node:fs/promises')
const { createReadStream, createWriteStream } = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const yaml = require('yaml')
const semver = require('semver')
const repo = 'LLucas88/Stable'

function planRelease(release, manifest) {
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw Error('Not a stable release')
  const version = release.tag_name.slice(1)
  const canonical = version.split('.').map(Number).join('.')
  if (!semver.valid(manifest.version) || manifest.version !== canonical) throw Error('Version mismatch')
  const update = `Stable-Update-${version}-x64.exe`
  const names = [update, `${update}.blockmap`, `Stable-Setup-${version}-x64.exe`]
  if (manifest.path !== update || manifest.files?.length !== 1 || manifest.files[0].url !== update) throw Error('Unexpected update path')
  const file = manifest.files[0]
  if (!/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) || file.sha512 !== manifest.sha512 || !Number.isSafeInteger(file.size) || file.size <= 0) throw Error('Invalid checksum or size')
  return names.map(name => {
    const asset = release.assets.find(a => a.name === name)
    const expected = `https://github.com/${repo}/releases/download/${release.tag_name}/${name}`
    if (!asset || asset.browser_download_url !== expected || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 4 * 1024 ** 3) throw Error(`Missing or invalid asset: ${name}`)
    if (name === update && asset.size !== file.size) throw Error('Asset size mismatch')
    if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw Error(`Missing GitHub asset digest: ${name}`)
    return { ...asset, sha512: name === update ? file.sha512 : null }
  })
}

async function hashFile(filename, algorithm, encoding) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest(encoding)
}
async function verify(filename, asset) {
  if ((await fs.stat(filename)).size !== asset.size) throw Error(`Size mismatch: ${asset.name}`)
  if (await hashFile(filename, 'sha256', 'hex') !== asset.digest.slice(7)) throw Error(`SHA256 mismatch: ${asset.name}`)
  if (asset.sha512 && await hashFile(filename, 'sha512', 'base64') !== asset.sha512) throw Error(`SHA512 mismatch: ${asset.name}`)
}
async function request(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Stable-Cloud-Update-Sync' }, signal: AbortSignal.timeout(30 * 60 * 1000) })
  if (!response.ok) throw Error(`Download HTTP ${response.status}`)
  return response
}
async function sync(root) {
  const publicDir = path.join(root, 'public')
  await fs.mkdir(publicDir, { recursive: true })
  const lock = await fs.open(path.join(root, 'sync.lock'), 'wx')
  try {
    const release = await (await request(`https://api.github.com/repos/${repo}/releases/latest`)).json()
    const metadata = release.assets.find(a => a.name === 'latest.yml')
    if (!metadata || metadata.size > 64 * 1024 || metadata.browser_download_url !== `https://github.com/${repo}/releases/download/${release.tag_name}/latest.yml`) throw Error('Missing release metadata')
    const raw = await (await request(metadata.browser_download_url)).text()
    if (Buffer.byteLength(raw) > 64 * 1024) throw Error('Metadata too large')
    const manifest = yaml.parse(raw)
    const assets = planRelease(release, manifest)
    let previous
    try { previous = yaml.parse(await fs.readFile(path.join(publicDir, 'latest.yml'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (previous && semver.gt(previous.version, manifest.version)) throw Error('Refusing update channel downgrade')
    const identity = createHash('sha256').update(JSON.stringify({ raw, assets: assets.map(a => [a.name, a.digest, a.size]) })).digest('hex')
    const statePath = path.join(root, 'state.json')
    let state
    try { state = JSON.parse(await fs.readFile(statePath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (previous?.version === manifest.version && state?.identity === identity && await Promise.all(assets.map(a => fs.stat(path.join(publicDir, a.name)).then(s => s.size === a.size).catch(() => false))).then(a => a.every(Boolean))) return { version: manifest.version, status: 'unchanged' }
    if (previous?.version === manifest.version && state && state.identity !== identity) throw Error('Published versions are immutable; publish a new version')
    for (const asset of assets) {
      const destination = path.join(publicDir, asset.name)
      try { await verify(destination, asset); continue } catch (error) { if (error.code !== 'ENOENT') throw error }
      const staging = path.join(root, `${asset.name}.partial`)
      let bytes = 0
      const limiter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > asset.size ? Error('Download exceeded expected size') : null, chunk) } })
      try {
        await pipeline(Readable.fromWeb((await request(asset.browser_download_url)).body), limiter, createWriteStream(staging))
        await verify(staging, asset)
        await fs.rename(staging, destination)
      } finally { await fs.rm(staging, { force: true }) }
    }
    // Same-volume rename keeps the old manifest available until every artifact is ready.
    const pending = path.join(root, 'latest.pending')
    await fs.writeFile(pending, raw)
    await fs.rename(pending, path.join(publicDir, 'latest.yml'))
    await fs.writeFile(statePath, JSON.stringify({ version: manifest.version, identity, syncedAt: new Date().toISOString() }))
    return { version: manifest.version, status: 'published' }
  } finally {
    await lock.close()
    await fs.unlink(path.join(root, 'sync.lock'))
  }
}
module.exports = { planRelease, verify, sync }
if (require.main === module) sync(process.argv[2] || 'C:\\stable-cloud\\updates').then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
