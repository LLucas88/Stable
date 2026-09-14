import { Bot } from 'lucide-react'
import type { ModelProfile } from './types'
import deepseek from './assets/model-providers/deepseek.svg'
import zhipu from './assets/model-providers/zhipu.svg'
import openai from './assets/model-providers/openai.svg'
import anthropic from './assets/model-providers/anthropic.svg'
import google from './assets/model-providers/google.svg'

const providers = [
  { match: /\bdeepseek\b|深度求索/i, logo: deepseek },
  { match: /\b(?:glm|zhipu|bigmodel|zai|z\.ai)\b|智谱/i, logo: zhipu },
  { match: /\b(?:openai|gpt|chatgpt|o[134])\b/i, logo: openai },
  { match: /\b(?:anthropic|claude)\b/i, logo: anthropic },
  { match: /\b(?:google|gemini)\b/i, logo: google },
]

export function ModelProviderIcon({ model }: { model: Pick<ModelProfile, 'model' | 'displayName' | 'providerId'> }) {
  // Cloud and compatible API provider IDs can identify a gateway, not the model maker.
  const provider = [model.model, model.displayName, model.providerId]
    .map(value => providers.find(item => item.match.test(value.replace(/_/g, '-'))))
    .find(Boolean)

  return provider
    ? <span className="model-provider-icon" aria-hidden="true" style={{ maskImage: `url("${provider.logo}")`, WebkitMaskImage: `url("${provider.logo}")` }} />
    : <Bot className="model-provider-icon model-provider-icon-fallback" size={20} aria-hidden="true" />
}
