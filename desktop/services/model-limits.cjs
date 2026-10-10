'use strict'

// Verified 2026-09-28: https://api-docs.deepseek.com/quick_start/pricing/
// Only official direct routes inherit vendor limits; similarly named proxies do not.
function modelLimits(model = {}) {
  let officialFlash = false
  try {
    const url = new URL(model.baseURL)
    officialFlash = url.protocol === 'https:' && url.hostname === 'api.deepseek.com'
      && ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(model.model)
  } catch {}
  const valid = value => Number.isSafeInteger(value) && value >= 1024 && value <= 10_000_000
  const contextWindow = valid(model.contextWindow) ? model.contextWindow : officialFlash ? 1_000_000 : 128_000
  const outputLimit = valid(model.maxOutputTokens) ? model.maxOutputTokens : officialFlash ? 384_000 : 8192
  const outputTokens = Math.min(outputLimit, officialFlash ? 32_768 : 8192, Math.floor(contextWindow / 4))
  const autoCompactTokenLimit = Math.min(Math.floor(contextWindow * 0.8), contextWindow - outputTokens - Math.min(8192, Math.floor(contextWindow * 0.1)), contextWindow === 128_000 ? 90_000 : Infinity)
  return { contextWindow, outputLimit, outputTokens, autoCompactTokenLimit }
}
module.exports = { modelLimits }
