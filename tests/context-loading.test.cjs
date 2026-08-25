'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('agent context has no enabled-resource fallback and inventories workspace only on request', () => {
  const main = readFileSync(path.join(__dirname, '..', 'desktop', 'main.cjs'), 'utf8')
  const runAgent = main.slice(main.indexOf('async function runAgent'), main.indexOf('async function runWorkflow'))
  assert.doesNotMatch(runAgent, /enabledData\(|enabledKnowledge\(|enabledSkillContent\(/)
  assert.match(runAgent, /store\.retrieveData\(query, 5\)/)
  assert.match(runAgent, /store\.retrieveKnowledge\(query, 4\)/)
  assert.match(runAgent, /store\.retrieveSkills\(query, 4\)/)
  assert.ok(runAgent.indexOf('if (asksForWorkbenchInventory(query))') < runAgent.indexOf('const workbench = buildWorkbenchInventory'))
  assert.match(runAgent, /Agent 未生成要求的交付文件/)
})
