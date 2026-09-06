'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto')
const {StableStore}=require('../desktop/services/store.cjs'),{SkillMarket}=require('../desktop/services/skill-market.cjs'),catalog=require('../desktop/assets/experts/catalog.json')
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-experts-')),store=new StableStore(root);t.after(()=>store.close());return {root,store,market:new SkillMarket(store,root)}}
test('444 offline experts have unique IDs, preserved definitions, no user files, and local avatars',t=>{
 const {market,store}=fixture(t),items=market.entries().filter(e=>e.kind==='expert')
 assert.equal(items.length,444);assert.equal(new Set(items.map(e=>e.id)).size,444);assert.equal(items.filter(e=>e.expertType==='team').length,52)
 assert.equal(items.filter(e=>e.source==='豆包工作').length,15);assert(items.every(e=>!e.installed&&!e.enabled&&!e.content));assert.equal(store.listSkills().length,0)
 let files=0
 for(const entry of catalog){assert.match(entry.id,/^[a-zA-Z0-9_-]{1,100}$/);const detail=market.detail(entry.id);assert(detail.content.trim());for(const file of detail.definitionFiles){assert(!/(^|\/)(USER\.md|MEMORY\.md|memory|memories|sessions|conversations)(\/|$)/i.test(file.path));assert.equal(crypto.createHash('sha256').update(file.content).digest('hex'),file.sha256);files++}if(entry.avatar)assert(fs.existsSync(path.join(__dirname,'../public',entry.avatar)))}
 assert.equal(files,872);assert.throws(()=>market.detail('../escape'),/找不到/)
})
test('expert add, disable, remove, re-add and conversation preserve the selected persona',t=>{
 const {market,store,root}=fixture(t),id='expert-db-88f157ea-7070-4088-96aa-826c6cd5b153'
 assert.throws(()=>market.use(id),/启用/);market.toggle(id,true)
 const skill=store.listSkills().find(e=>e.id===id);assert(skill.enabled);assert.match(skill.content,/数据不会说谎/);assert.match(skill.content,/经营诊断硬门/)
 for(let i=1;i<=3;i++)assert(fs.existsSync(path.join(root,'market-experts',id,`definition-${i}.md`)))
 const conversationId=market.use(id),ref=store.getSetting('draft-reference:'+conversationId);assert.equal(ref.id,id);assert.equal(ref.type,'expert');assert.equal(ref.kind,'skill');assert(!store.listSkills().some(e=>e.id==='wending-market-reference'))
 market.toggle(id,false);assert.throws(()=>market.use(id),/启用/);market.toggle(id,true);assert.equal(store.listSkills().filter(e=>e.id===id).length,1)
 market.remove(id);assert(!market.detail(id).installed);assert.equal(market.entries().filter(e=>e.kind==='expert').length,444)
 market.toggle(id,true);assert(market.detail(id).enabled);assert.throws(()=>market.save({id,name:'Overwrite',content:'bad'}),/不可覆盖/)
})
test('expert installation state survives a store reopen without auto-installing other experts',t=>{
 const {market,store,root}=fixture(t),id=catalog.find(e=>e.source==='WorkBuddy').id;market.toggle(id,true);market.toggle(id,false)
 const second=new StableStore(root);t.after(()=>second.close());const m=new SkillMarket(second,root)
 assert(m.detail(id).installed);assert(!m.detail(id).enabled);assert.equal(second.listSkills().length,1)
})
