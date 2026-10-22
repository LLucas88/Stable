import type { AutomationSchedule } from '../types'

export function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
}

export function formatAutomationSchedule(schedule: AutomationSchedule) {
  if (schedule.type === 'once') return `${schedule.date} ${schedule.time}`
  if (schedule.type === 'daily') return `每天 ${schedule.time}`
  if (schedule.type === 'weekly') return `每周 ${schedule.weekdays.map((day) => '日一二三四五六'[day]).join('、')} ${schedule.time}`
  return `每月 ${schedule.day} 日 ${schedule.time}`
}

export function formatLocalTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
