import type { ModelProfile } from './types'

// Official Chat Completions presets are available before any key is saved.
// GLM uses the standard BigModel API, not the separate Coding Plan endpoint.
export const MODEL_PRESETS: ModelProfile[] = [
  { id: 'direct-deepseek-flash', providerId: 'deepseek', displayName: 'DeepSeek-V4.1-Flash-1017', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', hasApiKey: false },
  { id: 'direct-zhipu-glm-5-3-flash', providerId: 'zhipu', displayName: '智谱 GLM-5.3-Flash', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash', hasApiKey: false },
]

export function modelConnectionChoices(saved: ModelProfile[]): ModelProfile[] {
  const presets = MODEL_PRESETS.map(preset => saved.find(item => item.providerId === preset.providerId && item.model === preset.model && item.baseURL.replace(/\/+$/, '') === preset.baseURL) || preset)
  return [...presets, ...saved.filter(item => !presets.some(preset => preset.id === item.id))]
}
