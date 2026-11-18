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
          const cloud = model.providerId === 'stable-cloud'
          const hints = {
            upstream_insufficient_balance:'模型供应商余额不足，请联系网关管理员。',
            insufficient_quota:cloud ? 'Stable 账号可用额度不足，或不足以覆盖本次任务预占。请联系管理员核对额度和未结算请求。' : 'OpenAI API 可用额度不足，请检查余额及用量上限。',
            input_token_count_unavailable:'暂时无法核算本次请求额度，尚未提交模型生成。请稍后重试。',
            openai_egress_unavailable:'云端线路暂时不可用，系统正在检测恢复；本次尚未提交生成，请恢复后继续原任务。',
            model_not_configured:'该模型的服务器配置不完整，请联系管理员检查服务配置。',
            model_not_found:'模型不存在或当前项目无权访问。',
            upstream_model_not_found:'供应商接口或模型不存在，请联系管理员检查模型配置。',
            upstream_authentication_failed:'供应商凭据或权限异常，请联系管理员检查连接配置。',
            upstream_invalid_request:'模型供应商拒绝请求参数，请检查内容后再发起新尝试。',
            rate_limit_exceeded:'模型服务暂时限流，请稍后重试。',
            upstream_error:'模型服务暂时不可用或繁忙，请稍后检查服务状态。',
            upstream_unavailable:'模型连接中断或超时，结果尚未确认。请先查询原任务状态，勿重复发送。',
          }
          const fallback = response.status === 503 ? '模型服务暂时不可用，请稍后重试；若持续发生，请联系管理员查看服务状态。'
            : [502,504].includes(response.status) ? '上游连接异常或超时，结果尚未确认。请先查询原任务状态，勿重复发送。'
            : [401,403].includes(response.status) ? '身份验证或访问权限异常，请检查登录状态及模型权限。'
            : '请求未完成，请检查任务内容或联系管理员查看错误详情。'
          code = typeof code === 'string' && Object.hasOwn(hints, code) ? code : undefined
          throw Object.assign(Error(`${cloud ? 'Stable Cloud' : 'OpenAI'} 请求失败（HTTP ${response.status}）。${hints[code] || fallback}`), {code,status:response.status,requestRejected:true,providerRejected:true,permanentProviderFailure:[400,401,402,403,404].includes(response.status)||['insufficient_quota','model_not_configured','upstream_insufficient_balance','upstream_authentication_failed','upstream_model_not_found','upstream_invalid_request'].includes(code)})
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
