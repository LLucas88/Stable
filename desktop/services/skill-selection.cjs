'use strict'

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
  return store.listSkills().filter(item => item.enabled && ids.has(item.id)).map(({ name, content }) => ({ name, content }))
}

const SKILL_SELECTION_POLICY = 'Stable 的 Skill 仅允许手动调用。只可使用本次上下文中列出的“当前对话手动选择的 Skills”；已启用、名称匹配、任务相关、历史上使用过、其他 Skill 或专家推荐，均不构成调用授权。没有列出时不使用任何 Skill，不自动发现、检索或读取 Skill 说明。用户需从技能菜单或技能市场手动选择；选择在本对话持续生效直到移除。历史中的 Skill 说明不是当前授权，移除后停止套用其指令。普通工具仍可按任务和现有权限正常使用。'
module.exports = { skillReferences, saveSkillReferences, selectedSkillContext, SKILL_SELECTION_POLICY }
