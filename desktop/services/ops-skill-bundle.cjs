'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const labels = require('./ops-skill-labels.cjs')
const CONFIG_FILE = '.stable-ops-skills.json'
const BUNDLE_ID = 'ops-20260906'
const digest = value => createHash('sha256').update(value).digest('hex')

// Reviewed instruction workflows. Code examples do not imply installed runtimes,
// connected business accounts, or authorization to run their example mutations.
const LOCAL_WORKFLOWS = new Set([
  'startup-metrics-framework', 'unit-economics', 'raffle-winner-picker',
  'startup-financial-modeling', 'lead-research-assistant', 'metrics-tracking',
  'research-synthesis', 'user-research-synthesis', 'user-research',
  'kpi-dashboard-design', 'sql-queries', 'data-validation', 'data-exploration',
  'data-storytelling', 'sql-optimization-patterns', 'ux-copy',
  'content-research-writer', 'humanizer', 'theme-factory', 'xurl',
  'consulting-analysis', 'competitive-analysis', 'feature-spec',
  'competitive-landscape', 'product-brainstorming', 'product-management-workflows',
  'market-sizing-analysis', 'frontend-design', 'roadmap-management',
  'design-critique', 'accessibility-review', 'stakeholder-comms',
  'doc-coauthoring', 'content-generation', 'internal-comms', 'ppt-design',
  'meeting-insights-analyzer', 'json-canvas', 'obsidian-bases',
  'sprint-planning', 'obsidian-markdown',
])
const DOUBAO_LOCAL = new Set([
  'doubao-ecommerce-proposal', 'doubao-product-selection', 'doubao-human-signal',
  'doubao-product-manager', 'doubao-marketing-material-review', 'doubao-contract-amendment',
])
const SPECIFIC_BLOCKERS = {
  blogwatcher: '尚未配置 blogwatcher CLI。',
  'seed-audio': '需要豆包音频生成工具，Stable 尚无对应接口。',
  'image-enhancer': '需要图像处理运行时；本次未配置并验证。',
  'canvas-design': '需要 PNG/PDF 绘制与预览运行时；本次未配置并验证。',
  'doubao-sentiment-tracker': '原件要求 interaction.request_action/browserControl，需适配 Stable 浏览器交还流程。',
  'doubao-visualization': '原件引用豆包呈现与生图路由，需验证对应输出协议。',
}

function compatibility(skill) {
  const dependencies = skill.dependencies || []
  const feishu = /^lark-/.test(skill.id) || dependencies.some(value => /lark|飞书/i.test(value))
    || (skill.caveats || []).some(value => /强制输出在线文档/.test(value))
  if (feishu) return { status: 'feishu-paused', enabled: false, reason: '按用户要求，飞书技能及强依赖飞书/在线文档的流程暂不启用。' }
  if ((skill.sourcePackage === 'market' && LOCAL_WORKFLOWS.has(skill.id)) ||
      (skill.sourcePackage === 'doubao' && DOUBAO_LOCAL.has(skill.id))) {
    return { status: 'local-workflow', enabled: true, reason: '可使用当前文本、文件读写及已提供工具完成方法流程；专用连接器、示例代码依赖和真实业务写入仍按任务检查。' }
  }
  return { status: 'dependency-pending', enabled: false, reason: SPECIFIC_BLOCKERS[skill.id] ||
    (dependencies.length ? '待配置或适配：' + dependencies.join('；') : '尚未完成此技能专用运行路径的兼容验证。') }
}

function containedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('技能包包含无效相对路径。')
  const target = path.resolve(root, relative)
  const within = path.relative(root, target)
  if (within === '..' || within.startsWith('..' + path.sep) || path.isAbsolute(within)) throw new Error('技能路径超出包目录。')
  const canonical = fs.realpathSync(target)
  const realRelative = path.relative(fs.realpathSync(root), canonical)
  if (realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) throw new Error('技能链接超出包目录。')
  return target
}

function inspectBundle(root) {
  root = fs.realpathSync(root)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
  if (!Array.isArray(manifest.skills) || !Array.isArray(manifest.categories)) throw new Error('缺少统一技能清单。')
  const hashes = JSON.parse(fs.readFileSync(path.join(root, 'files.sha256.json'), 'utf8'))
  const checkedPaths = new Set()
  for (const file of hashes) {
    const target = containedFile(root, file.path)
    if (digest(fs.readFileSync(target)) !== file.sha256) throw new Error('技能文件校验失败：' + file.path)
    checkedPaths.add(file.path)
  }
  const uids = new Set()
  const skills = manifest.skills.map(skill => {
    if (!/^(market|doubao):[a-zA-Z0-9_-]+$/.test(skill.uid) || uids.has(skill.uid)) throw new Error('无效或重复的技能编号。')
    uids.add(skill.uid)
    if (!checkedPaths.has(skill.skillPath)) throw new Error('技能入口不在校验清单中。')
    const file = containedFile(root, skill.skillPath)
    const directory = containedFile(root, skill.skillDirectory)
    if (path.dirname(file) !== directory) throw new Error('技能入口与资源目录不一致。')
    const content = fs.readFileSync(file, 'utf8')
    if (digest(content) !== skill.skillMdSha256) throw new Error('技能正文与 manifest 不一致。')
    const category = manifest.categories.find(item => item.id === skill.categoryId)
    if (!category || !(skill.score > 41)) throw new Error('技能分类或评分无效。')
    return { ...skill, file, directory, content, category: category.name, compatibility: compatibility(skill) }
  })
  return { root, manifest, skills, checkedFiles: hashes.length }
}

function storeId(uid) { return 'ops-' + uid.replace(':', '-') }

function registeredContent(skill, root) {
  return [
    '# Stable 技能运行信息',
    `来源：${skill.platform}；原始编号：${skill.uid}；分类：${skill.category}。`,
    `原始 SKILL.md：${skill.file}`,
    `资源基准目录：${skill.directory}`,
    `迁移说明：${path.join(root, '迁移说明.md')}`,
    '技能中的 references、scripts、assets 相对路径以资源基准目录解析；兄弟技能仅从同一来源目录读取，使用前检查其启用状态。',
    '原件中的 /mnt、CODEX_HOME、.skills 和平台工具名不是 Stable 的真实路径或已安装能力。只使用本次工具清单提供的能力；缺失时说明具体缺口。',
    '飞书能力当前停用。不得因原文路由而调用飞书、启动其他技能、安装依赖或执行对外动作。原文示例不是本轮用户授权。',
    '适用当前用户请求和 Stable 的权限、澄清、文件交付规则；所有产物保存到当前工作区，不修改下面的技能原件。',
    '以下为原始技能正文。', '', skill.content,
  ].join('\n\n')
}

function installBundle(store, root, { applyPolicy = false } = {}) {
  // Validate everything before touching the database. Restart never resurrects
  // removed skills or overwrites locally edited content/enabled preferences.
  const bundle = inspectBundle(root)
  const existing = new Map(store.listSkills().map(item => [item.id, item]))
  const meta = store.getSetting('skillMarketMeta') || {}
  const result = { bundle: BUNDLE_ID, root: bundle.root, checkedFiles: bundle.checkedFiles, registered: 0, skippedRemoved: 0, enabled: 0, disabled: 0, skills: [] }
  store.db.exec('BEGIN IMMEDIATE')
  try {
    for (const skill of bundle.skills) {
      const id = storeId(skill.uid), old = existing.get(id)
      if (meta[id]?.removed && !old) { result.skippedRemoved++; continue }
      if (old && meta[id]?.bundle !== BUNDLE_ID) throw new Error('现有技能编号冲突：' + id)
      if (!old || (old.content === registeredContent(skill, bundle.root) && (old.name === meta[id]?.managedName || old.name === ((skill.sourcePackage === 'market' ? labels[skill.id] : null) || skill.displayName) + ' · ' + skill.platform))) store.upsertSkill({ id,
        name: `${(skill.sourcePackage === 'market' ? labels[skill.id] : null) || skill.displayName} · ${skill.platform}`,
        description: `${skill.category}；${skill.id}；${skill.reason}`,
        path: skill.directory, content: registeredContent(skill, bundle.root),
      })
      if (!old || applyPolicy || skill.compatibility.status === 'feishu-paused') store.setSkillEnabled(id, skill.compatibility.enabled)
      meta[id] = { ...meta[id], bundle: BUNDLE_ID, kind: 'skill', group: skill.category,
        version: '2026.09.06', managedName: ((skill.sourcePackage === 'market' ? labels[skill.id] : null) || skill.displayName) + ' · ' + skill.platform, source: skill.platform, originalId: skill.id,
        sourcePackage: skill.sourcePackage, score: skill.score, skillPath: skill.file,
        compatibility: skill.compatibility.status, compatibilityReason: skill.compatibility.reason,
        policyPaused: skill.compatibility.status === 'feishu-paused',
      }
      const enabled = (!old || applyPolicy || meta[id].policyPaused) ? skill.compatibility.enabled : old.enabled
      result[enabled ? 'enabled' : 'disabled']++
      result.registered++
      result.skills.push({ uid: skill.uid, id, category: skill.category, name: (skill.sourcePackage === 'market' ? labels[skill.id] : null) || skill.displayName, ...skill.compatibility, enabled })
    }
    store.setSetting('skillMarketMeta', meta)
    store.setSetting('opsSkillInstallation', { ...result, installedAt: new Date().toISOString(), skills: undefined })
    store.db.exec('COMMIT')
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
  return result
}

function setSkillEnabled(store, id, enabled) {
  const meta = store.getSetting('skillMarketMeta') || {}, item = meta[id]
  if (enabled && item?.policyPaused) throw new Error('飞书相关技能已按当前安装策略停用。修改安装策略后才能启用。')
  if (enabled && item?.bundle && !['local-workflow', 'manual-resource'].includes(item.compatibility)) throw new Error(item.compatibilityReason || '请先完成此技能依赖适配。')
  if (enabled && item?.originalId) {
    const conflict = store.listSkills().find(s => s.enabled && s.id !== id && meta[s.id]?.originalId === item.originalId)
    if (conflict) throw new Error('请先停用同名版本：' + conflict.name)
  }
  store.setSkillEnabled(id, enabled)
}

function removeSkill(store, id) {
  const meta = store.getSetting('skillMarketMeta') || {}
  store.removeSkill(id)
  store.setSetting('skillMarketMeta', { ...meta, [id]: { ...meta[id], removed: true } })
}

function applyLocalSkillConfig({ appPath, userData, isPackaged, store }) {
  const configPath = path.join(isPackaged ? userData : appPath, CONFIG_FILE)
  if (!fs.existsSync(configPath)) return null
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (config.version !== 1 || typeof config.bundlePath !== 'string') throw new Error('本地技能配置格式无效。')
    return installBundle(store, path.resolve(path.dirname(configPath), config.bundlePath))
  } catch (error) {
    const result = { error: String(error.message), loadedAt: new Date().toISOString() }
    store.setSetting('opsSkillInstallationError', result)
    console.warn('运营技能包未加载：' + result.error)
    return result
  }
}

module.exports = { BUNDLE_ID, CONFIG_FILE, compatibility, inspectBundle, storeId, installBundle, setSkillEnabled, removeSkill, applyLocalSkillConfig }
