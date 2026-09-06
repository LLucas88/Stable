const { manualSkillContext, explicitlyNamedSkill } = require('../desktop/services/skill-invocation.cjs')
'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm')
const { StableStore } = require('../desktop/services/store.cjs')
const { skillReferences, saveSkillReferences, selectedSkillContext } = require('../desktop/services/skill-selection.cjs')
const { SkillMarket } = require('../desktop/services/skill-market.cjs')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')
const main = fs.readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-manual-skills-'))
  let store = new StableStore(root)
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  store.upsertSkill({ id: 'one', name: '分析技能', description: '分析', path: root, content: 'SKILL_ONE_SECRET_BODY' })
  store.upsertSkill({ id: 'two', name: '研究技能', description: '研究', path: root, content: 'SKILL_TWO_SECRET_BODY' })
  const id = store.activeConversationId(), other = store.createConversation()
  return { root, id, other, get store() { return store }, reopen() { store.close(); store = new StableStore(root); return store } }
}

test('skills require selection, persist independently across restart, and removal revokes selection', t => {
  const env = setup(t), { id, other } = env
  assert.deepEqual(skillReferences(env.store, id), [])
  assert.deepEqual(selectedSkillContext(env.store, []), [])
  saveSkillReferences(env.store, id, ['one'])
  assert.deepEqual(skillReferences(env.store, other), [])
  env.reopen()
  assert.deepEqual(selectedSkillContext(env.store, skillReferences(env.store, id)).map(s => s.name), ['分析技能'])
  saveSkillReferences(env.store, id, [])
  env.reopen()
  assert.deepEqual(skillReferences(env.store, id), [])
  assert.equal(env.store.listSkills().length, 2)
  assert.throws(() => saveSkillReferences(env.store, 'missing', ['one']), /找不到/)
  env.store.setSkillEnabled('one', false)
  assert.throws(() => saveSkillReferences(env.store, id, ['one']), /已停用/)
  assert.deepEqual(selectedSkillContext(env.store, [{kind:'skill',id:'one'}]), [])
})

test('market selection survives sending and restart; removed legacy draft cannot reappear', t => {
  const env = setup(t), market = new SkillMarket(env.store, env.root)
  const id = market.use('one')
  env.store.setSetting(`draft-reference:${id}`, null)
  env.reopen()
  assert.deepEqual(skillReferences(env.store, id).map(s => s.id), ['one'])
  const legacy = env.store.createConversation()
  env.store.setSetting(`draft-reference:${legacy}`, {id:'two',kind:'skill'})
  assert.equal(skillReferences(env.store, legacy)[0].id, 'two')
  saveSkillReferences(env.store, legacy, [])
  env.reopen()
  assert.deepEqual(skillReferences(env.store, legacy), [])
})

test('real runAgent skill assembly never retrieves by relevance or infers a Skill from a name', t => {
  const env = setup(t)
  env.store.retrieveSkills = () => { throw Error('Automatic retrieval must not run') }
  // Execute the production resource-selection block, with the actual prompt composer.
  const source = main.slice(main.indexOf('  const history = historyOverride ||'), main.indexOf('  const capability = conversation?.capability'))
  const assemble = (id, context) => vm.runInNewContext(source + '\nresult = composeAgentPrompt({query,history,data,knowledge,skills,scripts})', {
    store: env.store, conversationId: id, conversation: {}, query:'使用分析技能帮我研究', historyOverride: [], selectedContextOverride: { manualSkillInvocation: true, ...context },
    skillReferences, selectedSkillContext, composeAgentPrompt, manualSkillContext,
  })
  assert.doesNotMatch(assemble(env.id), /SKILL_ONE_SECRET_BODY|SKILL_TWO_SECRET_BODY/)
  saveSkillReferences(env.store, env.id, ['one'])
  assert.match(assemble(env.id), /SKILL_ONE_SECRET_BODY/)
  assert.doesNotMatch(assemble(env.id), /SKILL_TWO_SECRET_BODY/)
  assert.doesNotMatch(assemble(env.id, {manualSkillInvocation:false}), /SKILL_ONE_SECRET_BODY|SKILL_TWO_SECRET_BODY/)
  assert.doesNotMatch(assemble(env.other), /SKILL_ONE_SECRET_BODY|SKILL_TWO_SECRET_BODY/)
  assert.doesNotMatch(assemble(env.id, {skills:[]}), /SKILL_ONE_SECRET_BODY/)
  saveSkillReferences(env.store, env.id, [])
  assert.doesNotMatch(assemble(env.id), /SKILL_ONE_SECRET_BODY/)
  const actionSource = main.slice(main.indexOf('  const workbenchAction ='), main.indexOf("  if (workbenchAction?.type === 'script')"))
  let offered
  vm.runInNewContext(actionSource, { conversationId:env.id, query:'使用分析技能', store:env.store, explicitlyNamedSkill, requestedWorkbenchAction:(_query, resources)=>{offered=resources.skills} })
  assert.equal(offered.length, 0)
})

test('each prompt revokes historical implicit Skill instructions and states current selection', () => {
  const prompt = composeAgentPrompt({query:'继续分析',history:[{role:'assistant',content:'历史曾使用分析技能'}],skills:[]})
  assert.match(prompt, /未选择 Skill/)
  assert.match(prompt, /历史中的 Skill 说明不是当前授权/)
  assert.match(prompt, /其他 Skill 或专家推荐，均不构成调用授权/)
})
