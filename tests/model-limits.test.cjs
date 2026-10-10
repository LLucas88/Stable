'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { modelLimits } = require('../desktop/services/model-limits.cjs')
const { ClaudeMessagesBridge } = require('../desktop/services/claude-messages-bridge.cjs')

test('bridge sends an explicit bounded output budget even if the SDK asks for more', async () => {
  const bodies = []
  const bridge = new ClaudeMessagesBridge({ model: { model:'deepseek-flash', baseURL:'https://api.deepseek.com' }, apiKey:'test-only', fetchImpl:async(_url, options)=>{
    bodies.push(JSON.parse(options.body))
    return new Response('data: '+JSON.stringify({choices:[{index:0,delta:{content:'ok'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n')
  } })
  await bridge.start()
  try {
    for (const max_output_tokens of [undefined,999999,4096]) {
      const response=await fetch(bridge.baseURL+'/v1/messages',{method:'POST',headers:{authorization:`Bearer ${bridge.token}`,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'hello'}],max_tokens:max_output_tokens,stream:true})})
      assert.equal(response.status,200); await response.text()
    }
    assert.deepEqual(bodies.map(body=>body.max_tokens),[32768,32768,4096])
  } finally { await bridge.close() }
})
test('verified Flash direct route uses its context window; a proxy or display name cannot inherit it', () => {
  const direct = { model: 'deepseek-flash', baseURL: 'https://api.deepseek.com/v1' }
  assert.equal(modelLimits(direct).contextWindow, 1000000)
  assert.equal(modelLimits(direct).autoCompactTokenLimit, 800000)
  assert.equal(modelLimits(direct).outputTokens, 32768)
  assert.equal(modelLimits({ ...direct, baseURL: 'https://proxy.example/v1' }).contextWindow, 128000)
  assert.equal(modelLimits({ ...direct, model: 'unknown' }).contextWindow, 128000)
})
test('catalog limits reserve room for output and invalid metadata uses conservative defaults', () => {
  for (const contextWindow of [4096, 64000, 128000, 1000000]) {
    const limits = modelLimits({ contextWindow, maxOutputTokens: 4096 })
    assert(limits.autoCompactTokenLimit + limits.outputTokens < contextWindow)
    assert(limits.outputTokens <= 4096)
  }
  assert.equal(modelLimits({ contextWindow: -1, maxOutputTokens: Infinity }).contextWindow, 128000)
})
