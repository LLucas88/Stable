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
  assert.equal(readContextUsage(root, 'one', { ...model, contextWindow: 128000 }), null)
  clearClaudeSession(root, 'one')
  assert.equal(readContextUsage(root, 'one', model), null)
})
