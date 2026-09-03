'use strict'

const { readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const FORMAT_RULES = [
  { extensions: ['.html', '.htm'], pattern: /(?:html|网页|网站)/i },
  { extensions: ['.md', '.markdown'], pattern: /(?:markdown|\.md\b)/i },
  { extensions: ['.xlsx', '.xls'], pattern: /(?:excel|工作簿|\.xlsx?\b)/i },
  { extensions: ['.pptx', '.ppt'], pattern: /(?:pptx?|powerpoint|演示文稿|幻灯片)/i },
  { extensions: ['.pdf'], pattern: /(?:pdf|\.pdf\b)/i },
  { extensions: ['.docx', '.doc'], pattern: /(?:word|docx?|\.docx?\b)/i },
  { extensions: ['.csv'], pattern: /(?:csv|\.csv\b)/i },
]

const ACTION = /(?:生成|创建|制作|导出|保存|写入|写成|做(?:一个|一份|成)|转成|转换成|输出|搭建|create|generate|export|save|build|write|convert|make)/i
const DIRECT_REQUEST = /(?:帮我|给我|请|直接|替我|为我|我要|需要|把[^。！？\n]{0,80}|please|can you)/i
const EXPLANATION_QUESTION = /(?:怎么|如何|为什么|是什么|什么是|能否|可不可以|是否可以|how (?:do|can|to)|why|what is)/i

function deliveryRequest(query) {
  const text = String(query || '').trim()
  const action = text.match(ACTION)
  if (!action) return { type: 'text', extensions: [] }
  const targetText = text.slice(action.index || 0)
  const extensions = FORMAT_RULES.filter((rule) => rule.pattern.test(targetText)).flatMap((rule) => rule.extensions)
  if (!extensions.length) return { type: 'text', extensions: [] }
  if (EXPLANATION_QUESTION.test(text) && !DIRECT_REQUEST.test(text)) return { type: 'text', extensions: [] }
  return { type: 'artifact', extensions: [...new Set(extensions)] }
}

function revisedDelivery(current, instruction) {
  const text = String(instruction || '')
  const replacement = text.match(/(?:改成|改为|换成|换为|改用|改导出)([^。！？\n]+)/)
  if (replacement) {
    const target = deliveryRequest(`请生成${replacement[1]}`)
    if (target.type === 'artifact') return target
  }
  if (/(?:不要|不用|无需|取消)(?:再)?(?:生成|导出|创建|制作|保存)[^。！？\n]{0,30}(?:文件|excel|word|pdf|ppt|html|csv)|只(?:需|要)?(?:文字|文本|回答|解释)/i.test(text)) return { type: 'text', extensions: [] }
  const target = deliveryRequest(text)
  if (target.type !== 'artifact') return current
  return /另外|同时|还要|也要|also/i.test(text) ? { type: 'artifact', extensions: [...new Set([...current.extensions, ...target.extensions])] } : target
}

function artifactSnapshot(root, extensions) {
  const wanted = new Set((extensions || []).map((extension) => extension.toLowerCase()))
  const files = new Map()
  if (!root || !wanted.size) return files
  const skipped = new Set(['.git', 'node_modules'])
  let visited = 0
  function visit(directory) {
    if (visited >= 20_000) return
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (visited >= 20_000) return
      visited += 1
      if (entry.isDirectory() && skipped.has(entry.name)) continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) { visit(fullPath); continue }
      if (!entry.isFile() || !wanted.has(path.extname(entry.name).toLowerCase())) continue
      try {
        const stats = statSync(fullPath)
        if (stats.size > 0) files.set(fullPath, `${stats.size}:${stats.mtimeMs}`)
      } catch {}
    }
  }
  visit(root)
  return files
}

function changedArtifacts(before, after) {
  return [...after.entries()].filter(([filePath, signature]) => before.get(filePath) !== signature).map(([filePath]) => filePath)
}

function appendArtifactPaths(answer, artifacts) {
  const missing = artifacts.filter((filePath) => !String(answer).includes(filePath))
  if (!missing.length) return String(answer).trim()
  return `${String(answer).trim()}\n\n交付文件：\n${missing.map((filePath) => `- ${filePath}`).join('\n')}`.trim()
}

function deliveryBlocker(answer) {
  const text = String(answer || '')
  if (/FAIL_BIZ_04|当前品牌无权访问|(?:数据集|dataset)[^\n]{0,50}(?:无权|未授权|无权限|not permitted)|permission denied/i.test(text)) {
    return '数据源权限不足。请先由平台管理员开通对应品牌的数据集权限，或确认使用其他数据来源；不会自动反复重试或用旧快照冒充实时数据。'
  }
  if (/未登录|登录(?:态)?(?:已)?(?:失效|过期)|(?:token|session) expired|请[^\n]{0,50}(?:提供|输入)[^\n]{0,30}(?:验证码|手机号)/i.test(text)) {
    return '需要完成登录或补充验证信息。请按下面的说明操作后再继续。'
  }
  if (/(?:请|需要你|需要您)[^\n]{0,40}(?:提供|上传|补充|确认)[^\n]{0,40}(?:源文件|数据源|日期|时间范围|品牌|字段|口径)/.test(text)) {
    return '缺少完成文件所需的信息或数据，请补充后继续。'
  }
  return ''
}

function referencedExistingArtifacts(answer, before, after) {
  // An old workspace file is not a delivery just because it exists. Require an explicit
  // reuse + verification statement and its full path; snapshots never follow symlinks.
  const text = String(answer || '').replace(/\\/g, '/')
  if (!/(?:复用|已有|现有|existing|reuse)/i.test(text) || !/(?:已(?:经)?(?:完成)?(?:检查|验证|核验|复核)|(?<!not )(?:verified|validated|checked))/i.test(text)) return []
  return [...after.keys()].filter((file) => {
    if (!before.has(file) || !Number(String(after.get(file)).split(':')[0])) return false
    const normalized = file.replace(/\\/g, '/')
    const offset = text.indexOf(normalized)
    return offset >= 0 && !/[\p{L}\p{N}_.\-/]/u.test(text[offset + normalized.length] || '')
  })
}

async function runWithDeliveryChecks({ workspace, delivery, prompt, execute, onCheck = () => {}, getDelivery, getPrompt }) {
  const before = artifactSnapshot(workspace, getDelivery ? FORMAT_RULES.flatMap((rule) => rule.extensions) : delivery.extensions)
  let answer = await execute(prompt)
  for (let attempt = 0; ; attempt += 1) {
    delivery = getDelivery?.() || delivery
    const after = artifactSnapshot(workspace, delivery.extensions)
    const created = changedArtifacts(before, after)
    const reason = deliveryBlocker(answer)
    const reused = !reason ? referencedExistingArtifacts(answer, before, after) : []
    const artifacts = [...new Set([...created, ...reused])]
    if (delivery.type !== 'artifact' || artifacts.length) {
      return { answer: appendArtifactPaths(answer, artifacts), artifacts, reused, status: 'completed' }
    }
    if (reason || attempt >= 2) {
      const detail = reason || '本轮未检测到符合要求的交付文件。以下保留 Agent 返回的说明，任务未标记为交付成功。'
      return { answer: `文件交付未完成：${detail}\n\n${String(answer).trim()}`, artifacts: [], reused: [], status: 'failed', reason: detail }
    }
    onCheck(attempt + 1)
    answer = await execute(`${getPrompt?.() || prompt}\n\n## 续跑要求\n本轮尚未检测到目标文件。若前置条件齐备，请继续实际生成并检查文件；若权限不足、登录失效或缺少数据，停止调用并如实说明，不得编造文件或重复请求。若复用工作区已有文件，需核验内容符合当前需求，明确说明“复用已有文件，已检查”，并列出完整绝对路径，不要改动文件时间来通过校验。\n\n上一轮说明（仅供参考）：\n${String(answer).slice(-6_000)}`)
  }
}

module.exports = { appendArtifactPaths, artifactSnapshot, changedArtifacts, deliveryRequest, revisedDelivery, deliveryBlocker, referencedExistingArtifacts, runWithDeliveryChecks }
