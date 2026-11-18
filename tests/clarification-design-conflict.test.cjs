'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { waitingCard, waitingAnswer, clarificationStream, clarifyBeforeExecution, WAIT_MARKER } = require('../desktop/services/clarification.cjs')
const { runWithDeliveryChecks, deliveryRequest } = require('../desktop/services/delivery.cjs')
const { explicitImageCount } = require('../desktop/services/design-request.cjs')
const card = { question: '图1指哪张图？', hint: '没有上传附件', options: [{ label: '描述配色', description: '使用文字配色' }, { label: '上传参考图', description: '等待上传图片' }] }
const raw = '本次没有上传参考图。\n\n' + WAIT_MARKER + '\n' + JSON.stringify(card)
test('prefixed question retains explanation, hides streamed protocol across every boundary, and pauses even after a partial artifact', async t => {
  assert.equal(waitingAnswer(raw), card.question)
  assert.deepEqual(waitingCard(raw), { ...card, explanation: '本次没有上传参考图。' })
  for (let split = 1; split < raw.length; split++) {
    const stream = clarificationStream()
    assert.equal(stream('a', raw.slice(0, split)) + stream('a', raw.slice(split)), '本次没有上传参考图。\n\n')
    assert.equal(stream('b', '正常回复'), '正常回复')
  }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-prefixed-card-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  let calls = 0
  const result = await runWithDeliveryChecks({ workspace, delivery: deliveryRequest('生成 HTML 报告'), prompt: '', execute: async () => {
    calls++; fs.writeFileSync(path.join(workspace, 'partial.html'), '<html>尚未完成</html>'); return raw
  } })
  assert.equal(calls, 1); assert.equal(result.status, 'waiting'); assert.equal(result.answer, card.question)
  assert.equal(result.clarification.explanation, '本次没有上传参考图。'); assert.deepEqual(result.artifacts, [])
})
test('inline examples, fenced examples, malformed and incomplete cards do not create actionable questions', () => {
  for (const text of ['示例：' + WAIT_MARKER + JSON.stringify(card), '```text\n' + WAIT_MARKER + '\n' + JSON.stringify(card) + '\n```', '说明\n' + WAIT_MARKER + '\n{broken', '说明\n' + WAIT_MARKER + '\n' + JSON.stringify({ ...card, options: [] }), raw + '\n尾部无关内容']) {
    assert.equal(waitingCard(text), null); assert.equal(waitingAnswer(text), null)
  }
  assert.equal(waitingAnswer('为什么增长？这是分析结果。'), null)
})
const payload = { prompt: '参考图1的配色，主标题写“周末，慢一点”。先生成 1 张。', design: { model: 'glm-image', mode: 'generate', ratio: '3:4', resolution: '2k', count: 4, text: '' } }
test('explicit user count wins over panel defaults without a conflict card', async () => {
  let calls=0
  const result = await clarifyBeforeExecution({ payload, messages: [], ask: async prompt => { calls++; assert.doesNotMatch(prompt,/先提问，不自动覆盖/); return '{"status":"ready"}' } })
  assert.equal(result.status,'ready'); assert.equal(result.payload.design.count,1)
  assert.equal(payload.design.count,4); assert.equal(calls,1)
  const resolved = await clarifyBeforeExecution({ payload: {...payload,clarificationResolved:true}, messages: [], ask:()=>{throw Error('unexpected')} })
  assert.equal(resolved.status,'ready'); assert.equal(resolved.payload.design.count,1)
})

test('reference numbers, text in quotes, negation and ambiguous quantities are not interpreted as generation counts', () => {
  for (const text of ['参考图1和图4', '1536x2048', '标题写“先生成1张”', '不要生成1张', '先生成1张，再生成4张', '生成10张', '是不是生成1张？']) assert.equal(explicitImageCount(text), null, text)
  assert.equal(explicitImageCount('先生成两张。'), 2)
})
