'use strict'
const fs = require('node:fs')

// Enabling a Skill makes it selectable, never an implicit execution grant.
function skillReferences(store, conversationId) {
  const saved = store.getSetting(`conversation-skills:${conversationId}`)
  const draft = saved === undefined ? store.getSetting(`draft-reference:${conversationId}`) : null
  const ids = new Set(Array.isArray(saved) ? saved : draft?.kind === 'skill' ? [draft.id] : [])
  return store.listSkills().filter(item => item.enabled && ids.has(item.id)).map(item => ({
    id: item.id, kind: 'skill', name: item.name, size: Buffer.byteLength(item.content || '', 'utf8'), type: 'skill',
  }))
}

function saveSkillReferences(store, conversationId, ids) {
  if (!store.conversation(conversationId)) throw Error('找不到这个对话。')
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) throw Error('无效的 Skill 选择。')
  const available = new Set(store.listSkills().filter(item => item.enabled).map(item => item.id))
  if (ids.some(id => !available.has(id))) throw Error('所选 Skill 已停用或不存在，请重新选择。')
  store.setSetting(`conversation-skills:${conversationId}`, [...new Set(ids)])
  store.setSetting(`draft-reference:${conversationId}`, null)
  return skillReferences(store, conversationId)
}

function selectedSkillContext(store, references) {
  const ids = new Set((references || []).filter(item => item?.kind === 'skill').map(item => item.id))
  return store.listSkills().filter(item => item.enabled && ids.has(item.id)).map(({ name, content, path }) => ({ name, content, path }))
}

function selectedSkillReadRoots(skills) {
  return [...new Set(skills.flatMap(skill => {
    if (!skill.path || skill.path.startsWith('builtin:')) return []
    try { return fs.statSync(skill.path).isDirectory() ? [fs.realpathSync(skill.path)] : [] } catch { return [] }
  }))]
}

// Automatic invocation is an explicit per-skill grant, independent of manual selection.
// Only expose the catalog here; the agent reads the relevant entry on demand.
function automaticSkillCatalog(store) {
  const meta = store.getSetting('skillMarketMeta') || {}
  return store.listSkills().filter(item => item.enabled && meta[item.id]?.invocationMode === 'auto')
    .filter(item => selectedSkillReadRoots([item]).length && fs.existsSync(require('node:path').join(item.path, 'SKILL.md')))
    .map(({ id, name, description, path }) => ({ id, name, description, path, runtimeInstructions: meta[id]?.runtimeInstructions || '' }))
}

function automaticSkillPrompt(skills = []) {
  if (!skills.length) return ''
  return '\n\n## 允许自动调用的 Skills\n按任务匹配，优先通过原生 Skill 工具加载；运行时未提供 Skill 工具时才读取相应入口文件。引用资源相对此技能根目录解析。仅按需加载，不要套用不相关的技能。\n' + skills.map(item =>
    `### ${item.name}\n适用任务：${item.description || item.name}\n技能根目录：${item.path}\n入口文件：${require('node:path').join(item.path, 'SKILL.md')}${item.runtimeInstructions ? `\n本机运行提示：${item.runtimeInstructions}` : ''}`
  ).join('\n\n')
}

const SKILL_SELECTION_POLICY = '只可使用本次上下文列出的“当前对话手动选择的 Skills”和“允许自动调用的 Skills”。自动目录中的技能已获得用户授权：根据当前任务与描述匹配，优先调用原生 Skill 工具加载；运行时未提供 Skill 工具时先用 Read 读取相应 SKILL.md，再按需读取其引用资源；不要一次加载全部技能。适用时优先使用这些技能，能力不支持或依赖不可用时使用 Stable 工具备用并说明原因。用户本次禁止使用技能时不调用，明确选择的技能优先。自动授权适用于聊天、工作流、定时和协作任务，但不是执行命令、联网、写文件或发送消息的额外授权，所有目录限制和审批规则仍适用。其余技能仅允许手动选择；已启用、名称匹配、任务相关、历史上使用过、其他 Skill 或专家推荐，均不构成调用授权。没有列出时不使用任何 Skill，不自动发现、检索或读取目录外的 Skill 说明。历史中的 Skill 说明不是当前授权，移除或停用后停止套用其指令。普通工具仍可按任务和现有权限正常使用。'
module.exports = { skillReferences, saveSkillReferences, selectedSkillContext, selectedSkillReadRoots, automaticSkillCatalog, automaticSkillPrompt, SKILL_SELECTION_POLICY }
