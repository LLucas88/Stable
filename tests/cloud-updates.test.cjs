'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const yaml = require('yaml')
const { planRelease, sync } = require('../scripts/sync-cloud-updates.cjs')
const { GenericProvider } = require('electron-updater/out/providers/GenericProvider')
const pkg = require('../package.json')

function fixture(version = '1.0.04') {
  const bytes = Buffer.from('verified installer fixture')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const name = `Stable-Update-${version}-x64.exe`
  const manifest = { version: version.split('.').map(Number).join('.'), files: [{ url: name, sha512, size: bytes.length }], path: name, sha512 }
  const raw = yaml.stringify(manifest)
  const assets = [name, `${name}.blockmap`, `Stable-Setup-${version}-x64.exe`, 'latest.yml'].map(name => ({ name, size: name === 'latest.yml' ? Buffer.byteLength(raw) : bytes.length, digest: 'sha256:' + createHash('sha256').update(name === 'latest.yml' ? raw : bytes).digest('hex'), browser_download_url: `https://github.com/LLucas88/Stable/releases/download/v${version}/${name}` }))
  return { bytes, manifest, raw, release: { tag_name: `v${version}`, assets } }
}
test('release validation rejects redirected assets, traversal, missing files and mismatched versions', () => {
  const f = fixture()
  assert.equal(planRelease(f.release, f.manifest).length, 3)
  assert.throws(() => planRelease(f.release, { ...f.manifest, version: '1.0.5' }), /Version/)
  assert.throws(() => planRelease(f.release, { ...f.manifest, path: '../bad.exe' }), /path/)
  const bad = structuredClone(f.release); bad.assets[0].browser_download_url = 'https://example.com/payload'
  assert.throws(() => planRelease(bad, f.manifest), /invalid asset/)
  assert.throws(() => planRelease({ ...f.release, assets: [] }, f.manifest), /invalid asset/)
})
test('cloud sync publishes only verified files and keeps old manifest on checksum failure or downgrade', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stable-cloud-update-'))
  const originalFetch = global.fetch
  let f = fixture(); let corrupt = false
  global.fetch = async url => new Response(url.includes('api.github.com') ? JSON.stringify(f.release) : url.endsWith('/latest.yml') ? f.raw : corrupt ? Buffer.alloc(f.bytes.length) : f.bytes)
  try {
    assert.equal((await sync(root)).status, 'published')
    assert.equal((await sync(root)).status, 'unchanged')
    const before = await fs.readFile(path.join(root, 'public/latest.yml'), 'utf8')
    f = fixture('1.0.05'); corrupt = true
    await assert.rejects(sync(root), /SHA256/)
    assert.equal(await fs.readFile(path.join(root, 'public/latest.yml'), 'utf8'), before)
    f = fixture('1.0.03'); corrupt = false
    await assert.rejects(sync(root), /downgrade/)
    f = fixture('1.0.05')
    assert.equal((await sync(root)).version, '1.0.5')
    assert.equal(yaml.parse(await fs.readFile(path.join(root, 'public/latest.yml'), 'utf8')).version, '1.0.5')
  } finally { global.fetch = originalFetch; await fs.rm(root, { recursive: true, force: true }) }
})
test('installed update provider resolves metadata and installer entirely on Stable Cloud', async () => {
  const f = fixture(pkg.releaseVersion)
  const urls = []
  const provider = new GenericProvider(pkg.build.publish[0], {}, { platform: 'win32', executor: { request: async options => { urls.push(options); return f.raw } } })
  const info = await provider.getLatestVersion()
  const url = provider.resolveFiles(info)[0].url
  assert.equal(url.origin, 'https://116.62.83.85')
  assert.equal(url.pathname, `/updates/${f.manifest.path}`)
  assert.equal(urls[0].hostname, '116.62.83.85')
  assert.match(urls[0].path, /^\/updates\/latest.yml/)
})
