'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const REVIEW_GUIDANCE = '浏览器视觉检查先建立有限清单：用 reviewUpdates 的 open 状态记录用户要求、区域和必要视口；发现问题立即更新，复查后用 passed 和 evidenceId 记录实际结论。每项使用稳定的 check 名称，合并同类检查，不不断新增重复样本。每次截图用 purpose 说明具体未决问题。更新可随必要操作提交；最后一张图看完后用 stable_browser action=review 批量更新，无需重新截图、滚动或 read。reviewNotebook 是模型自述记录，不是自动验收；已通过且未受修改影响的证据可复用。旧画面只用真实 path 回看，不猜临时路径。尺寸/溢出/比例先 audit 或批量测量，视觉和交互仍需实际验证。先集中修复再复查受影响项和必要桌面/手机回归。区分图片内空白与容器额外留白，不能把可修复的布局缺陷直接归为素材限制；禁止为减少截图而忽略未修复问题。结束前更新所有检查：尚有 open/needs-recheck 就继续修复或验证；真正受权限、缺失数据等阻碍用 blocked 记录具体原因并在交付中明确未完成项，不得把它报为完成。'

// Per-run evidence; files outlive the MCP server and SDK temporary tool results.
// Capture is never cached: even identical pixels come from a fresh browser call.
function createBrowserEvidence({ workspace, writable, resolveFile, review = {} }) {
  let directory, actions = 0, screenshots = 0, repeated = 0
  const seen = new Set()
  const tabs = new Map(), evidence = [], checks = new Map(), riskStates = new Map()
  const scope = randomUUID()
  let evidenceSerial = 0, revision = 0, stopAttempts = 0, lastPending = '', unchangedAttempts = 0, capacityExceeded = false
  review.stop = () => {
    if (!screenshots && !checks.size) return {}
    const pending = [...checks.values()].filter(c => c.status === 'open' || c.status === 'needs-recheck')
    if (checks.size && !pending.length && !capacityExceeded) return {}
    const details = [pending.map(c => `${c.tabId}: ${c.check} (${c.status}) — ${c.note}`).join('\n'),
      capacityExceeded ? '测量候选超出24项记录容量，尚有未覆盖的布局复核，不能声明全部完成。' : ''].filter(Boolean).join('\n') || '尚未提交检查记录'
    unchangedAttempts = details === lastPending ? unchangedAttempts + 1 : 1
    lastPending = details
    if (++stopAttempts > 3 || unchangedAttempts > 2) {
      review.failure = `检查记录仍未完成，连续收尾未解决待验收项：\n${details}`
      return { continue: false, stopReason: review.failure }
    }
    return { decision: 'block', reason: `结束前还有未完成的检查记录：\n${details}\n复用已有证据，继续修复和必要复查，然后用 stable_browser action=review 更新原检查项。若实际受权限或数据阻碍，记录 blocked 及具体原因并如实交付未完成项；不要为通过检查而伪造结论。` }
  }
  review.incomplete = () => [...checks.values()].filter(c => c.status === 'blocked').map(c => `${c.check}：${c.note}`).join('\n')
  function notebook(args, result) {
    const tabId = String(result.tabId || args.tabId || 'unknown')
    const previous = tabs.get(tabId) || {}
    const epoch = result.epoch ?? previous.epoch
    const state = {
      epoch, url: result.url || previous.url,
      viewport: result.viewport || previous.viewport,
      revision: (previous.revision || 0) + (args.action === 'open' || previous.epoch !== undefined && epoch !== previous.epoch ? 1 : 0),
    }
    tabs.set(tabId, state)
    if (args.action === 'open' || previous.epoch !== undefined && epoch !== previous.epoch) {
      for (const entry of checks.values()) if (entry.tabId === tabId && entry.status === 'passed') entry.status = 'needs-recheck'
    }
    // This is an observation index, never a cache or an automatic quality verdict.
    if (result.screenshotArtifact || args.action === 'screenshot' && result.image || args.action === 'audit') {
      evidence.push({
        id: `evidence-${++evidenceSerial}`, serial: evidenceSerial, kind: args.action, tabId, epoch, revision: state.revision,
        viewport: args.action === 'screenshot' && (args.width || args.height)
          ? { ...state.viewport, ...(args.width ? { width: args.width } : {}), ...(args.height ? { height: args.height } : {}) }
          : state.viewport,
        purpose: args.purpose || (args.action === 'audit' ? '布局测量（不等于视觉验收）' : '画面观察'),
        spacing: result.imageSpacing || result.captureLayout?.imageSpacing,
        ...(result.screenshotArtifact ? { artifact: result.screenshotArtifact } : {}),
        ...(!result.screenshotArtifact && result.image ? { inline: true } : {}),
      })
      // Retain referenced observations so unrelated captures cannot undo a
      // completed check or evict an unresolved issue from the finite checklist.
      if (evidence.length > 24) {
        const referenced = new Set([...checks.values()].map(c => c.evidenceId))
        const index = evidence.findIndex((e, i) => i < evidence.length - 24 && !referenced.has(e.id))
        if (index >= 0) evidence.splice(index, 1)
      }
    }
    function usable(item) {
      if (!item?.artifact) return Boolean(item?.inline)
      try {
        const stat = fs.lstatSync(item.artifact.path)
        return stat.isFile() && !stat.isSymbolicLink() && hash(fs.readFileSync(item.artifact.path)) === item.artifact.sha256
      } catch { return false }
    }
    const available = new Set(evidence.filter(usable).map(item => item.id))
    const typography = result.typography || result.captureLayout?.typography
    const spacing = result.imageSpacing || result.captureLayout?.imageSpacing
    for (const [source, title, observation] of [['typography','文字换行',typography],['image-spacing','图片容器留白',spacing]]) {
      if (!Array.isArray(observation?.candidates) || !state.viewport?.width) continue
      const group = JSON.stringify([tabId, state.viewport.width, args.frameId || '', source])
      const visible = new Set()
      for (const candidate of observation.candidates) {
        const identity = hash(JSON.stringify([args.frameId || '', candidate.kind, candidate.tag, candidate.id, candidate.target, candidate.label])).slice(0, 12)
        const check = `${title} · ${state.viewport.width}px · ${String(candidate.label).slice(0, 60)} · ${identity}`
        const key = `${tabId}:${check}`
        visible.add(key)
        const signature = JSON.stringify(source==='typography'?candidate.lineCharacters:[candidate.gap,candidate.container?.height])
        const prior = riskStates.get(key)
        riskStates.set(key, { group, signature })
        if (riskStates.size > 48) riskStates.delete(riskStates.keys().next().value)
        if (signature === prior?.signature && checks.has(key)) continue
        // Keep separate labels across tab/section changes. Disappearing from
        // the visible page does not resolve an earlier observation.
        if (!checks.has(key) && checks.size >= 24) capacityExceeded = true
        else checks.set(key, { check, tabId, status: 'open', source, observedAfter: evidenceSerial,
          viewportWidth: state.viewport.width,
          ...(source==='image-spacing'?{spacingTarget:candidate.target}:{}),
          note: source==='typography'?`测量发现末行单字，需复核：${String(candidate.label).slice(0,120)}。修复后复查；若为有意排版，结合当前画面说明依据。`:
            `图片下方约${candidate.gap}px容器空白：${String(candidate.label).slice(0,90)}。区分素材内部空白和容器多余高度；检查相同组件的短/长图变体，修复后复核。若有意设计，结合当前证据说明。` })
      }
      // Absence never clears the checklist, but reappearing risks need a new
      // decision instead of inheriting a prior passed/intentional-layout note.
      for (const [key, seen] of riskStates) if (seen.group === group && !visible.has(key)) riskStates.delete(key)
    }
    for (const update of args.reviewUpdates || []) {
      if (!checks.has(`${tabId}:${update.check}`) && checks.size >= 24) throw Error('检查清单已达24项；请更新或合并已有检查，不要新增重复检查。')
      const item = evidence.find(item => item.id === update.evidenceId)
      const prior = checks.get(`${tabId}:${update.check}`)
      const verifiedReference = item && item.tabId === tabId && item.epoch === epoch && item.revision === state.revision &&
        (!prior?.observedAfter || item.serial >= prior.observedAfter && item.viewport?.width === prior.viewportWidth) &&
        (prior?.source !== 'image-spacing' || item.spacing?.observedTargets?.includes(prior.spacingTarget) && !item.spacing.candidates?.some(c=>c.target===prior.spacingTarget)) &&
        (item.kind === 'audit' || available.has(item.id))
      checks.set(`${tabId}:${update.check}`, {
        ...prior, ...update, tabId,
        status: update.status === 'passed' && !verifiedReference ? 'needs-recheck' : update.status,
        ...(update.status==='passed'&&!verifiedReference&&prior?.source==='image-spacing'?{note:'引用的同宽度测量未确认此图片容器空余高度已消失。请修复容器并复查，不用模糊背景、重复图片或装饰填充代替修复；若确有外部约束，明确记录 blocked，不宣称已完成。'}:{}),
      })
    }
    for (const entry of checks.values()) {
      const item = evidence.find(item => item.id === entry.evidenceId)
      if (entry.status === 'passed' && (!item || item.artifact && !available.has(item.id))) entry.status = 'needs-recheck'
    }
    return {
      scope, revision: ++revision,
      ...(capacityExceeded ? { capacityExceeded: true } : {}),
      checks: [...checks.values()],
      evidence: evidence.slice(-12).map(({ artifact, spacing, ...item }) => ({
        ...item, ...(artifact && available.has(item.id) ? { path: artifact.path } : {}),
      })),
      limits: '最近12条历史观察及最多24项模型自述检查；不是当前页面缓存或自动验收。未列出不代表已检查。页面重开或导航后旧通过项需复核；外部文件/脚本/异步变化不能自动判定，模型必须把受影响项标 needs-recheck。仅必要时回读历史路径；不要把历史 ref 当作当前控件。',
    }
  }
  function save(bytes, extension) {
    const base = resolveFile(path.join(workspace, '.stable', 'browser-evidence'))
    fs.mkdirSync(base, { recursive: true })
    if (!directory) directory = fs.mkdtempSync(path.join(base, 'run-'))
    const digest = hash(bytes), filename = resolveFile(path.join(directory, digest + extension))
    try { fs.writeFileSync(filename, bytes, { flag: 'wx' }) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const stat = fs.lstatSync(filename)
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || hash(fs.readFileSync(filename)) !== digest) throw Error('截图证据文件已变化。')
    }
    return { path: filename, sha256: digest }
  }
  return (args, value) => {
    if (!value || typeof value !== 'object' || value.error || value.ok === false) return value
    actions++
    let result = { ...value }
    if (args.action === 'screenshot' && typeof value.image === 'string') {
      const match = value.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/)
      if (match) {
        const bytes = Buffer.from(match[2], 'base64'), digest = hash(bytes)
        screenshots++
        const identical = seen.has(digest)
        if (identical) repeated++
        seen.add(digest)
        result.identicalScreenshot = identical
        if (writable) {
          try {
            const artifact = save(bytes, match[1] === 'jpeg' ? '.jpg' : '.' + match[1])
            result.screenshotPath = artifact.path
            result.screenshotArtifact = { ...artifact, mimeType: 'image/' + match[1] }
            result.screenshotUsage = '图片已显示。需像素/尺寸检查或回看历史时，只使用 screenshotPath 的真实文件；不要猜测 SDK tool-results 或 mcp-stable-blob 路径。'
          } catch {
            result.screenshotUsage = '截图已显示，但证据文件保存失败；没有可用 screenshotPath。不要猜测 SDK 临时路径，可依据当前图片继续检查。'
          }
        } else result.screenshotUsage = '只读模式下截图仅以内联图片提供，没有本地 screenshotPath；不要猜测 SDK 临时路径。'
      }
    }
    if (args.action === 'screenshot' || actions % 8 === 0) {
      result.reviewProgress = { browserActions: actions, screenshots, distinctScreenshots: seen.size, repeatedScreenshots: repeated, guidance: REVIEW_GUIDANCE }
    }
    result.reviewNotebook = notebook(args, result)
    return result
  }
}

module.exports = { createBrowserEvidence, REVIEW_GUIDANCE }
