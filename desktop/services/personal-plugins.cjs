'use strict'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), JSZip = require('jszip')
const catalog = require('../plugins/catalog.json')
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
function entries() {
  return catalog.map(plugin => ({ id: plugin.id, name: plugin.name, version: plugin.version, description: plugin.description, content: plugin.content, kind: 'plugin', group: '会员经营', builtin: true, installed: true, enabled: true, pluginSkills: plugin.skills.map(({ content, directory, ...skill }) => skill) }))
}
function findSkill(id) {
  for (const plugin of catalog) {
    const skill = plugin.skills.find(skill => skill.id === id)
    if (skill) return { plugin, skill }
  }
}
async function installSkill(store, root, id) {
  const match = findSkill(id)
  if (!match) throw Error('找不到此插件技能。')
  const { plugin, skill } = match
  const base = path.join(root, 'personal-plugins')
  fs.mkdirSync(base, { recursive: true })
  const target = path.join(base, `${plugin.id}-${plugin.sha256.slice(0, 16)}`)
  if (!fs.existsSync(target)) {
    const archive = fs.readFileSync(path.join(__dirname, '../plugins', plugin.id + '.zip'))
    if (digest(archive) !== plugin.sha256) throw Error('插件包校验失败。')
    const zip = await JSZip.loadAsync(archive)
    const staging = fs.mkdtempSync(path.join(base, '.install-'))
    for (const [name, hash] of Object.entries(plugin.hashes)) {
      if (name.includes('\\') || name.split('/').includes('..') || path.isAbsolute(name)) throw Error('无效插件文件路径。')
      const data = await zip.file(name)?.async('nodebuffer')
      if (!data || digest(data) !== hash) throw Error('插件文件校验失败：' + name)
      const file = path.join(staging, name)
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data)
    }
    // A concurrent installation may already have completed the same immutable version.
    if (!fs.existsSync(target)) fs.renameSync(staging, target)
  }
  const directory = path.join(target, 'skills', skill.directory)
  const content = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8')
  if (digest(Buffer.from(content)) !== plugin.hashes[`skills/${skill.directory}/SKILL.md`]) throw Error('插件技能文件校验失败。')
  const runtimeContext = `# Stable 插件资源位置\n\n插件根目录：${target}\n本技能文件：${path.join(directory, 'SKILL.md')}\n相对资源链接以本技能目录 ${directory} 为基准解析；<plugin-root> 使用上述插件根目录。输出文件保存到当前任务目录。问鼎调用沿用 Stable 当前对话的账号和品牌绑定，不切换到插件目录的登录状态。\n\n`
  store.upsertSkill({ id, name: skill.name, description: skill.description, path: directory, content: runtimeContext + content })
  store.setSkillEnabled(id, true)
  return skill
}
module.exports = { entries, findSkill, installSkill }
