'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { composeAgentPrompt, composeAgentContext, composeAgentTurn } = require('../desktop/services/prompts.cjs')
const { StableStore } = require('../desktop/services/store.cjs')

test('current message is excluded by ID before budgeting, without deleting identical historical messages', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-prompt-continuity-'))
  const store = new StableStore(root)
  t.after(() => { store.close(); assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, {recursive:true,force:true}) })
  const id = store.activeConversationId(), content = 'record-'.repeat(20000)
  const old = store.addMessage(id, 'user', '重复发送是合法内容')
  store.addMessage(id, 'assistant', '收到')
  const repeated = store.addMessage(id, 'user', '重复发送是合法内容')
  const current = store.addMessage(id, 'user', content)
  const history = store.recentContext(id, undefined, current.id)
  assert(history.some(m => m.id === old.id)); assert(history.some(m => m.id === repeated.id))
  assert(!history.some(m => m.id === current.id))
  const prompt = composeAgentPrompt({identity:'Stable',query:content,history})
  assert.equal(prompt.split(content).length - 1, 1)
  assert.equal(store.listMessages(id).length, 4)
})

test('turns keep fresh attachments and delivery requirements without repeating the rule/catalog prefix', () => {
  const options = {identity:'Stable',globalInstructions:'unique-global-rule',query:'继续处理',history:[],
    skills:[{name:'selected-test',path:'C:/skills/test',content:'unique-skill-body'}],
    attachments:[{name:'latest.txt',path:'D:/work/latest.txt',text:'fresh attachment data'}],delivery:{type:'artifact'}}
  const context = composeAgentContext(options), turn = composeAgentTurn(options)
  assert.match(context,/unique-global-rule/); assert.match(context,/unique-skill-body/)
  assert.doesNotMatch(turn,/unique-global-rule|unique-skill-body|## 执行约束|## 当前 Skill 选择/)
  assert.match(turn,/fresh attachment data/); assert.match(turn,/本次交付要求/)
  assert.equal(composeAgentPrompt(options), context+'\n\n'+turn)
  assert.notEqual(composeAgentContext({...options,globalInstructions:'new-rule'}),context)
})
