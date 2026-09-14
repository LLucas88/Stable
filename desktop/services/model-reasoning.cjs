'use strict'

// Match the API endpoint AND model ID, never a user-editable display name.
// https://api-docs.deepseek.com/guides/thinking_mode/
// https://docs.bigmodel.cn/cn/guide/capabilities/thinking
// https://huggingface.co/zai-org/GLM-5.3-Flash (model-specific effort levels)
const LABELS = { auto:'默认', none:'关闭思考', enabled:'开启思考', low:'低', high:'高', max:'最高' }
function reasoningValues(model = {}) {
  if (process.env.STABLE_HARNESS === 'deepseek') return [] // Legacy runner has no verified parameter transport.
  if (model.cloudReasoning === true && model.providerId === 'stable-cloud' && /^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(model.baseURL || '') && ['glm-5.3-flash','deepseek-flash','deepseek-v4-flash','deepseek-v4-pro'].includes(model.model)) return ['low','high','max']
  let host
  try { host = new URL(model.baseURL).hostname } catch { return [] }
  const id = String(model.model || '').toLowerCase()
  if (host === 'api.deepseek.com' && /^deepseek-(?:flash|v4-(?:flash|pro)(?:-vision-exp)?)$/.test(id)) return ['none','low','high','max']
  if (['open.bigmodel.cn','api.z.ai'].includes(host)) {
    if (id === 'glm-5.3-flash') return ['low','high','max']
    if (id === 'glm-5.2') return ['none','high','max'] // aliases collapse to their actual official levels
    if (/^glm-(5(\.1)?(-turbo)?|5v-turbo|4\.[567](-flash|-air|-airx|v)?)$/.test(id)) return ['none','enabled']
  }
  return []
}
function reasoningOptions(model) {
  const values = reasoningValues(model)
  return values.length ? ['auto',...values].map(id=>({id,label:LABELS[id]})) : []
}
function normalizeReasoning(model, value) {
  return reasoningValues(model).includes(value) ? value : 'auto'
}
function reasoningParameters(model, value = model?.reasoningSelection) {
  const selected = normalizeReasoning(model, value)
  if (selected === 'auto') return {}
  if (selected === 'none') return { thinking:{type:'disabled'} }
  if (selected === 'enabled') return { thinking:{type:'enabled'} }
  if (model.cloudReasoning === true) return { reasoning_effort:selected }
  return { thinking:{type:'enabled'}, reasoning_effort:selected }
}
function cloudReasoningProfile(item) {
  const id = String(item.id || '').toLowerCase()
  const provider = String(item.provider || '').toLowerCase()
  return { cloudReasoning: (id === 'glm-5.3-flash' && ['zhipu','zai','z.ai','glm','bigmodel'].includes(provider)) || (/^deepseek-(?:flash|v4-(?:flash|pro))$/.test(id) && provider === 'deepseek') }
}
module.exports = { cloudReasoningProfile, reasoningOptions, normalizeReasoning, reasoningParameters }
