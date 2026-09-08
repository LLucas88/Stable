'use strict'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const resources = path.resolve(process.argv[2]), appPath = path.join(resources, 'app.asar')
const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'stable-packaged-skills-'))
const { StableStore } = require(path.join(appPath, 'desktop/services/store.cjs'))
const manager = require(path.join(appPath, 'desktop/services/filtered-skill-bundle.cjs'))
assert.equal(manager.inspectBundle(path.join(resources, 'filtered-skills')).skills.length, 617)
const store = new StableStore(root)
try {
  const id = store.activeConversationId()
  store.addMessage(id, 'user', 'Preserve this existing conversation')
  const result = manager.applyLocalSkillConfig({ appPath, userData: root, isPackaged: true, store })
  assert.equal(result.registered, 617)
  assert.equal(store.listSkills().length, 617)
  for (const skill of store.listSkills()) {
    assert(skill.path.startsWith(root))
    assert(fs.existsSync(path.join(skill.path, 'SKILL.md')))
  }
  assert.equal(store.listMessages(id)[0].content, 'Preserve this existing conversation')
  const plugins = require(path.join(appPath, 'desktop/plugins/catalog.json'))
  assert.equal(plugins.length, 2)
  for (const plugin of plugins) assert(fs.existsSync(path.join(appPath, 'desktop/plugins', plugin.id + '.zip')))
  console.log('PACKAGED_SKILLS_PASS: 617 skills, two plugin bundles, preserved conversation')
} finally { store.close() }
