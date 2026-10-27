'use strict'
const http = require('node:http')
const fs = require('node:fs/promises')
const { createWriteStream } = require('node:fs')
const path = require('node:path')
const { createHash, timingSafeEqual } = require('node:crypto')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const yaml = require('yaml')
const semver = require('semver')
const { planRelease, verify } = require('./sync-cloud-updates.cjs')

function createReceiver(root, token) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid publish token')
  let busy = false
  const publicDir = path.join(root, 'public')
  const incoming = path.join(root, 'incoming')
  return http.createServer(async (req, res) => {
    const answer = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Connection: 'close' }); res.end(JSON.stringify({ message })) }
    const supplied = Buffer.from(String(req.headers.authorization || ''))
    const expected = Buffer.from(`Bearer ${token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return answer(401, 'Unauthorized')
    if (busy) return answer(409, 'Publisher busy')
    busy = true
    try {
      await fs.mkdir(incoming, { recursive: true }); await fs.mkdir(publicDir, { recursive: true })
      const match = /^\/_publish\/(Stable-(?:Setup|Update)-\d+\.\d+\.\d+-x64\.exe(?:\.blockmap)?)$/.exec(req.url)
      if (req.method === 'PUT' && match) {
        const name = match[1]
        const size = Number(req.headers['content-length'])
        const digest = String(req.headers['x-content-sha256'] || '')
        if (!Number.isSafeInteger(size) || size <= 0 || size > 4 * 1024 ** 3 || !/^[a-f0-9]{64}$/.test(digest)) return answer(400, 'Invalid size or digest')
        const file = path.join(incoming, name)
        const pending = `${file}.partial`
        const hash = createHash('sha256'); let received = 0
        const meter = new Transform({ transform(chunk, enc, cb) { received += chunk.length; hash.update(chunk); cb(received > size ? Error('Too large') : null, chunk) } })
        req.setTimeout(60_000, () => req.destroy(Error('Upload stalled')))
        try {
          await pipeline(req, meter, createWriteStream(pending))
          if (received !== size || hash.digest('hex') !== digest) throw Error('Upload checksum mismatch')
          await fs.rename(pending, file)
        } finally { await fs.rm(pending, { force: true }) }
        return answer(200, 'Uploaded and verified')
      }
      if (req.method === 'POST' && req.url === '/_publish/commit') {
        const chunks = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw Error('Manifest too large'); chunks.push(chunk) }
        const { release, raw } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (typeof raw !== 'string' || raw.length > 64 * 1024) throw Error('Invalid manifest')
        const manifest = yaml.parse(raw)
        const assets = planRelease(release, manifest)
        let previous
        try { previous = yaml.parse(await fs.readFile(path.join(publicDir, 'latest.yml'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
        if (previous && semver.gt(previous.version, manifest.version)) throw Error('Refusing downgrade')
        // Existing filenames are immutable, including when retrying an interrupted commit.
        const sources = []
        for (const asset of assets) {
          const destination = path.join(publicDir, asset.name)
          try { await verify(destination, asset); sources.push(null) } catch (error) {
            if (error.code !== 'ENOENT') throw error
            const source = path.join(incoming, asset.name)
            await verify(source, asset); sources.push(source)
          }
        }
        for (let i = 0; i < assets.length; i++) if (sources[i]) await fs.rename(sources[i], path.join(publicDir, assets[i].name))
        await fs.writeFile(path.join(root, 'latest.pending'), raw)
        await fs.rename(path.join(root, 'latest.pending'), path.join(publicDir, 'latest.yml'))
        await fs.writeFile(path.join(root, 'publish-state.json'), JSON.stringify({ version: manifest.version, publishedAt: new Date().toISOString() }))
        return answer(200, `Published ${manifest.version}`)
      }
      answer(404, 'Not found')
    } catch (error) {
      console.error(new Date().toISOString(), error.message)
      if (!res.headersSent && !res.destroyed) answer(400, 'Publication failed validation; existing channel retained')
    } finally { busy = false }
  })
}
module.exports = { createReceiver }
if (require.main === module) {
  const root = process.argv[2] || 'C:\\stable-cloud\\updates'
  fs.readFile(path.join(root, 'publish-token'), 'utf8').then(token => {
    const server = createReceiver(root, token.trim())
    server.requestTimeout = 60 * 60 * 1000
    server.headersTimeout = 30_000
    server.listen(18881, '127.0.0.1', () => console.log('Update publisher listening on loopback'))
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
