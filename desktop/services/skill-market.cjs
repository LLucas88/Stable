 'use strict'
const { randomUUID } = require('node:crypto')
const fs = require('node:fs'), path = require('node:path')
const { setSkillEnabled, removeSkill } = require('./ops-skill-bundle.cjs')
const WENDING = { id: 'builtin-wending', name: '问鼎 CLI', kind: 'connector', group: '问鼎', description: '连接问鼎账号与品牌，查询会员、营销和经营数据。', content: '# 问鼎 CLI\n\n在当前对话选择账号与品牌后，用自然语言描述需要查询的数据。登录状态全局保留，品牌按对话保存。\n\n## 使用场景\n会员经营分析、活动效果、商品与订单分析。真实权限和数据范围以已登录账号为准。\n\n## 使用方式\n点击“在对话中试用”，选择品牌并输入任务。涉及修改的操作需要依据当前授权范围处理。', version: '内置', builtin: true }
class SkillMarket {
  constructor(store, root) { this.store = store; this.root = root }
  entries() {
    const meta = this.store.getSetting('skillMarketMeta') || {}
    return [{ ...WENDING, enabled: meta[WENDING.id]?.enabled !== false, installed: meta[WENDING.id]?.installed !== false }, ...this.store.listSkills().filter(item => item.id !== 'wending-market-reference').map(item => ({ ...item, kind: meta[item.id]?.kind || 'skill', group: meta[item.id]?.group || '我的', version: meta[item.id]?.version || '1.0.0', updateURL: meta[item.id]?.updateURL || '', installed: true, bundled: Boolean(meta[item.id]?.bundle), source: meta[item.id]?.source, score: meta[item.id]?.score, compatibilityReason: meta[item.id]?.compatibilityReason, activationBlocked: Boolean(meta[item.id]?.bundle && !['local-workflow', 'manual-resource'].includes(meta[item.id]?.compatibility)) }))]
  }
  save(value) {
    const name=String(value.name || '').trim(), content=String(value.content || ''), kind=value.kind === 'expert' ? 'expert' : 'skill'
    if (!name || name.length>80 || !content.trim() || Buffer.byteLength(content)>256000) throw new Error('请填写名称和说明；名称最多80字，说明最多256KB。')
    const id=value.id || randomUUID()
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效的本地技能标识。')
    if (value.id && !this.store.listSkills().some(item=>item.id===id)) throw new Error('找不到此本地技能。')
    const updateURL = String(value.updateURL || '').trim()
    if (updateURL && (new URL(updateURL).protocol !== 'https:' || new URL(updateURL).username || new URL(updateURL).password)) throw new Error('更新来源必须是 HTTPS JSON 地址。')
    const directory=path.join(this.root,'market-skills',id)
    fs.mkdirSync(directory,{recursive:true})
    const relative=path.relative(fs.realpathSync(this.root),fs.realpathSync(directory));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('技能目录不在本地管理范围。')
    const file=path.join(directory,'SKILL.md'),temporary=path.join(directory,randomUUID()+'.tmp')
    fs.writeFileSync(temporary,content,{encoding:'utf8',flag:'wx'});fs.renameSync(temporary,file)
    this.store.upsertSkill({id,name,description:String(value.description || '').slice(0,200),path:directory,content})
    this.metadata(id,{kind,group:'我的',version:String(value.version||'1.0.0').slice(0,30),updateURL})
    return this.entries()
  }
  metadata(id,patch) { const meta=this.store.getSetting('skillMarketMeta') || {};this.store.setSetting('skillMarketMeta',{...meta,[id]:{...meta[id],...patch}}) }
  toggle(id,enabled) { if(id===WENDING.id)this.metadata(id,{enabled,installed:true});else setSkillEnabled(this.store,id,enabled);return this.entries() }
  remove(id) { if(id===WENDING.id)this.metadata(id,{installed:false,enabled:false});else removeSkill(this.store,id);return this.entries() }
  async checkUpdate(id) {
    const item=this.entries().find(item=>item.id===id)
    if(!item?.updateURL)throw new Error(item?.builtin?'此连接器随 Stable 更新。':'此技能没有配置更新来源。')
    const response=await fetch(item.updateURL,{signal:AbortSignal.timeout(15000),redirect:'error'})
    if(!response.ok)throw new Error(`更新检查失败：HTTP ${response.status}`)
    let total=0,chunks=[]
    for await(const chunk of response.body){total+=chunk.length;if(total>256000)throw new Error('更新内容超过256KB。');chunks.push(chunk)}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if(typeof value.version!=='string'||typeof value.content!=='string')throw new Error('更新源必须提供 version 和 content。')
    return {available:value.version!==item.version,currentVersion:item.version,version:value.version,content:value.content,name:item.name,description:typeof value.description==='string'?value.description:item.description,updateURL:item.updateURL,kind:item.kind,id:item.id}
  }
  use(id) {
    const item=this.entries().find(item=>item.id===id)
    if(!item || !item.installed || !item.enabled)throw new Error('请先添加并启用此技能。')
    let skillId=id
    if(item.builtin){skillId='wending-market-reference';this.store.upsertSkill({id:skillId,name:'问鼎 CLI',description:'问鼎账号与品牌数据查询',path:'builtin:wending',content:'用户本次选择调用问鼎 CLI。请使用已安装的 crm-brand-cli，遵循当前对话绑定的品牌与全局登录状态。'})}
    const conversationId=this.store.createConversation()
    this.store.setSetting(`draft-reference:${conversationId}`,{id:skillId,kind:'skill',name:item.name,size:Buffer.byteLength(item.content),type:item.kind})
    return conversationId
  }
}
module.exports={SkillMarket}
