'use strict'

const fs = require('node:fs')
const { assertSessionPath } = require('./claude-session.cjs')
const { modelLimits } = require('./model-limits.cjs')

const count = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null

function normalizeContextUsage(raw, model) {
  if (!raw || count(raw.totalTokens) === null) return null
  const maxTokens = modelLimits(model).contextWindow
  const usedTokens = count(raw.totalTokens)
  const categories = (raw.categories || []).filter(row => row.kind === 'used' && count(row.tokens) !== null)
    .map(row => ({ name: String(row.name).slice(0, 120), tokens: count(row.tokens) }))
  const rows = (items, label) => (items || []).filter(row => count(row.tokens) !== null)
    .slice(0, 500).map(row => ({ name: String(label(row) || '').slice(0, 300), tokens: count(row.tokens) }))
  return {
    model: model.model, maxTokens, usedTokens, percentage: usedTokens / maxTokens * 100,
    updatedAt: Date.now(), estimated: true, categories,
    mcpTools: rows(raw.mcpTools, row => [row.serverName, row.name].filter(Boolean).join(' / ')),
    memoryFiles: rows(raw.memoryFiles, row => row.path),
    systemTools: rows(raw.systemTools, row => row.name),
    skills: rows(raw.skills?.skillFrontmatter, row => row.name),
  }
}

function readContextUsage(userData, key, model) {
  try {
    const saved = JSON.parse(fs.readFileSync(assertSessionPath(userData, key, 'stable-thread.json'), 'utf8'))
    if (saved.model !== model.model || saved.baseURL !== model.baseURL) return null
    const usage = saved.contextUsage
    if (!usage || usage.maxTokens !== modelLimits(model).contextWindow || count(usage.usedTokens) === null) return null
    return usage
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}

module.exports = { normalizeContextUsage, readContextUsage }
