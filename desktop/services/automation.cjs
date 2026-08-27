'use strict'

const SCHEDULE_TYPES = new Set(['once', 'daily', 'weekly', 'monthly'])

function requireShortText(value, label, maxLength) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`请填写${label}。`)
  if (text.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符。`)
  return text
}

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) throw new Error('执行时间必须使用 HH:mm 格式。')
  const hour = Number(match[1]); const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error('执行时间无效。')
  return { value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, hour, minute }
}

function parseDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error('执行日期必须使用 YYYY-MM-DD 格式。')
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('执行日期无效。')
  return { value: `${match[1]}-${match[2]}-${match[3]}`, year, month, day }
}

function localDate(year, monthIndex, day, hour, minute) {
  return new Date(year, monthIndex, day, hour, minute, 0, 0)
}

function computeNextRun(schedule, after = new Date()) {
  const type = String(schedule?.type || '')
  if (!SCHEDULE_TYPES.has(type)) throw new Error('未知的定时类型。')
  const baseline = after instanceof Date ? after : new Date(after)
  if (!Number.isFinite(baseline.getTime())) throw new Error('计算定时任务时使用了无效时间。')
  const time = parseTime(schedule.time)
  if (type === 'once') {
    const date = parseDate(schedule.date)
    const candidate = localDate(date.year, date.month - 1, date.day, time.hour, time.minute)
    return candidate > baseline ? candidate.toISOString() : undefined
  }
  if (type === 'daily') {
    const candidate = localDate(baseline.getFullYear(), baseline.getMonth(), baseline.getDate(), time.hour, time.minute)
    if (candidate <= baseline) candidate.setDate(candidate.getDate() + 1)
    return candidate.toISOString()
  }
  if (type === 'weekly') {
    const weekdays = [...new Set((Array.isArray(schedule.weekdays) ? schedule.weekdays : []).map(Number))]
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b)
    if (!weekdays.length) throw new Error('每周任务至少选择一个星期。')
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = localDate(baseline.getFullYear(), baseline.getMonth(), baseline.getDate() + offset, time.hour, time.minute)
      if (weekdays.includes(candidate.getDay()) && candidate > baseline) return candidate.toISOString()
    }
  }
  const day = Number(schedule.day)
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('每月执行日必须在 1 到 31 之间。')
  for (let offset = 0; offset <= 24; offset += 1) {
    const year = baseline.getFullYear(); const month = baseline.getMonth() + offset
    const lastDay = new Date(year, month + 1, 0).getDate()
    const candidate = localDate(year, month, Math.min(day, lastDay), time.hour, time.minute)
    if (candidate > baseline) return candidate.toISOString()
  }
  throw new Error('无法计算下一次执行时间。')
}

function normalizeSchedule(value, now = new Date()) {
  const type = String(value?.type || '')
  if (!SCHEDULE_TYPES.has(type)) throw new Error('请选择定时类型。')
  const time = parseTime(value.time).value
  const schedule = { type, time }
  if (type === 'once') schedule.date = parseDate(value.date).value
  if (type === 'weekly') {
    schedule.weekdays = [...new Set((Array.isArray(value.weekdays) ? value.weekdays : []).map(Number))]
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b)
    if (!schedule.weekdays.length) throw new Error('每周任务至少选择一个星期。')
  }
  if (type === 'monthly') {
    schedule.day = Number(value.day)
    if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 31) throw new Error('每月执行日必须在 1 到 31 之间。')
  }
  const nextRunAt = computeNextRun(schedule, now)
  if (!nextRunAt) throw new Error('一次性任务的执行时间必须晚于当前时间。')
  return { schedule, nextRunAt }
}

function normalizeAutomationInput(value, now = new Date()) {
  const title = requireShortText(value?.title, '任务名称', 100)
  const prompt = requireShortText(value?.prompt, '执行任务', 20_000)
  const normalized = normalizeSchedule(value?.schedule, now)
  return { title, prompt, ...normalized }
}

function automationIntent(value) {
  const text = String(value || '')
  return /(自动化|定时|到点|每天|每日|每周|每星期|每月|每个月|明天|后天|\d{1,2}[点时:]\d{0,2}分?)/.test(text)
    && /(创建|新建|设置|安排|执行|运行|提醒|生成|检查|搜索|整理|发送)/.test(text)
}

function proposalPrompt(query, now = new Date()) {
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return `你是 Stable 自动化任务解析器。当前本地时间：${local}。不要调用任何工具，只输出一个 JSON 对象，不要使用 Markdown。\n\nJSON 格式：\n{"isAutomation":true,"title":"简短名称","prompt":"到点后交给 Stable 执行的完整任务","schedule":{"type":"once|daily|weekly|monthly","date":"YYYY-MM-DD（仅 once）","time":"HH:mm","weekdays":[0-6]（仅 weekly，0=周日）,"day":1（仅 monthly）}}\n\n如果用户不是在创建定时任务，输出 {"isAutomation":false}。不要把当前创建动作写进 prompt，prompt 只保留未来真正执行的任务。\n\n用户消息：${String(query).slice(0, 20_000)}`
}

function parseProposalOutput(value, now = new Date()) {
  const text = String(value || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const start = text.indexOf('{'); const end = text.lastIndexOf('}')
  const raw = fenced || (start >= 0 && end > start ? text.slice(start, end + 1) : text)
  let parsed
  try { parsed = JSON.parse(raw) } catch { throw new Error('模型没有返回可识别的自动化设置，请换一种更明确的日期和时间描述。') }
  if (!parsed?.isAutomation) return undefined
  return normalizeAutomationInput(parsed, now)
}

function automationTemplates() {
  return [
    { id: 'daily-brief', title: '每日工作摘要', description: '每天汇总当前工作区的进展与待办。', prompt: '汇总当前工作区今天的进展、风险和下一步待办。', schedule: { type: 'daily', time: '18:00' } },
    { id: 'weekly-review', title: '每周复盘', description: '每周一生成一份重点清单。', prompt: '整理上周完成事项、本周目标和需要关注的风险。', schedule: { type: 'weekly', time: '09:00', weekdays: [1] } },
    { id: 'monthly-check', title: '月度资料检查', description: '每月首日检查资料缺口。', prompt: '检查工作区资料是否完整，列出缺失、过期和需要更新的内容。', schedule: { type: 'monthly', time: '10:00', day: 1 } },
  ]
}

module.exports = {
  SCHEDULE_TYPES, automationIntent, automationTemplates, computeNextRun,
  normalizeAutomationInput, normalizeSchedule, parseProposalOutput, proposalPrompt,
}
