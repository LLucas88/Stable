import type { ModelProfile } from './types'

// DeepSeek's documented Chat Completions endpoint and current Flash model.
// Other providers can be added without changing the credential storage contract.
export const MODEL_PRESETS: ModelProfile[] = [
  { id: 'direct-deepseek-flash', providerId: 'deepseek', displayName: 'DeepSeek · Flash', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', hasApiKey: false },
]

export function modelConnectionChoices(saved: ModelProfile[]): ModelProfile[] {
  const presets = MODEL_PRESETS.map(preset => saved.find(item => item.providerId === preset.providerId && item.model === preset.model && item.baseURL.replace(/\/+$/, '') === preset.baseURL) || preset)
  return [...presets, ...saved.filter(item => !presets.some(preset => preset.id === item.id))]
}
