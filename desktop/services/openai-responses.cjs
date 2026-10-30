'use strict'
const { createHash } = require('node:crypto')
const { ChatGPTResponses } = require('./chatgpt-responses.cjs')
const { openAiResponsesModel } = require('./model-reasoning.cjs')

// API-key and Cloud traffic share the Responses protocol, never SIWC credentials.
class OpenAIResponses extends ChatGPTResponses {
  constructor({ model, apiKey, fetchImpl, reasoningFile }) {
    if (!openAiResponsesModel(model)) throw Error('未配置 OpenAI Responses 路由。')
    super({ model: { ...model, accountId: `${model.providerId}:${model.cloudBaseURL || model.baseURL}:${model.accountId || createHash('sha256').update(apiKey).digest('hex').slice(0,16)}` }, reasoningFile: reasoningFile && `${reasoningFile}.openai`, account: {
      async request(_model, body, signal) {
        const response = await fetchImpl(`${model.baseURL.replace(/\/$/, '')}/responses`, { method:'POST', redirect:'error', signal,
          headers:{authorization:`Bearer ${apiKey}`, 'content-type':'application/json', accept:'text/event-stream'}, body:JSON.stringify(body) })
        if (!response.ok) {
          let code; try { const b = await response.json(); code = b.error?.code } catch {}
          const hints = { upstream_insufficient_balance:'模型供应商余额不足，请联系网关管理员。', insufficient_quota:'OpenAI 项目额度不足。', model_not_found:'模型不存在或当前项目无权访问。' }
          throw Object.assign(Error(`OpenAI 请求失败（HTTP ${response.status}）。${hints[code] || '请检查模型权限及网关配置。'}`), {status:response.status,requestRejected:true,providerRejected:true,permanentProviderFailure:[400,401,402,403,404].includes(response.status)})
        }
        return response
      },
    } })
  }
  translate(body) {
    const translated = super.translate(body)
    // The public API's forced FunctionToolChoice accepts type/name only.
    // Keep Stable's unique aliases, but use flat functions rather than the
    // SIWC namespace selector inherited from the subscription transport.
    if (translated.request.tools) translated.request.tools = translated.request.tools.flatMap(tool => tool.type === 'namespace' ? tool.tools : [tool])
    if (translated.request.tool_choice?.namespace) {
      const { namespace, ...choice } = translated.request.tool_choice
      translated.request.tool_choice = choice
    }
    translated.request.input = translated.request.input.map(item => {
      if (item.type !== 'function_call' || !item.namespace) return item
      const { namespace, ...call } = item
      return call
    })
    if (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1) throw Error('OpenAI 最大输出限制无效。')
    translated.request.max_output_tokens = Math.min(body.max_tokens, 128000)
    return translated
  }
}
module.exports = { OpenAIResponses }
