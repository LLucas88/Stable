'use strict'

// The SDK alias selects protocol/context capabilities; it is not the model
// serving this request. Match only complete SDK-owned identity blocks, never
// replace model names in user prose, tool results, or prior assistant answers.
const SDK_AGENT = 'You are a Claude agent, built on Anthropic\'s Claude Agent SDK.'
const SDK_IDENTITY = /^<system-reminder>\s*You are powered by the model named [^\r\n]+\. The exact model ID is claude-[\w.\[\]-]+\.(?: Assistant knowledge cutoff is [^\r\n]+\.)?\s*<\/system-reminder>$/

function modelIdentity(model) {
  return 'Stable 当前实际模型配置：' + JSON.stringify({ name: model.displayName || model.model, modelId: model.model })
    + '。回答模型身份时以此配置为准；Claude Agent SDK 是执行框架，其内部 Claude/Sonnet 标识不代表当前模型。不要根据 SDK 推断模型厂商、版本或知识截止日期；配置未提供的信息应说明未知。简单问候、身份或能力问题简短直接回答。'
}

function withModelIdentity(input, model) {
  const identity = modelIdentity(model)
  const system = typeof input.system === 'string' ? [{ type: 'text', text: input.system }] : input.system || []
  return {
    ...input,
    system: [...system.map(block => block.type === 'text' && block.text.trim() === SDK_AGENT
      ? { ...block, text: '你是 Stable 桌面客户端中的助手。' } : block), { type: 'text', text: identity }],
    messages: input.messages?.map(message => message.role === 'user' && Array.isArray(message.content)
      ? { ...message, content: message.content.map(block => block.type === 'text' && SDK_IDENTITY.test(block.text.trim())
        ? { ...block, text: `<system-reminder>\n${identity}\n</system-reminder>` } : block) } : message),
  }
}

module.exports = { withModelIdentity }
