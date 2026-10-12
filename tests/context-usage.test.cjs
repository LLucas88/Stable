'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { normalizeContextUsage, readContextUsage } = require('../desktop/services/context-usage.cjs')
const { sessionDirectory, clearClaudeSession } = require('../desktop/services/claude-session.cjs')

const model = { model: 'fixture', baseURL: 'https://example.invalid', contextWindow: 1_000_000 }
const raw = { totalTokens: 286200, maxTokens: 200000, categories: [
  { name: 'Messages', tokens: 200000, kind: 'used' },
  { name: 'MCP tools', tokens: 86200, kind: 'used' },
  { name: 'Free', tokens: 700000, kind: 'free' },
  { name: 'Buffer', tokens: 10000, kind: 'buffer' },
  { name: 'Deferred', tokens: 10000, kind: 'deferred' },
] }

test('context usage uses the routed model capacity and excludes free/reserved/deferred categories', () => {
  const result = normalizeContextUsage(raw, model)
  assert.equal(result.maxTokens, 1_000_000)
  assert.equal(result.usedTokens, 286200)
  assert.equal(result.percentage, 28.62)
  assert.equal(result.estimated, true)
  assert.deepEqual(result.categories.map(row => row.name), ['Messages', 'MCP tools'])
  assert.equal(normalizeContextUsage({ totalTokens: -1 }, model), null)
  assert.equal(normalizeContextUsage({ totalTokens: NaN }, model), null)
  assert.equal(normalizeContextUsage(null, model), null)
  assert.equal(normalizeContextUsage({ totalTokens: 0 }, model).usedTokens, 0)
})

test('usage snapshots survive restart, stay scoped to their model, and disappear on rebuild', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'context-usage-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dir = sessionDirectory(root, 'one'); fs.mkdirSync(dir, { recursive: true })
  const contextUsage = normalizeContextUsage(raw, model)
  fs.writeFileSync(path.join(dir, 'stable-thread.json'), JSON.stringify({ ...model, contextUsage }))
  assert.deepEqual(readContextUsage(root, 'one', model), contextUsage)
  assert.equal(readContextUsage(root, 'two', model), null)
  assert.equal(readContextUsage(root, 'one', { ...model, model: 'other' }), null)
  const resized = readContextUsage(root, 'one', { ...model, contextWindow: 128000 })
  assert.equal(resized.maxTokens, 128000)
  assert.equal(resized.usedTokens, contextUsage.usedTokens)
  assert.equal(resized.updatedAt, contextUsage.updatedAt)
  clearClaudeSession(root, 'one')
  assert.equal(readContextUsage(root, 'one', model), null)
})


test('legacy GLM snapshot gets corrected capacity without rewriting conversation data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'context-usage-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const profile = { model: 'glm-5.3-flashx', baseURL: 'https://open.bigmodel.cn/api/paas/v4' }
  const dir = sessionDirectory(root, 'legacy'); fs.mkdirSync(dir, { recursive: true })
  const contextUsage = normalizeContextUsage({ totalTokens: 175806 }, { ...profile, contextWindow: 128000 })
  const file = path.join(dir, 'stable-thread.json')
  const original = JSON.stringify({ ...profile, threadId: 'preserved-session', contextUsage })
  fs.writeFileSync(file, original)
  const usage = readContextUsage(root, 'legacy', profile)
  assert.equal(usage.usedTokens, 175806)
  assert.equal(usage.maxTokens, 1000000)
  assert.equal(usage.percentage, 17.5806)
  assert.equal(usage.updatedAt, contextUsage.updatedAt)
  assert.equal(fs.readFileSync(file, 'utf8'), original)
})
