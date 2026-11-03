'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const JSZip = require('jszip')
const { StableStore } = require('../desktop/services/store.cjs')
const { CloudSkills } = require('../desktop/services/cloud-skills.cjs')
const { SkillMarket } = require('../desktop/services/skill-market.cjs')
const { digest, extractPackage, verifyDirectory } = require('../desktop/services/skill-package.cjs')
const { createSkillServer } = require('../tools/cloud-skills/server.cjs')
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-cloud-skill-')), store = new StableStore(root)
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  const files = { 'example/SKILL.md': '# Original skill', 'shared/helper.txt': 'shared dependency' }, zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { createFolders: false })
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }), hash = digest(bytes)
  const pkg = { sha256: hash, bytes: bytes.length, files: Object.fromEntries(Object.entries(files).map(([n, c]) => [n, digest(c)])) }
  const item = { id: 'filtered-example', name: 'Example', description: 'Fixture', kind: 'skill', directory: 'example', packageId: hash, version: '1', group: 'Test' }
  const catalog = { schema: 1, revision: 'test', packages: { [hash]: pkg }, items: [item] }
  let calls = 0
  const account = { publicState: () => ({ status: 'authenticated' }), token: () => 'test-device-token', baseURL: 'https://cloud.invalid', fetch: async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response(bytes) } }
  return { root, store, files, bytes, pkg, item, catalog, account, calls: () => calls, manager: new CloudSkills({ store, root, account, catalog }) }
}
test('download requires login and never registers a partial skill', async t => {
  const f = await fixture(t); f.account.publicState = () => ({ status: 'signed_out' })
  await assert.rejects(f.manager.install(f.item.id), /登录/)
  assert.equal(f.calls(), 0); assert.equal(f.store.listSkills().length, 0)
})
test('install keeps complete shared resources; repeat use works offline and preserves history', async t => {
  const f = await fixture(t), oldConversation = f.store.activeConversationId()
  f.store.addMessage(oldConversation, 'user', 'preserve history')
  const market = new SkillMarket(f.store, f.root, { cloudDelivery: true, cloudAccount: f.account, cloudCatalog: f.catalog })
  assert.equal(market.detail(f.item.id).installed, false)
  const id = await market.use(f.item.id), skill = f.store.listSkills()[0]
  assert.equal(fs.readFileSync(path.join(skill.path, '../shared/helper.txt'), 'utf8'), 'shared dependency')
  assert.deepEqual(f.store.getSetting('conversation-skills:' + id), [f.item.id]); assert.equal(f.calls(), 1)
  assert.equal(market.detail(f.item.id).installed, true)
  f.account.publicState = () => ({ status: 'signed_out' }); f.account.fetch = () => { throw Error('offline') }
  await market.use(f.item.id)
  assert.equal(f.store.listMessages(oldConversation)[0].content, 'preserve history')
  market.remove(f.item.id); assert.equal(market.detail(f.item.id).installed, false)
  await market.use(f.item.id); assert.equal(f.calls(), 1)
})
test('corrupt, oversized, failed and unauthenticated responses do not write skill rows', async t => {
  const f = await fixture(t)
  for (const response of [new Response('corrupt'), new Response(Buffer.alloc(f.bytes.length + 1)), new Response('', { status: 401 }), new Response('', { status: 404 })]) {
    f.account.fetch = async () => response
    await assert.rejects(f.manager.install(f.item.id)); assert.equal(f.store.listSkills().length, 0)
  }
})
test('timeout bounds transports that ignore abort and late response cannot install', async t => {
  const f = await fixture(t); let finish
  f.account.fetch = () => new Promise(resolve => { finish = resolve })
  const manager = new CloudSkills({ ...f, timeoutMs: 15 })
  await assert.rejects(manager.install(f.item.id), /超时/)
  finish(new Response(f.bytes)); await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(f.store.listSkills().length, 0)
  assert.equal(fs.existsSync(path.join(f.root, 'cloud-skill-packages', f.pkg.sha256)), false)
})
test('missing old managed resources are repaired without changing ID; local edits are protected', async t => {
  const f = await fixture(t), old = { id: f.item.id, name: 'Old', description: 'Old', path: path.join(f.root, 'removed-install-directory'), content: 'managed old content' }
  f.store.upsertSkill(old); f.store.setSetting('skillMarketMeta', { [old.id]: { managedContentSha256: digest(old.content), bundle: 'old' } })
  const repaired = await f.manager.install(old.id); assert.equal(repaired.id, old.id); assert(fs.existsSync(path.join(repaired.path, 'SKILL.md')))
  f.store.upsertSkill({ ...old, content: 'custom user edit' })
  await assert.rejects(f.manager.install(old.id), /本地修改/); assert.equal(f.store.listSkills()[0].content, 'custom user edit')
})
test('path traversal, symlinks and extra files fail before extraction', async t => {
  const f = await fixture(t)
  for (const [name, options] of [['../escape', {}], ['extra.txt', {}], ['example/SKILL.md', { unixPermissions: 0o120777 }]]) {
    const zip = new JSZip(); zip.file(name, 'unsafe', { createFolders: false, ...options })
    const bytes = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
    await assert.rejects(extractPackage(bytes, path.join(f.root, 'packages'), { ...f.pkg, bytes: bytes.length, sha256: digest(bytes) }))
  }
  assert.equal(fs.existsSync(path.join(f.root, 'escape')), false)
})
test('shared downloads are deduplicated and modified cache is never overwritten', async t => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.manager.download(f.item), f.manager.download(f.item)])
  assert.equal(a, b); assert.equal(f.calls(), 1); assert(verifyDirectory(a, f.pkg))
  fs.writeFileSync(path.join(a, 'example/SKILL.md'), 'local edit')
  await assert.rejects(f.manager.download(f.item), /已修改/)
  assert.equal(fs.readFileSync(path.join(a, 'example/SKILL.md'), 'utf8'), 'local edit')
})
test('private HTTP sidecar checks real account endpoint contract before full, HEAD or Range downloads', async t => {
  const f = await fixture(t), root = path.join(f.root, 'server'); fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(f.catalog)); fs.writeFileSync(path.join(root, 'packages', f.pkg.sha256 + '.zip'), f.bytes)
  let accountCalls = 0
  const server = createSkillServer({ root, fetchImpl: async (_url, options) => {
    accountCalls++; assert.equal(options.headers.authorization, 'Bearer test-device-token')
    return Response.json({ account: { status: 'active', mustChangePassword: false } })
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close() })
  const base = 'http://127.0.0.1:' + server.address().port, url = base + '/api/skills/packages/' + f.pkg.sha256
  assert.equal((await fetch(url)).status, 401); assert.equal(accountCalls, 0)
  const headers = { authorization: 'Bearer test-device-token' }
  assert.equal((await fetch(url, { method: 'HEAD', headers })).status, 200)
  const range = await fetch(url, { headers: { ...headers, range: 'bytes=0-7' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 8)
  assert.equal((await fetch(url, { headers: { ...headers, range: 'bytes=999999-' } })).status, 416)
  f.account.baseURL = base; f.account.fetch = globalThis.fetch
  await f.manager.install(f.item.id); assert.equal(f.store.listSkills().length, 1)
})
test('all 617 catalog skill entries and ten plugin entries refer to locked resource files', () => {
  const catalog = require('../desktop/skills/cloud-catalog.json')
  assert.equal(catalog.items.filter(s => s.kind === 'skill').length, 617)
  assert.equal(catalog.items.filter(s => s.kind === 'plugin').length, 2)
  for (const item of catalog.items) for (const skill of item.pluginSkills || [item]) {
    const name = skill.directory ? skill.directory + '/SKILL.md' : 'SKILL.md'
    assert(catalog.packages[item.packageId].files[name], skill.id)
  }
})

test('account denial, required password changes and account service failure cannot expose package bytes', async t => {
  const f = await fixture(t), root = path.join(f.root, 'server'); fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(f.catalog)); fs.writeFileSync(path.join(root, 'packages', f.pkg.sha256 + '.zip'), f.bytes)
  let response
  const server = createSkillServer({ root, fetchImpl: async () => { if (response instanceof Error) throw response; return response } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close() })
  const url = 'http://127.0.0.1:' + server.address().port + '/api/skills/packages/' + f.pkg.sha256
  for (const [value, expected] of [
    [new Response('', { status: 401 }), 401], [new Response('', { status: 403 }), 403],
    [Response.json({ account: { status: 'disabled' } }), 403],
    [Response.json({ account: { status: 'active', mustChangePassword: true } }), 403],
    [Response.json({}), 403], [new Response('', { status: 500 }), 503], [Error('unavailable'), 503],
  ]) {
    response = value
    const result = await fetch(url, { headers: { authorization: 'Bearer test-device-token' } })
    assert.equal(result.status, expected); assert.match(result.headers.get('content-type'), /application\/json/)
  }
})
test('offline migration preserves user text, disabled state, ID and conversation references', async t => {
  const f = await fixture(t), source = path.join(f.root, 'legacy')
  for (const [name, content] of Object.entries(f.files)) { const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) }
  const old = { id: f.item.id, name: 'Custom name', description: 'Custom description', path: path.join(source, 'example'), content: 'User instructions at ' + path.join(source, 'example') }
  f.store.upsertSkill(old); f.store.setSkillEnabled(old.id, false)
  const id = f.store.activeConversationId(); f.store.setSetting('conversation-skills:' + id, [old.id])
  assert.equal(f.manager.migrateLocal().migrated, 1)
  const migrated = f.store.listSkills()[0]
  assert.equal(migrated.name, old.name); assert.equal(migrated.enabled, false); assert(migrated.content.startsWith('User instructions at '))
  assert(!migrated.content.includes(source)); assert.equal(f.calls(), 0)
  assert.deepEqual(f.store.getSetting('conversation-skills:' + id), [old.id]); assert.equal(f.manager.migrateLocal().migrated, 0)
})
test('migration reports modified source without altering records or files', async t => {
  const f = await fixture(t), source = path.join(f.root, 'legacy/example'); fs.mkdirSync(source, { recursive: true }); fs.writeFileSync(path.join(source, 'SKILL.md'), 'user edited file')
  f.store.upsertSkill({ id: f.item.id, name: 'Edited', description: '', path: source, content: 'keep' })
  assert.deepEqual(f.manager.migrateLocal().conflicts, [f.item.id]); assert.equal(f.store.listSkills()[0].path, source)
})

test('upgrade preserves bundled skills before the install directory moves and its backup retains their original records', async t => {
  const f = await fixture(t), install = path.join(f.root, 'Stable'), source = path.join(install, 'resources/filtered-skills')
  for (const [name, content] of Object.entries(f.files)) { const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) }
  const old = { id: f.item.id, name: 'Custom name', description: 'Custom description', path: path.join(source, 'example'), content: 'User notes at ' + path.join(source, 'example') }
  f.store.upsertSkill(old); f.store.setSkillEnabled(old.id, false)
  const conversation = f.store.activeConversationId(); f.store.setSetting('conversation-skills:' + conversation, [old.id])
  const previousMode = process.env.STABLE_SKILL_DELIVERY
  process.env.STABLE_SKILL_DELIVERY = 'cloud'
  let snapshot
  try { snapshot = require('../desktop/services/upgrade-maintenance.cjs').maintain({ args: ['--stable-upgrade-backup'], userData: f.root, version: '1.11.3', cloudCatalog: f.catalog }) }
  finally { if (previousMode === undefined) delete process.env.STABLE_SKILL_DELIVERY; else process.env.STABLE_SKILL_DELIVERY = previousMode }
  t.after(() => { if (snapshot && path.basename(path.dirname(snapshot)) === path.basename(f.root) + '-upgrade-backups') fs.rmSync(path.dirname(snapshot), { recursive: true, force: true }) })
  const moved = install + '.__stable_previous_1.11.3'
  assert.equal(path.dirname(moved), f.root); fs.renameSync(install, moved)
  const migrated = f.store.listSkills()[0]
  assert.notEqual(migrated.path, old.path); assert.equal(migrated.name, old.name); assert.equal(migrated.enabled, false)
  assert.equal(fs.readFileSync(path.join(migrated.path, '../shared/helper.txt'), 'utf8'), 'shared dependency')
  assert(migrated.content.startsWith('User notes at ')); assert(!migrated.content.includes(source))
  assert.deepEqual(f.store.getSetting('conversation-skills:' + conversation), [old.id]); assert.equal(f.calls(), 0)
  const { DatabaseSync } = require('node:sqlite'), saved = new DatabaseSync(path.join(snapshot, 'profile/stable.db'), { readOnly: true })
  try { const record = saved.prepare('SELECT path,content,enabled FROM skills WHERE id=?').get(old.id); assert.equal(record.path, old.path); assert.equal(record.content, old.content); assert.equal(record.enabled, 0) } finally { saved.close() }
})

test('background migration leaves the main event loop free and preserves edits made during copying', async t => {
  const f = await fixture(t), source = path.join(f.root, 'legacy')
  for (const [name, content] of Object.entries(f.files)) { const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) }
  const old = { id: f.item.id, name: 'Old', description: '', path: path.join(source, 'example'), content: 'original text' }
  f.store.upsertSkill(old)
  const pending = f.manager.migrateLocalInBackground()
  f.store.upsertSkill({ ...old, content: 'edited while copying' })
  let responsive = false; await new Promise(resolve => setImmediate(() => { responsive = true; resolve() }))
  const result = await pending
  assert(responsive); assert.equal(result.migrated, 0); assert.deepEqual(result.conflicts, [old.id])
  assert.equal(f.store.listSkills()[0].content, 'edited while copying')
  const retry = await f.manager.migrateLocalInBackground()
  assert.equal(retry.migrated, 1); assert.equal(f.store.listSkills()[0].content, 'edited while copying')
})
