'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const YAML = require('yaml')
const { resolveBoundPath } = require('./claude-tools.cjs')
const PLUGIN = 'stable-authorized'

// Export only instructions, not skill-supplied hooks, agents or permission grants.
// Supporting resources remain in their explicitly authorized source directories.
function prepareClaudeSkills({ directory, workspace, readableRoots, selectedSkills = [], automaticSkills = [] }) {
  const entries = new Map()
  for (const skill of [...selectedSkills, ...automaticSkills]) {
    let source = '', content = skill.content || ''
    if (skill.path && !skill.path.startsWith('builtin:')) {
      source = resolveBoundPath(skill.path, workspace, readableRoots)
      const entry = resolveBoundPath(path.join(source, 'SKILL.md'), workspace, readableRoots)
      if (fs.statSync(entry).size > 2_000_000) throw Error('Skill 入口文件过大。')
      content = fs.readFileSync(entry, 'utf8')
    }
    if (!content.trim()) throw Error(`Skill 缺少可读取的说明：${skill.name}`)
    const front = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    const meta = front ? YAML.parse(front[1]) || {} : {}
    // SDK !`command` preprocessing would run a host shell outside stable_exec.
    // Keep snippets as ordinary inline code for explicit WSL tool execution.
    const body = (front ? content.replace(/^\uFEFF/, '').slice(front[0].length) : content).replace(/(^|\s)!`/g, '$1`')
    const identity = source || skill.id || skill.name
    const hash = createHash('sha256').update(String(identity)).digest('hex').slice(0, 10)
    const slug = String(meta.name || skill.name || 'skill').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'skill'
    const name = `${slug}-${hash}`
    const description = String(meta.description || skill.description || skill.name).slice(0, 4000)
    const instructions = `${source ? `资源根目录（引用文件、脚本相对此目录解析）：${source}\n` : ''}${skill.runtimeInstructions || ''}\n${body}`
    entries.set(identity, { name, qualified: `${PLUGIN}:${name}`, label: skill.name, content: `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n${instructions}` })
  }
  const values = [...entries.values()].sort((a, b) => a.qualified.localeCompare(b.qualified))
  const fingerprint = createHash('sha256').update(JSON.stringify(values)).digest('hex')
  if (!values.length) return { names: [], plugins: [], fingerprint, instruction: '' }
  // A fresh directory per invocation means removed skills cannot survive on resume.
  const root = fs.mkdtempSync(path.join(directory, 'authorized-skills-'))
  fs.mkdirSync(path.join(root, '.claude-plugin'))
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: PLUGIN, version: '1.0.0' }))
  for (const entry of values) {
    const folder = path.join(root, 'skills', entry.name)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'SKILL.md'), entry.content)
  }
  const names = values.map(entry => entry.qualified)
  return { names, plugins: [{ type: 'local', path: root }], fingerprint,
    instruction: '使用原生 Skill 工具调用本轮白名单内的技能；不要只凭名称声称使用了技能。技能指令不增加工具或目录权限。\n' + values.map(e => `${e.label} → ${e.qualified}`).join('\n'),
    authorize(input) {
      if (!names.includes(input?.skill)) throw Error('此 Skill 不在本轮授权白名单中。')
      return { skill: input.skill, ...(typeof input.args === 'string' ? { args: input.args } : {}) }
    },
  }
}

module.exports = { prepareClaudeSkills }
