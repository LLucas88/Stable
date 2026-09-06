'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { StableStore } = require('../desktop/services/store.cjs')
const { SkillMarket } = require('../desktop/services/skill-market.cjs')
const { createBundleManager, digest, contained } = require('../desktop/services/tencenthub-skill-bundle.cjs')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-tencenthub-'))
  const store = new StableStore(path.join(root, 'profile'))
  t.after(() => store.close())
  const items = ['alpha', 'beta'].map(slug => ({ slug, decision: 'migrate', name: '测试' + slug, description: '资料检索', version: '1.0.0', group: '通用工具与依赖支持', reason: '本地工作流' }))
  const files = [], skills = items.map(item => {
    const directory = 'skills/' + item.slug, entry = directory + '/SKILL.md'
    fs.mkdirSync(path.join(root, directory), { recursive: true })
    for (const [relative, content] of [[entry, '---\nname: ' + item.slug + '\ndescription: "资料检索"\n---\n\n工作说明'], [directory + '/reference.md', '参考资料']]) {
      fs.writeFileSync(path.join(root, relative), content)
      files.push({ path: relative, sha256: digest(content) })
    }
    return { slug: item.slug, directory, entry }
  })
  const lock = { schemaVersion: 1, bundle: 'tencenthub-test', skills, files }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(lock))
  return { root, store, lock, manager: createBundleManager({ bundle: lock.bundle, items }, lock) }
}
test('registers resources in the existing market and supports direct use', t => {
  const { root, store, manager } = fixture(t)
  assert.equal(manager.installBundle(store, root).added, 2)
  const market = new SkillMarket(store, root), entry = market.entries().find(x => x.id === 'tencenthub-alpha')
  assert(entry.bundled)
  assert.equal(entry.version, '1.0.0')
  assert.equal(entry.activationBlocked, false)
  const conversation = market.use(entry.id)
  assert.equal(store.getSetting('draft-reference:' + conversation).id, entry.id)
  assert(store.skillContent(entry.id).content.includes(path.join(root, 'skills/alpha')))
})
test('reinstallation preserves edits, disable choices, and deletion tombstones', t => {
  const { root, store, manager } = fixture(t)
  manager.installBundle(store, root)
  const market = new SkillMarket(store, root), item = store.listSkills().find(x => x.id === 'tencenthub-alpha')
  store.upsertSkill({ ...item, name: '我的技能名', content: '用户自己的内容' })
  market.toggle(item.id, false)
  market.remove('tencenthub-beta')
  const result = manager.installBundle(store, root)
  assert.equal(result.added, 0)
  assert.equal(result.skippedRemoved, 1)
  assert.deepEqual(store.listSkills().map(x => [x.name, x.content, x.enabled]), [['我的技能名', '用户自己的内容', false]])
})
test('existing disabled duplicate stays disabled and is not duplicated', t => {
  const { root, store, manager } = fixture(t)
  store.upsertSkill({ id: 'custom', name: 'alpha', description: '', path: '', content: 'keep' })
  store.setSkillEnabled('custom', false)
  assert.equal(manager.installBundle(store, root).skippedDuplicate, 1)
  assert.equal(store.listSkills().find(x => x.id === 'custom').enabled, false)
  assert(!store.listSkills().some(x => x.id === 'tencenthub-alpha'))
})
test('a collision after the first insert rolls back all registry writes', t => {
  const { root, store, manager } = fixture(t)
  store.upsertSkill({ id: 'tencenthub-beta', name: 'custom', description: '', path: '', content: 'keep' })
  assert.throws(() => manager.installBundle(store, root), /编号冲突/)
  assert.equal(store.listSkills().length, 1)
  assert.equal(store.getSetting('skillMarketMeta'), undefined)
})
test('tampering fails before writing even when a local manifest is rehashed', t => {
  const { root, store, manager, lock } = fixture(t)
  const file = lock.files[1]
  fs.writeFileSync(path.join(root, file.path), 'tampered')
  assert.throws(() => manager.installBundle(store, root), /校验失败/)
  const forged = structuredClone(lock)
  forged.files[1].sha256 = digest('tampered')
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(forged))
  assert.throws(() => manager.installBundle(store, root), /锁定版本/)
  assert.equal(store.listSkills().length, 0)
})
test('resource traversal and missing or malformed optional config are handled', t => {
  const { root, store, manager } = fixture(t)
  for (const relative of ['../outside', 'C:/outside', 'skills\\alpha', '/outside', 'skills/./alpha']) assert.throws(() => contained(root, relative), /无效/)
  assert.equal(manager.applyLocalSkillConfig({ appPath: root, userData: root, store }), null)
  fs.writeFileSync(path.join(root, '.stable-tencenthub-skills.json'), '{bad')
  assert(manager.applyLocalSkillConfig({ appPath: root, userData: root, store }).error)
  assert(store.activeConversationId())
})

test('startup sync is bound to the explicitly installed profile and never writes another profile', t => {
  const { root, store, manager } = fixture(t)
  fs.writeFileSync(path.join(root, '.stable-tencenthub-skills.json'), JSON.stringify({ version: 1, bundlePath: '.', userData: 'profile' }))
  assert.deepEqual(manager.applyLocalSkillConfig({ appPath: root, userData: path.join(root, 'other-profile'), store }), { skipped: 'profile-mismatch' })
  assert.equal(store.listSkills().length, 0)
  assert.equal(store.getSetting('tencenthubSkillInstallation'), undefined)
  assert.equal(manager.applyLocalSkillConfig({ appPath: root, userData: path.join(root, 'profile'), store }).added, 2)
})