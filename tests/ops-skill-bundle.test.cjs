'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createHash } = require('node:crypto')
const { StableStore } = require('../desktop/services/store.cjs')
const { SkillMarket } = require('../desktop/services/skill-market.cjs')
const { installBundle, inspectBundle, setSkillEnabled, removeSkill, storeId, applyLocalSkillConfig } = require('../desktop/services/ops-skill-bundle.cjs')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')
const hash = text => createHash('sha256').update(text).digest('hex')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-ops-'))
  const bundle = path.join(root, 'bundle'), store = new StableStore(path.join(root, 'profile'))
  t.after(() => store.close())
  const entries = [
    { id: 'startup-metrics-framework', sourcePackage: 'market', platform: 'WorkBuddy', content: '# 会员复购指标\n依据订单计算会员复购率。' },
    { id: 'lark-im', sourcePackage: 'market', platform: 'TRAE Work', content: '# 飞书发送' },
    { id: 'lark-im', sourcePackage: 'doubao', platform: '豆包工作', content: '# 另一套飞书' },
    { id: 'seed-audio', sourcePackage: 'doubao', platform: '豆包工作', content: '# 专用音频工具' },
  ]
  const files = [], skills = entries.map(s => {
    const skillDirectory = 'sources/' + s.sourcePackage + '/' + s.id
    fs.mkdirSync(path.join(bundle, skillDirectory, 'references'), { recursive: true })
    for (const [name, text] of [['SKILL.md', s.content], ['references/example.md', '保留附件']]) {
      const relative = skillDirectory + '/' + name
      fs.writeFileSync(path.join(bundle, relative), text)
      files.push({ path: relative, sha256: hash(text) })
    }
    return { ...s, uid: s.sourcePackage + ':' + s.id, displayName: s.id, categoryId: '01', score: 90, reason: '会员复购分析', dependencies: [], caveats: [], skillDirectory, skillPath: skillDirectory + '/SKILL.md', skillMdSha256: hash(s.content) }
  })
  fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ skills, categories: [{ id: '01', name: '会员增长与客户经营' }] }))
  fs.writeFileSync(path.join(bundle, 'files.sha256.json'), JSON.stringify(files))
  return { root, bundle, store, skills }
}

test('registers distinct versions and resources; only compatible non-Feishu workflows reach the prompt', t => {
  const { bundle, store } = fixture(t), result = installBundle(store, bundle)
  assert.equal(result.registered, 1); assert.equal(result.excludedFeishu, 2); assert.equal(result.excludedUnavailable, 1); assert.equal(result.enabled, 1)
  assert.equal(new Set(store.listSkills().map(s => s.name)).size, 1)
  const selected = [store.skillContent('ops-market-startup-metrics-framework')]
  assert.equal(selected.length, 1)
  const prompt = composeAgentPrompt({ identity: 'Stable', query: '会员复购指标', history: [], data: [], knowledge: [], skills: selected })
  assert(prompt.includes(path.join(bundle, 'sources/market/startup-metrics-framework')))
  assert(prompt.includes('依据订单计算会员复购率'))
  assert(!prompt.includes('# 飞书发送'))
  const market = new SkillMarket(store, path.dirname(bundle))
  const entry = market.entries().find(s => s.id === 'ops-market-startup-metrics-framework')
  assert.equal(entry.group, '会员增长与客户经营'); assert(entry.bundled)
  const conversation = market.use(entry.id)
  assert.equal(store.getSetting('draft-reference:' + conversation).id, entry.id)
  assert.throws(() => market.toggle('ops-market-lark-im', true), /飞书/)
  assert.throws(() => setSkillEnabled(store, 'ops-doubao-seed-audio', true), /音频/)
})

test('restart preserves disabled choices and edited content, and never resurrects removed entries', t => {
  const { bundle, store } = fixture(t)
  installBundle(store, bundle)
  const item = store.listSkills().find(s => s.enabled)
  store.upsertSkill({ ...item, content: '用户修改的正文' })
  setSkillEnabled(store, item.id, false)
  installBundle(store, bundle)
  assert.equal(store.listSkills().find(s => s.id === item.id).content, '用户修改的正文')
  assert.equal(store.listSkills().find(s => s.id === item.id).enabled, false)
  removeSkill(store, item.id)
  assert.equal(installBundle(store, bundle).skippedRemoved, 1)
  assert(!store.listSkills().some(s => s.id === item.id))
})

test('tampered supporting files and paths outside the bundle fail before any database writes', t => {
  const { bundle, store, skills } = fixture(t)
  const ref = path.join(bundle, skills[0].skillDirectory, 'references/example.md')
  fs.writeFileSync(ref, 'changed')
  assert.throws(() => installBundle(store, bundle), /校验失败/)
  assert.equal(store.listSkills().length, 0)
  fs.writeFileSync(ref, '保留附件')
  const hashesPath = path.join(bundle, 'files.sha256.json')
  const hashes = JSON.parse(fs.readFileSync(hashesPath))
  hashes[0].path = '../outside'
  fs.writeFileSync(hashesPath, JSON.stringify(hashes))
  assert.throws(() => inspectBundle(bundle), /超出/)
})

test('existing user ID collisions roll back the entire import', t => {
  const { bundle, store, skills } = fixture(t)
  store.upsertSkill({ id: storeId(skills[1].uid), name: '用户技能', description: '', path: 'local', content: 'keep' })
  assert.throws(() => installBundle(store, bundle), /编号冲突/)
  assert.equal(store.listSkills().length, 1)
  assert.equal(store.listSkills()[0].content, 'keep')
  assert(!store.getSetting('skillMarketMeta'))
})

test('optional missing or invalid installation configuration does not break app startup', t => {
  const { root, store } = fixture(t)
  assert.equal(applyLocalSkillConfig({ appPath: root, userData: root, store }), null)
  fs.writeFileSync(path.join(root, '.stable-ops-skills.json'), '{bad')
  assert(applyLocalSkillConfig({ appPath: root, userData: root, store }).error)
  assert(store.activeConversationId())
})

test('removes previously imported Feishu skills and does not reimport them on restart', t => {
  const {bundle,store}=fixture(t)
  const id='ops-market-lark-im'
  store.upsertSkill({id,name:'飞书聊天',path:'local',description:'',content:'旧的飞书正文'})
  store.setSetting('skillMarketMeta',{[id]:{bundle:require('../desktop/services/ops-skill-bundle.cjs').BUNDLE_ID,policyPaused:true}})
  const first=installBundle(store,bundle)
  assert.equal(first.excludedFeishu,2)
  assert(!store.listSkills().some(item=>item.id===id))
  assert.equal(store.getSetting('skillMarketMeta')[id].removed,true)
  installBundle(store,bundle)
  assert(!store.listSkills().some(item=>/lark/.test(item.id)))
})

test('generic online-document caveats do not qualify a skill for deletion', () => {
  const {isFeishuSkill}=require('../desktop/services/ops-skill-bundle.cjs')
  assert.equal(isFeishuSkill({id:'data-analysis',caveats:['部分流程强制输出在线文档'],content:'分析本地数据'}),false)
  assert.equal(isFeishuSkill({id:'campaign',content:'最终必须创建并交付飞书文档。'}),true)
  assert.equal(isFeishuSkill({id:'campaign',content:'可选 Word、Markdown 或飞书文档'}),false)
})

test('removes blocked imports while retaining manually disabled and custom skills across restarts', t => {
  const {bundle,store}=fixture(t)
  const id='ops-doubao-seed-audio'
  store.upsertSkill({id,name:'音频生成',path:'local',description:'',content:'旧的音频说明'})
  store.setSetting('skillMarketMeta',{[id]:{bundle:require('../desktop/services/ops-skill-bundle.cjs').BUNDLE_ID,compatibility:'dependency-pending'}})
  store.upsertSkill({id:'my-skill',name:'自建技能',path:'local',description:'',content:'保留自建内容'})
  const first=installBundle(store,bundle)
  assert.equal(first.excludedUnavailable,1)
  assert(!store.listSkills().some(item=>item.id===id))
  assert.equal(store.getSetting('skillMarketMeta')[id].removalReason,'unavailable-excluded')
  setSkillEnabled(store,'ops-market-startup-metrics-framework',false)
  installBundle(store,bundle)
  assert(!store.listSkills().some(item=>item.id===id))
  assert.equal(store.listSkills().find(item=>item.id==='ops-market-startup-metrics-framework').enabled,false)
  assert.equal(store.listSkills().find(item=>item.id==='my-skill').content,'保留自建内容')
  assert.throws(()=>setSkillEnabled(store,id,true),/音频/)
})
