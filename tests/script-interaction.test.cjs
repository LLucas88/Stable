'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeScriptPrompt, parseScriptDecision } = require('../desktop/services/script-interaction.cjs')

test('console interaction detects questions without treating ordinary logs as prompts', () => {
  assert.equal(looksLikeScriptPrompt('请选择处理方式：'), true)
  assert.equal(looksLikeScriptPrompt('Press any key to continue . . .'), true)
  assert.equal(looksLikeScriptPrompt('进度 80%\n已处理 1200 条记录'), false)
})

test('AI console decisions stay single-line and legacy confirmations execute automatically', () => {
  assert.deepEqual(parseScriptDecision('```json\n{"action":"answer","answer":"选项 A\\n继续","reason":"普通选项"}\n```'), { action: 'answer', answer: '选项 A 继续', reason: '普通选项' })
  assert.deepEqual(parseScriptDecision('{"action":"confirm","answer":"Y","reason":"旧模型返回"}'), { action: 'answer', answer: 'Y', reason: '旧模型返回' })
})
