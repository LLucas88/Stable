'use strict'

const TERMINAL_STATUSES = new Set(['success', 'failed', 'rejected', 'cancelled'])

function normalizeCapabilities(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 20)
}

function capabilitySet(device) {
  const capabilities = device?.capabilities || {}
  return new Set([
    ...normalizeCapabilities(capabilities.skills).map((name) => `skill:${name}`),
    ...normalizeCapabilities(capabilities.scripts).map((name) => `script:${name}`),
    ...normalizeCapabilities(capabilities.tools).map((name) => `tool:${name}`),
    ...normalizeCapabilities(capabilities.plugins).map((name) => `plugin:${name}`),
    ...(capabilities.dataCount > 0 ? ['data'] : []),
    ...(capabilities.knowledgeCount > 0 ? ['knowledge'] : []),
  ])
}

function selectTeamDevice(devices, requiredCapabilities = [], options = {}) {
  const required = normalizeCapabilities(requiredCapabilities)
  const excluded = new Set(options.excludeDeviceIds || [])
  const load = options.loadByDevice || {}
  const candidates = (devices || []).filter((device) => device.status === 'online' && !excluded.has(device.id) && device.id !== options.localDeviceId)
  const ranked = candidates.map((device) => {
    const available = capabilitySet(device)
    const matched = required.filter((name) => available.has(name)).length
    const missing = required.length - matched
    const currentLoad = Number(load[device.id] || 0)
    const roleBonus = device.role === 'owner' ? 2 : device.role === 'admin' ? 1 : 0
    return { device, matched, missing, score: matched * 100 - missing * 1_000 - currentLoad * 10 + roleBonus }
  }).filter((item) => item.missing === 0 || options.allowPartial)
  ranked.sort((left, right) => right.score - left.score || String(left.device.id).localeCompare(String(right.device.id)))
  return ranked[0]?.device
}

function shouldAutoApprove(preferences, sourceDeviceId, requiredCapabilities = []) {
  const mode = preferences?.approvalMode || 'ask'
  if (mode === 'team') return true
  if (mode !== 'trusted') return false
  if ((preferences?.trustedDeviceIds || []).includes(sourceDeviceId)) return true
  const trusted = new Set(preferences?.trustedCapabilities || [])
  const required = normalizeCapabilities(requiredCapabilities)
  return required.length > 0 && required.every((item) => trusted.has(item))
}

function extractJsonObject(value) {
  const text = String(value || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate) throw new Error('协作规划没有返回 JSON。')
  return JSON.parse(candidate)
}

function parseCollaborationPlan(value, limit = 3) {
  const parsed = typeof value === 'string' ? extractJsonObject(value) : value
  const source = Array.isArray(parsed?.subtasks) ? parsed.subtasks : []
  const subtasks = source.slice(0, Math.max(1, Math.min(3, limit))).map((item, index) => ({
    title: String(item?.title || `子任务 ${index + 1}`).replace(/\s+/g, ' ').trim().slice(0, 80),
    instruction: String(item?.instruction || '').trim().slice(0, 10_000),
    requiredCapabilities: normalizeCapabilities(item?.requiredCapabilities),
    expectedOutput: String(item?.expectedOutput || '').trim().slice(0, 1_000),
  })).filter((item) => item.instruction)
  if (subtasks.length < 2) throw new Error('多 Agent 协作至少需要两个可独立执行的子任务。')
  return { summary: String(parsed?.summary || '').trim().slice(0, 1_000), subtasks }
}

function isTerminal(status) { return TERMINAL_STATUSES.has(status) }

module.exports = { capabilitySet, isTerminal, normalizeCapabilities, parseCollaborationPlan, selectTeamDevice, shouldAutoApprove }
