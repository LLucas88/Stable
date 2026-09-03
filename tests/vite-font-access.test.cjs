const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')

test('Vite serves linked dependency fonts while denying unrelated paths and environment files', { timeout: 30_000 }, async t => {
  const { createServer } = await import('vite')
  const root = realpathSync(path.join(__dirname, '..'))
  const dependencies = realpathSync(path.join(root, 'node_modules'))
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'stable-vite-font-'))
  // Vite serves /@fs paths from the current drive on Windows. Use a real
  // same-drive sibling so a missing cross-drive path cannot pass via SPA fallback.
  const outside = mkdtempSync(path.join(path.dirname(root), '.qa-vite-denied-'))
  // This in-worktree fixture also checks that fs.allow does not disable fs.deny.
  const fixture = mkdtempSync(path.join(root, '.qa-vite-access-'))
  let server
  t.after(async () => {
    await server?.close()
    rmSync(temporary, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })
  writeFileSync(path.join(outside, 'outside.txt'), 'outside fixture only')
  writeFileSync(path.join(fixture, 'allowed.txt'), 'worktree fixture only')
  writeFileSync(path.join(fixture, '.env.fixture'), 'FAKE_TEST_ONLY=not-a-secret')
  server = await createServer({
    configFile: path.join(root, 'vite.config.ts'), configLoader: 'runner',
    cacheDir: path.join(temporary, 'cache'), logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const request = file => fetch(`${origin}/@fs/${encodeURI(file.replace(/\\/g, '/'))}`, { signal: AbortSignal.timeout(5000) })
  for (const [family, filename] of [
    ['ibm-plex-sans', 'ibm-plex-sans-latin-wght-normal.woff2'],
    ['space-grotesk', 'space-grotesk-latin-wght-normal.woff2'],
  ]) {
    const file = path.join(dependencies, '@fontsource-variable', family, 'files', filename)
    const response = await request(file)
    assert.equal(response.status, 200, `${family} must load from the dependency realpath`)
    assert.match(response.headers.get('content-type'), /font\/woff2/)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(file))
  }
  assert.equal((await request(path.join(fixture, 'allowed.txt'))).status, 200)
  assert.equal((await request(path.join(fixture, '.env.fixture'))).status, 403)
  assert.equal((await request(path.join(outside, 'outside.txt'))).status, 403)
  if (!dependencies.startsWith(root + path.sep)) {
    assert.equal((await request(path.join(dependencies, '..', 'package.json'))).status, 403, 'Do not expose the shared dependency parent project')
  }
  assert.equal(server.config.server.fs.strict, true)
  const allowed = server.config.server.fs.allow.map(value => path.resolve(value))
  assert.ok(allowed.includes(root))
  assert.ok(allowed.includes(dependencies))
  assert.ok(!allowed.includes(path.dirname(root)))
  assert.ok(!allowed.includes(path.parse(root).root))
})
