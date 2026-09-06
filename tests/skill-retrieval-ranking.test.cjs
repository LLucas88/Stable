'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
test('Chinese intent matches skill titles ahead of repeated text in unrelated long workflows', t => {
  const store = new StableStore(fs.mkdtempSync(path.join(os.tmpdir(), 'stable-ranking-')))
  t.after(() => store.close())
  store.upsertSkill({ id: 'research', name: '用户访谈与研究综合', description: '访谈资料归纳', path: '.', content: '提取访谈证据与用户观点。' })
  store.upsertSkill({ id: 'unrelated', name: '长篇营销内容', description: '营销', path: '.', content: '用户访谈研究综合'.repeat(200) })
  assert.equal(store.retrieveSkills('用户访谈研究综合')[0].name, '用户访谈与研究综合')
  store.setSkillEnabled('research', false)
  assert.equal(store.retrieveSkills('用户访谈研究综合').length, 1)
})
