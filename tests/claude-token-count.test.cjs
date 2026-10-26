'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { CalibratedTokenCounter, snapshot } = require('../desktop/services/claude-token-count.cjs')
const model = { providerId: 'test', model: 'deepseek-flash', baseURL: 'https://provider.invalid' }
const body = { messages: [{ role: 'user', content: '测试上下文 mixed text '.repeat(1000) }], tools: [{ type: 'function', function: { name: 'Read' } }] }

test('provider prefix uses total prompt tokens including cache, with conservative new content', () => {
  const c = new CalibratedTokenCounter({ model })
  const old = c.estimate(body)
  c.observe(body, { prompt_tokens: 3000, prompt_tokens_details: { cached_tokens: 2999 } })
  assert.equal(c.estimate(body).tokens, 3124)
  assert(c.estimate(body).tokens < old.tokens)
  const next = { ...body, messages: [...body.messages, { role: 'assistant', content: 'done', reasoning_content: 'private'.repeat(100) }] }
  assert.equal(c.estimate(next).tokens, 3124 + snapshot(next).messages.at(-1).bytes)
  assert(c.estimate(next).tokens > c.estimate({ ...next, messages: [...body.messages, { role: 'assistant', content: 'done' }] }).tokens)
})

test('changed history, schema, structured format, and compacted prefixes invalidate calibration', () => {
  const c = new CalibratedTokenCounter({ model }); c.observe(body, { prompt_tokens: 3000 })
  for (const changed of [
    { ...body, tools: [] }, { ...body, response_format: { type: 'json_object' } },
    { ...body, messages: [{ role: 'user', content: 'different' }] },
    { ...body, messages: [{ role: 'system', content: 'new rules' }, ...body.messages] },
  ]) assert.equal(c.estimate(changed).calibrated, false)
})

test('calibration persists hashes only, expires and stays scoped to provider/model', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-count-')), file = path.join(root, 'counts.json')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let now = 10_000
  const c = new CalibratedTokenCounter({ model, file, now: () => now }); c.observe(body, { prompt_tokens: 3000 })
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /测试上下文|mixed text|provider.invalid/)
  assert(new CalibratedTokenCounter({ model, file, now: () => now }).estimate(body).calibrated)
  assert.equal(new CalibratedTokenCounter({ model: { ...model, model: 'glm-5.3-flashx' }, file, now: () => now }).estimate(body).calibrated, false)
  now += 24 * 60 * 60 * 1000
  assert.equal(c.estimate(body).calibrated, false)
  fs.writeFileSync(file, '{broken')
  assert.equal(new CalibratedTokenCounter({ model, file }).estimate(body).calibrated, false)
})

test('missing, impossible and non-integer usage never calibrates; history remains bounded', () => {
  const c = new CalibratedTokenCounter({ model })
  for (const tokens of [undefined, null, -1, NaN, 0, 1.5, 20_000_000]) c.observe(body, { prompt_tokens: tokens })
  assert.equal(c.samples.length, 0)
  for (let i = 0; i < 12; i++) c.observe(body, { prompt_tokens: 3000 })
  assert.equal(c.samples.length, 8)
})

test('base64 is not tokenized as text; changed image content invalidates the anchor', () => {
  const c = new CalibratedTokenCounter({ model })
  const image = data => ({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + data } }] }] })
  const a = image('a'.repeat(1000000)), b = image('b'.repeat(1000000))
  assert(c.estimate(a).tokens < 5000)
  c.observe(a, { prompt_tokens: 1200 })
  assert(c.estimate(a).calibrated)
  assert.equal(c.estimate(b).calibrated, false)
})
