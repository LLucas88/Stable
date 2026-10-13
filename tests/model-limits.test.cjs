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


test('all discovered official models have verified capacities and SDK-valid compaction windows', () => {
  const groups = [
    ['https://open.bigmodel.cn/api/paas/v4', 128000, ['glm-4.5','glm-4.5-air']],
    ['https://open.bigmodel.cn/api/paas/v4', 200000, ['glm-4.6','glm-4.7','glm-5','glm-5-turbo','glm-5.1']],
    ['https://open.bigmodel.cn/api/paas/v4', 1000000, ['glm-5.2','glm-5.3','glm-5.3-flash','glm-5.3-flashx']],
    ['https://api.deepseek.com', 1000000, ['deepseek-flash','deepseek-v4-pro']],
  ]
  for (const [baseURL, contextWindow, models] of groups) for (const model of models) {
    const limits = modelLimits({baseURL,model})
    assert.equal(limits.contextWindow,contextWindow,model)
    assert(limits.autoCompactTokenLimit>=100000 && limits.autoCompactTokenLimit<=1000000,model)
    assert(limits.autoCompactTokenLimit+limits.outputTokens<contextWindow,model)
    assert.equal(limits.sdkModel.endsWith('[1m]'),contextWindow>200000)
  }
  assert.equal(modelLimits({baseURL:'https://proxy.invalid',model:'glm-5.3-flashx'}).contextWindow,128000)
  assert.equal(modelLimits({baseURL:'https://open.bigmodel.cn',model:'glm-unknown'}).contextWindow,128000)
  assert.equal(modelLimits({baseURL:'https://open.bigmodel.cn',model:'glm-5.3-flashx',contextWindow:200000}).contextWindow,200000)
})


test('SDK window compensates its reserves so compaction begins at 80 percent total usage', () => {
  for (const [contextWindow, maxOutputTokens] of [[128000, 8192], [200000, 8192], [1000000, 4096], [1000000, 32768]]) {
    const limits = modelLimits({ model: 'deepseek-flash', baseURL: 'https://api.deepseek.com', contextWindow, maxOutputTokens })
    const sdkTrigger = limits.autoCompactWindow - Math.min(limits.outputTokens, 20000) - 13000
    assert.equal(sdkTrigger, contextWindow * .8)
    assert.equal(limits.autoCompactTokenLimit, sdkTrigger)
    assert(limits.autoCompactWindow >= 100000 && limits.autoCompactWindow <= 1000000)
    assert(sdkTrigger + limits.outputTokens < contextWindow)
  }
})

test('official GLM has room for reasoning plus file output without moving compaction below 80 percent', () => {
  for (const model of ['glm-4.5', 'glm-4.7', 'glm-5.3-flashx']) {
    const limits = modelLimits({ model, baseURL: 'https://open.bigmodel.cn/api/paas/v4' })
    assert(limits.outputTokens > 8192)
    assert(limits.outputTokens <= 32768)
    assert.equal(limits.autoCompactTokenLimit, limits.contextWindow * .8)
    assert.equal(limits.autoCompactWindow - Math.min(limits.outputTokens, 20000) - 13000, limits.autoCompactTokenLimit)
  }
  assert.equal(modelLimits({ model: 'glm-5.3-flashx', baseURL: 'https://open.bigmodel.cn', maxOutputTokens: 4096 }).outputTokens, 4096)
  assert.equal(modelLimits({ model: 'glm-5.3-flashx', baseURL: 'https://proxy.invalid' }).outputTokens, 8192)
})
