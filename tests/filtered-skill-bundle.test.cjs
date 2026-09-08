'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { SkillMarket } = require('../desktop/services/skill-market.cjs')
const { digest } = require('../desktop/services/tencenthub-skill-bundle.cjs')
const { createBundleManager, inspectBundle } = require('../desktop/services/filtered-skill-bundle.cjs')
const { selectedByScreenshot } = require('../scripts/prepare-filtered-skills.cjs')

test('the actual shipped selection contains exactly the screenshot 617 and every resource passes its hash', () => {
  const bundle = inspectBundle(path.resolve(__dirname, '../desktop/skills/filtered/bundle'))
  assert.equal(bundle.skills.length, 617)
  assert(bundle.skills.every(selectedByScreenshot))
  assert.equal(bundle.checkedFiles, 3696)
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-filtered-')), bundle = path.join(root, 'bundle')
  const dir = path.join(bundle, 'packages/example'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Evidence skill')
  fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT test fixture')
  const manifest = { bundle: 'fixture', skills: [{ id: 'one', original_name: 'one', description_original: '会员分析', matched_modules: ['会员运营'], source_type: 'github', max_score: 60, runtime: ['文本工作流'], path: 'packages/example', external_service_possible: false, license: 'MIT', skill_md_sha256: digest('# Evidence skill') }],
    files: ['SKILL.md', 'LICENSE'].map(file => ({ path: 'packages/example/' + file, sha256: digest(fs.readFileSync(path.join(dir, file))) })) }
  const bytes = JSON.stringify(manifest); fs.writeFileSync(path.join(bundle, 'manifest.json'), bytes)
  const manager = createBundleManager({ bundle: 'fixture', selectedCount: 1, manifestSha256: digest(bytes) })
  const store = new StableStore(path.join(root, 'profile')); t.after(() => store.close())
  return { root, bundle, dir, manager, store }
}

test('manual install retains user edits, disabled choices, and removal on subsequent startup', t => {
  const { root, bundle, manager, store } = fixture(t)
  assert.equal(manager.installBundle(store, bundle).added, 1)
  const market = new SkillMarket(store, root), item = store.listSkills()[0]
  assert.equal(item.invocationMode, 'manual')
  assert.equal(market.entries().find(s => s.id === item.id).activationBlocked, false)
  market.toggle(item.id, false); market.toggle(item.id, true)
  const conversation = market.use(item.id)
  assert.equal(store.getSetting('draft-reference:' + conversation).id, item.id)
  store.upsertSkill({ ...item, content: 'my edit' }); market.toggle(item.id, false)
  manager.installBundle(store, bundle)
  assert.equal(store.listSkills()[0].content, 'my edit'); assert.equal(store.listSkills()[0].enabled, false)
  market.remove(item.id)
  assert.equal(manager.installBundle(store, bundle).skippedRemoved, 1)
})

test('tampered resources fail before writes; a different user profile is not populated', t => {
  const { root, bundle, dir, manager, store } = fixture(t)
  fs.writeFileSync(path.join(root, '.stable-filtered-skills.json'), JSON.stringify({ version: 1, bundlePath: 'bundle', userData: 'profile' }))
  assert.equal(manager.applyLocalSkillConfig({ appPath: root, userData: path.join(root, 'another'), isPackaged: false, store }).skipped, 'profile-mismatch')
  fs.writeFileSync(path.join(dir, 'LICENSE'), 'changed')
  assert.throws(() => manager.installBundle(store, bundle), /校验/)
  assert.equal(store.listSkills().length, 0)
})

test('packaged startup registers bundled skills outside asar while preserving history and edits', t => {
  const { root, bundle, manager, store } = fixture(t)
  const appPath = path.join(root, 'app.asar')
  fs.cpSync(bundle, path.join(root, 'filtered-skills'), { recursive: true })
  const id = store.activeConversationId()
  store.addMessage(id, 'user', 'existing history')
  const options = { appPath, userData: path.join(root, 'profile'), isPackaged: true, store }
  assert.equal(manager.applyLocalSkillConfig(options).added, 1)
  const skill = store.listSkills()[0]
  assert(skill.path.startsWith(path.join(root, 'profile', 'bundled-skills')))
  assert.equal(fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8'), '# Evidence skill')
  store.upsertSkill({ ...skill, content: 'my custom edit' })
  assert.equal(manager.applyLocalSkillConfig(options).added, 0)
  assert.equal(store.listSkills()[0].content, 'my custom edit')
  assert.equal(store.listMessages(id)[0].content, 'existing history')
})
