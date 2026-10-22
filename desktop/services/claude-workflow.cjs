'use strict'

// Advisory only: identical arguments do not imply identical page state. Never
// cache execution, discard evidence, or infer completion from these counters.
function workflowGuidance(messages) {
  const calls = new Map(), opens = [], notes = []
  let textSize = 0, screenshots = 0, hasChecklist = false
  for (const message of messages) {
    // A real new user message starts a new task/clarification boundary.
    if (message.role === 'user') { opens.length = 0; screenshots = 0; hasChecklist = false }
    for (const call of message.tool_calls || []) {
      calls.set(call.id, call.function)
      textSize += (call.function?.arguments || '').length
    }
    textSize += (message.reasoning_content || '').length
    if (typeof message.content === 'string') textSize += message.content.length
    else for (const part of message.content || []) if (part.type === 'text') textSize += part.text.length
    if (message.role !== 'tool') continue
    const call = calls.get(message.tool_call_id)
    if (!/^(?:mcp__stable__)?stable_browser$/.test(call?.name || '')) continue
    const parts = typeof message.content === 'string' ? [{ text: message.content }] : message.content || []
    if (parts.some(p => p.text?.startsWith('Tool execution error:'))) continue
    try {
      const args = JSON.parse(call.arguments)
      const result = parts.map(p => { try { return JSON.parse(p.text) } catch { return null } }).find(v => v?.tabId)
      if (!result || result.error || result.ok === false) continue
      if (Array.isArray(result.reviewNotebook?.checks)) hasChecklist = result.reviewNotebook.checks.length > 0
      if (args.action === 'screenshot') screenshots++
      if (args.action !== 'open' || typeof args.url !== 'string') continue
      opens.push(JSON.stringify([args.url, args.width, args.height]))
    } catch {}
  }
  const recent = opens.slice(-6), latest = recent.at(-1)
  const repeats = latest ? recent.filter(key => key === latest).length : 0
  if (repeats >= 3) notes.push(`当前任务最近的页面打开记录中，同一目标和视口已成功打开 ${repeats} 次。这不代表重复无效：修改、异步变化后仍须复查。请先集中列出已观察问题与用户必需的未验收项，再合并修复并复查受影响区域；已验证且未变化的区域复用证据。不要为更新检查记录再截图，也不要把未完成项标为通过。`)
  if (screenshots >= 2 && !hasChecklist) notes.push('已进行多次截图但尚无验收清单。请用 stable_browser action=review 的 reviewUpdates 建立用户要求对应的有限检查项，依据已有真实证据记录结论；未验证项保留 open，需要复查的项标 needs-recheck，不伪造 passed。更新清单无需再次截图。先完成必需的数据、全部卡片类型的交互和必要视口检查，再给出交付文件与未完成项；不要无限增加装饰性检查。')
  if (textSize > 120000) notes.push('当前历史文本较长（不含图片编码；不是供应商 token 计量）。后续优先完成用户必需的产物、数据和交互验收；避免重读未变化文件、整页重写和扩展装饰。必要修改后仍要复查。保存已验证/未验证清单及真实证据，无法完成时如实交付现有文件和剩余项。')
  return notes.join('\n')
}

module.exports = { workflowGuidance }
