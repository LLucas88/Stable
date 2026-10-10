'use strict'

// Skills are resources selected by a human, never ambient retrieval context.
const { SKILL_SELECTION_POLICY } = require('./skill-selection.cjs')
const MANUAL_SKILL_POLICY = SKILL_SELECTION_POLICY + ' 定时触发和团队自动分配只可自动使用授权目录中的技能。工作流中的其他 Skill 节点仍需用户手动运行。'

function explicitlyNamedSkill(query, skills = []) {
  const text = String(query || '').trim()
  // A conservative command prefix avoids activating on discussion, examples,
  // negation, or an incidental name elsewhere in a sentence.
  const command = text.match(/^(?:请\s*|帮我\s*|请帮我\s*)?(?:调用|运行|执行|使用|用一下)\s*(?:skill\s*[:：]?\s*)?[“"`]?(.+)$/i)
  if (!command || /^(?:不要|别|不必|禁止)/.test(command[1])) return null
  const tail = command[1].toLowerCase()
  return [...skills].filter(item => item.enabled).sort((a, b) => b.name.length - a.name.length).find(item => {
    return [item.name, item.id].filter(Boolean).some(value => {
      const name = String(value).toLowerCase()
      if (!tail.startsWith(name)) return false
      const rest = tail.slice(name.length)
      if (/^[\s”"`]*(?:skill|技能)?\s*(?:的?(?:方法|用法|介绍|说明)|怎么|如何|是否|是什么)/i.test(rest)) return false
      return !rest || /^(?:[\s”"`，,。.!！:：]|skill\b|技能|来|帮我|处理|分析|生成|做)/i.test(rest)
    })
  }) || null
}

function manualSkillContext(context = {}) {
  return context.manualSkillInvocation === true ? [...(context.skills || [])] : []
}

function assertWorkflowSkillInvocation(graph, manual, automaticSkills = []) {
  const allowed = new Set(automaticSkills.map(item => item.id))
  if (!manual && graph.nodes.some(node => node.type === 'skill' && !allowed.has(node.resourceId))) throw Error('此工作流包含仅允许手动调用的 Skill，请手动运行工作流。')
}

module.exports = { MANUAL_SKILL_POLICY, explicitlyNamedSkill, manualSkillContext, assertWorkflowSkillInvocation }
