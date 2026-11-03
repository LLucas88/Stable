'use strict'
// Private loopback sidecar. Caddy must proxy /api/skills/* here, never expose its data directory.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto')
const { pipeline } = require('node:stream/promises')
function createSkillServer({ root, accountURL = 'http://127.0.0.1:18880/api/account', fetchImpl = globalThis.fetch }) {
  const authURL = new URL(accountURL)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(authURL.hostname) || authURL.pathname !== '/api/account') throw Error('Authentication must use the local Stable account service.')
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8')), packages = new Map()
  const packageRoot = fs.realpathSync(path.join(root, 'packages'))
  // Verify the deployed release once before accepting any request.
  for (const pkg of Object.values(catalog.packages)) {
    if (!/^[a-f0-9]{64}$/.test(pkg.sha256)) throw Error('Invalid package id')
    const file = path.join(packageRoot, pkg.sha256 + '.zip'), real = fs.realpathSync(file)
    if (path.dirname(real).toLowerCase() !== packageRoot.toLowerCase()) throw Error('Package escapes private storage')
    const bytes = fs.readFileSync(real)
    if (bytes.length !== pkg.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== pkg.sha256) throw Error('Invalid deployed package')
    packages.set(pkg.sha256, { ...pkg, file: real })
  }
  let active = 0
  return http.createServer(async (req, res) => {
    const send = (status, code) => { if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'private, no-store' }); res.end(JSON.stringify({ error: { code } })) } else res.destroy() }
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'method_not_allowed')
      const token = req.headers.authorization
      if (typeof token !== 'string' || !/^Bearer [^\s]{1,4096}$/.test(token)) return send(401, 'invalid_session')
      const auth = await fetchImpl(authURL.href, { headers: { authorization: token, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) })
      if (!auth.ok) return send([401, 403].includes(auth.status) ? auth.status : 503, 'account_unavailable')
      const data = await auth.json()
      if (!data.account || data.account.status !== 'active' || data.account.mustChangePassword) return send(403, 'account_restricted')
      const pathname = new URL(req.url, 'http://localhost').pathname
      if (pathname === '/api/skills/catalog') {
        const bytes = Buffer.from(JSON.stringify({ schema: catalog.schema, revision: catalog.revision, items: catalog.items }))
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'private, no-store', 'content-length': bytes.length }); return res.end(req.method === 'HEAD' ? undefined : bytes)
      }
      const match = pathname.match(/^\/api\/skills\/packages\/([a-f0-9]{64})$/), pkg = match && packages.get(match[1])
      if (!pkg) return send(404, 'package_not_found')
      if (active >= 8) return send(429, 'download_busy')
      let start = 0, end = pkg.bytes - 1, status = 200
      if (req.headers.range) {
        const range = req.headers.range.match(/^bytes=(\d+)-(\d*)$/)
        if (!range) return send(416, 'invalid_range')
        start = Number(range[1]); end = range[2] ? Number(range[2]) : end
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= pkg.bytes) return send(416, 'invalid_range')
        status = 206
      }
      res.writeHead(status, { 'content-type': 'application/zip', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${pkg.bytes}` } : {}) })
      if (req.method === 'HEAD') return res.end()
      active++
      try { await pipeline(fs.createReadStream(pkg.file, { start, end }), res) } finally { active-- }
    } catch { send(503, 'skill_service_unavailable') }
  })
}
if (require.main === module) {
  if (!process.env.STABLE_SKILL_ROOT) throw Error('STABLE_SKILL_ROOT must point to a verified private release directory')
  createSkillServer({ root: process.env.STABLE_SKILL_ROOT }).listen(18882, '127.0.0.1', () => console.log('Private skill service listening on loopback:18882'))
}
module.exports = { createSkillServer }
