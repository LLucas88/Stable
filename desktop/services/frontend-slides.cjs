'use strict'
const fs = require('node:fs'), path = require('node:path')
const SKILL_ID = 'frontend-slides'
const SOURCE = path.join(__dirname, '../skills/frontend-slides')
const CATALOG = require('../assets/frontend-slides/catalog.json')
const ASSETS = path.join(__dirname, '../assets/frontend-slides')
const entryFor = id => CATALOG.find(entry => `frontend-slides-${entry.slug}` === id)
function copySkillDirectory(source, target) {
  // Electron patches these fs calls for ASAR; native cpSync traversal cannot
  // resolve directories inside the packaged archive on Windows.
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name)
    if (entry.isDirectory()) copySkillDirectory(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}
function previewImages(id, thumbnail = false) {
  const entry = entryFor(id)
  return (entry?.samples || []).slice(0, thumbnail ? 1 : 3).map(file => 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, 'originals', file)).toString('base64'))
}
function copyTemplateSupport(id, target) {
  if (!entryFor(id)?.hasOriginalPreview) return
  for (const file of ['deck-stage.js','LICENSE']) fs.copyFileSync(path.join(ASSETS,'originals',file),path.join(target,file))
}
function ensureFrontendSlides(store, root) {
  if (store.getSetting('frontend-slides-builtin-v1')) return
  const directory = path.join(root, 'bundled-skills', SKILL_ID)
  fs.mkdirSync(path.dirname(directory), { recursive: true })
  copySkillDirectory(SOURCE, directory)
  const content = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8')
  store.upsertSkill({ id: SKILL_ID, name: 'Frontend Slides 演示文稿', description: '使用 46 套风格参考创建 HTML 演示文稿、转换 PPTX。', path: directory, content })
  const metadata = store.getSetting('skillMarketMeta') || {}
  store.setSetting('skillMarketMeta', { ...metadata, [SKILL_ID]: { ...metadata[SKILL_ID], group: '内置', version: '2026-11-03', source: 'https://github.com/zarazhangrui/frontend-slides' } })
  store.setSetting('frontend-slides-builtin-v1', true)
}
function addSlideTemplates(store, root) {
  let items = store.getSetting('template-library-v1') || []
  const migrate = !store.getSetting('frontend-slides-gallery-v2')
  let changed = false
  if (migrate) {
    const retired = items.filter(item => item.builtin && item.skillId === 'stable-html-template' && ['项目启动方案','品牌故事长页'].includes(item.name))
    if (retired.length) {
      store.setSetting('template-library-retired-v2',retired)
      items = items.filter(item => !retired.includes(item)); changed = true
    }
  }
  for (const entry of CATALOG) {
    const id = `frontend-slides-${entry.slug}`
    const existing = items.find(item => item.id === id)
    if (existing && !migrate) continue
    const source = path.join(ASSETS,entry.hasOriginalPreview?'originals':'',entry.slug+'.html')
    fs.copyFileSync(source, path.join(root, id + '.html'))
    const metadata = { name: entry.name, description: entry.description, originalName: entry.originalName, hasOriginalPreview: entry.hasOriginalPreview, tags: ['HTML', '演示文稿', 'Frontend Slides', entry.originalName, ...entry.tags] }
    if (existing) Object.assign(existing,metadata)
    else items.push({ id, ...metadata, category: '办公协同', skillId: SKILL_ID, builtin: true, favorite: false,
      prompt: `请使用 Frontend Slides 技能，按所选风格制作 HTML 演示文稿。读取技能资源中的 ${entry.reference}，保留原模板，使用我提供的真实内容替换示例。所选风格已明确，无需重新让我选择风格。\n\n我的需求：` })
    changed = true
  }
  if (changed) store.setSetting('template-library-v1', items)
  if (migrate) store.setSetting('frontend-slides-gallery-v2',true)
}
function sortTemplates(items) {
  // Preserve the order of user templates; built-in presets without upstream
  // samples always follow every other template, including newly imported ones.
  return [...items].sort((a,b)=>Number(entryFor(a.id)?.hasOriginalPreview === false)-Number(entryFor(b.id)?.hasOriginalPreview === false))
}
module.exports = { ensureFrontendSlides, addSlideTemplates, previewImages, copyTemplateSupport, sortTemplates, SKILL_ID }
