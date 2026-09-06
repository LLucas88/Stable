'use strict'
// Import only verified expert definitions; never copy profiles, memories or credentials.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const wbRoot = process.argv[2], dbRoot = process.argv[3]
if (!wbRoot || !dbRoot) throw Error('Usage: node scripts/import-expert-catalog.cjs <workbuddy-migration> <doubao-delivery-v3>')
const target = path.resolve(__dirname, '../desktop/assets/experts')
fs.mkdirSync(path.join(target, 'definitions'), { recursive: true })
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const wb = read(path.join(wbRoot, 'manifest.json')), db = read(path.join(dbRoot, 'manifest.json'))
const categories = { '01':'产品研发', '02':'技术工程', '03':'游戏与空间', '04':'数据分析', '05':'营销增长', '06':'内容创作', '07':'电商运营', '08':'金融与理财', '09':'办公提效', '10':'项目管理', '11':'安全合规', '12':'行业咨询', '13':'腾讯专区', '14':'全球发展', '15':'学习教育' }
const catalogue = [], checksums = []
function files(root, names) { return names.map(name => {
  if (/(^|\/)(USER\.md|MEMORY\.md|memory|memories|sessions|credentials|conversations)(\/|$)/i.test(name)) throw Error('Excluded file: '+name)
  const file = path.resolve(root, name), rel = path.relative(path.resolve(root), file)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Invalid source path')
  const content = fs.readFileSync(file, 'utf8')
  return { path: name.replaceAll('\\','/'), content, sha256: crypto.createHash('sha256').update(content).digest('hex') }
}) }
function add(item, definitions) {
  if (!definitions.length || definitions.some(d => !d.content.trim())) throw Error('Missing definition: '+item.id)
  const file = 'definitions/'+item.id+'.json'
  fs.writeFileSync(path.join(target,file), JSON.stringify(definitions))
  checksums.push({file, sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(target,file))).digest('hex')})
  catalogue.push({...item, definitionPath:file, definitionCount:definitions.length})
}
for (const e of wb.entries) {
  const m = e.market_metadata
  add({id:'expert-wb-'+e.id, name:e.name, description:m.description?.zh || '', source:'WorkBuddy', sourceId:e.id, sourceURL:e.source_bundle, group:categories[e.category_id.slice(0,2)] || '行业咨询', tags:(m.tags || []).map(t => t.zh).filter(Boolean), expertType:e.type==='team'?'team':'individual', primaryDefinition:e.primary_definition, dependencies:e.declared_skills || [], avatarSource:m.avatar?.startsWith('https://')?m.avatar:'https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace'+(m.avatar || ''), version:'2026.09.06', provenance:'原始专家定义'}, files(wbRoot,e.definitions))
}
const team = read(path.resolve(dbRoot, '../team-template-definitions.json'))
const personal = read(path.resolve(dbRoot,'../catalog.json')).templates
for (const e of db.entries.filter(e=>e.skill_directory)) {
  const meta = team.find(t=>t.id===(e.agent_id || e.id))?.meta
  const template = personal.find(t=>t.id===e.id)
  const description=meta?.basicInfo?.description || template?.description || e.name
  const group=/数据/.test(e.name)?'数据分析':/产品/.test(e.name)?'产品研发':/法务|脱敏/.test(e.name)?'安全合规':/财务/.test(e.name)?'金融与理财':/客户|售前/.test(e.name)?'电商运营':/项目/.test(e.name)?'项目管理':'办公提效'
  add({id:'expert-db-'+e.id, name:e.name, description, source:'豆包工作', sourceId:e.id, sourceURL:e.source || 'https://aily.doubao.com/play/api/v1/runtime_templates/'+e.id, group, tags:template?.all_types?.slice(0,3) || [group,'工作助手'], expertType:'individual', dependencies:meta?.skills?.map(s=>s.name) || template?.content?.skills || [], avatarSource:meta?.basicInfo?.avatar || template?.content?.avatar || '', version:'2026.09.06', provenance:meta?'官方预览职责与约束':'已安装伙伴当前定义'}, files(dbRoot,e.definition_files))
}
catalogue.sort((a,b)=>(b.id==='expert-db-88f157ea-7070-4088-96aa-826c6cd5b153')-(a.id==='expert-db-88f157ea-7070-4088-96aa-826c6cd5b153'))
fs.writeFileSync(path.join(target,'catalog.json'),JSON.stringify(catalogue,null,2))
fs.writeFileSync(path.join(target,'source-checksums.json'),JSON.stringify(checksums,null,2))
console.log(JSON.stringify({experts:catalogue.length,workbuddy:wb.entries.length,doubao:catalogue.length-wb.entries.length,definitions:catalogue.reduce((s,e)=>s+e.definitionCount,0)}))
