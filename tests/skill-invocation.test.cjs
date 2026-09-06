'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { StableStore } = require('../desktop/services/store.cjs')
const { requestedWorkbenchAction } = require('../desktop/services/inventory.cjs')
const { manualSkillContext, assertWorkflowSkillInvocation } = require('../desktop/services/skill-invocation.cjs')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')

test('existing and newly installed enabled skills never enter ambient retrieval', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-manual-')), store = new StableStore(root)
  t.after(() => store.close())
  store.upsertSkill({ id: 'crm', name: '会员分析', description: '会员运营', path: '.', content: 'ONLY_SELECTED_SKILL_BODY' })
  assert.equal(store.listSkills()[0].invocationMode, 'manual')
  assert.deepEqual(store.retrieveSkills('会员分析'), [])
  assert.deepEqual(store.enabledSkillContent(), [])
  assert.deepEqual(manualSkillContext({ skills: store.listSkills() }), [])
  const selected = manualSkillContext({ manualSkillInvocation: true, skills: [store.skillContent('crm')] })
  assert.equal(selected.length, 1)
  const base = { identity: 'Stable', query: '分析会员运营', history: [], data: [], knowledge: [] }
  assert(!composeAgentPrompt({ ...base, skills: manualSkillContext() }).includes('ONLY_SELECTED_SKILL_BODY'))
  assert(composeAgentPrompt({ ...base, skills: selected }).includes('ONLY_SELECTED_SKILL_BODY'))
  store.setSkillEnabled('crm', false)
  assert.equal(store.skillContent('crm'), undefined)
})

test('only direct named commands activate a skill, never negation, discussion, or fuzzy singleton fallback', () => {
  const resources = { skills: [{ id: 'crm', name: '会员分析', enabled: true }] }
  for (const query of ['会员运营怎么做', '会员分析', '不要使用会员分析', '请不要调用会员分析', '解释如何使用会员分析', '使用会员分析的方法是什么', '使用会员分析 Skill 的方法是什么', '处理这个 skill', '下面是例子：使用会员分析', '请使用会员分析师']) {
    assert.equal(requestedWorkbenchAction(query, resources), null, query)
  }
  for (const query of ['使用会员分析 Skill', '请调用 会员分析，分析这份报表', '请帮我使用会员分析', '调用 crm']) {
    assert.equal(requestedWorkbenchAction(query, resources)?.item.id, 'crm', query)
  }
})

test('scheduled workflows cannot inject skill nodes, while a manual workflow can', () => {
  const graph = { nodes: [{ type: 'skill', resourceId: 'crm' }, { type: 'ai' }] }
  assert.throws(() => assertWorkflowSkillInvocation(graph, false), /手动/)
  assert.doesNotThrow(() => assertWorkflowSkillInvocation(graph, true))
  assert.doesNotThrow(() => assertWorkflowSkillInvocation({ nodes: [{ type: 'ai' }] }, false))
})
