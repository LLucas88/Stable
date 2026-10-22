'use strict'

// Batching only removes model round trips; each action still uses the ordinary
// tool handler, approvals, cancellation, UI events and browser state checks.
async function runBrowserBatch(args, { invoke, view, signal }) {
  const content = []
  const observed = new Set((view(args)?.controls || []).map(c => c.label).filter(Boolean))
  const initial = view(args)
  if (args.reviewUpdates?.length) {
    const updated = await invoke({action:'review',tabId:args.tabId,...(args.frameId?{frameId:args.frameId}:{}),reviewUpdates:args.reviewUpdates})
    content.push(...updated.content)
    if (updated.isError) return finish(content,true)
  }
  for (const [index, step] of args.steps.entries()) {
    try {
      if (signal?.aborted) throw Error('任务已停止。')
      const { label, ...operation } = step
      if (!operation.purpose && args.purpose) operation.purpose = args.purpose
      if (label !== undefined) {
        if (!observed.has(label)) throw Error('批量操作的 label 必须来自此前已观察的控件，不能猜测。')
        const matches = (view(args)?.controls || []).filter(c => c.label === label)
        if (matches.length !== 1) throw Error('控件名称不唯一或已不可见，请读取当前页面后使用明确 ref。')
        operation.ref = matches[0].ref
      }
      const result = await invoke({ ...operation, tabId: args.tabId, ...(args.frameId ? { frameId: args.frameId } : {}) })
      for (const part of result.content) {
        if (part.type !== 'text' || result.isError) { content.push(part); continue }
        let value
        try { value = JSON.parse(part.text) } catch { content.push(part); continue }
        content.push({ ...part, text: JSON.stringify({ ...value, batchStep: index + 1, action: step.action }) })
      }
      if (result.isError) return finish(content, true)
      const current = view(args)
      if (initial && current && (initial.epoch !== current.epoch || initial.url !== current.url)) {
        throw Error('页面已导航，批量检查在此停止；请根据新页面重新规划后续步骤。')
      }
    } catch (error) {
      content.push({ type: 'text', text: `批量步骤 ${index + 1} 停止：${error.message} 已完成步骤保留，不自动重试。` })
      return finish(content, true)
    }
  }
  return finish(content)
}

function finish(content, isError) {
  let lastSnapshot = -1, lastNotebook = -1
  const metadata = content.map((p, i) => {
    if (p.type !== 'text') return null
    try {
      const value = JSON.parse(p.text)
      if (Array.isArray(value.controls)) lastSnapshot = i
      if (value.reviewNotebook) lastNotebook = i
      return value
    } catch { return null }
  })
  return { content: content.map((part, i) => {
    const value = metadata[i]
    if (!value) return part
    if (i !== lastNotebook) { delete value.reviewNotebook; delete value.reviewProgress }
    if (i !== lastSnapshot && value.action !== 'audit') {
      // Intermediate refs are already stale. Keep actual captures, audit
      // measurements, viewport/URL and failures, rather than repeated page text.
      delete value.controls; delete value.text; delete value.tables
    }
    return { ...part, text: JSON.stringify(value) }
  }), ...(isError ? { isError: true } : {}) }
}

module.exports = { runBrowserBatch }
