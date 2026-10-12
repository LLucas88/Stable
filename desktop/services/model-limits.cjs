'use strict'

// Verified 2026-10-12. Only official endpoints inherit these model specifications.
// https://docs.bigmodel.cn/cn/guide/start/model-overview
// https://docs.z.ai/guides/llm/glm-4.5
// https://api-docs.deepseek.com/quick_start/pricing/
const GLM_WINDOWS = {
  'glm-4.5': 128_000, 'glm-4.5-air': 128_000,
  'glm-4.6': 200_000, 'glm-4.7': 200_000,
  'glm-5': 200_000, 'glm-5-turbo': 200_000, 'glm-5.1': 200_000,
  'glm-5.2': 1_000_000, 'glm-5.3': 1_000_000,
  'glm-5.3-flash': 1_000_000, 'glm-5.3-flashx': 1_000_000,
}
function modelLimits(model = {}) {
  let officialDeepSeek = false, glmWindow
  try {
    const url = new URL(model.baseURL)
    if (url.protocol === 'https:') {
      officialDeepSeek = url.hostname === 'api.deepseek.com'
        && ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro'].includes(model.model)
      if (['open.bigmodel.cn', 'api.z.ai'].includes(url.hostname)) glmWindow = GLM_WINDOWS[model.model]
    }
  } catch {}
  const valid = value => Number.isSafeInteger(value) && value >= 1024 && value <= 10_000_000
  const contextWindow = valid(model.contextWindow) ? model.contextWindow : glmWindow || (officialDeepSeek ? 1_000_000 : 128_000)
  const outputLimit = valid(model.maxOutputTokens) ? model.maxOutputTokens : officialDeepSeek ? 384_000 : glmWindow ? (glmWindow === 128_000 ? 96_000 : 128_000) : 8192
  // Keep existing per-request output budgets; capacity metadata is not a request to spend more.
  const outputTokens = Math.min(outputLimit, officialDeepSeek && model.model !== 'deepseek-v4-pro' ? 32_768 : 8192, Math.floor(contextWindow / 4))
  // SDK 2.1.296 silently ignores autoCompactWindow outside 100k..1M.
  // Leave genuinely smaller budgets below 100k so the runner can reject them, never round above the model's safe limit.
  const autoCompactTokenLimit = Math.min(1_000_000, Math.floor(contextWindow * 0.8), contextWindow - outputTokens - Math.min(8192, Math.floor(contextWindow * 0.1)))
  const sdkModel = contextWindow > 200_000 ? 'claude-sonnet-4-6[1m]' : 'claude-sonnet-4-6'
  return { contextWindow, outputLimit, outputTokens, autoCompactTokenLimit, sdkModel }
}
module.exports = { modelLimits }
