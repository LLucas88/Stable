'use strict'

// Only the current user's unquoted instructions are parameters. Artwork copy,
// negations, questions and descriptions of old/reference images are not.
function parameterText(prompt) {
  return String(prompt || '').replace(/```[\s\S]*?```|“[^”]*”|「[^」]*」|"[^"\n]*"|`[^`]*`/g, '')
    .split(/[\n。；;，,！!]/).filter(part => !/[？?]|(?:不要|不用|不需要|并非|不是)|(?:原图|参考图|之前|此前|原来|上次|目前).*(?:尺寸|分辨率|\d\s*[x×:：])/.test(part)).join('\n')
}
function promptOverrides(prompt, base) {
  const text = parameterText(prompt), patch = {}
  const unique = (regexp, value = m => m[1]) => {
    const values = [...text.matchAll(regexp)].map(value)
    if (new Set(values.map(JSON.stringify)).size > 1) throw Error('本次提示词包含相互冲突的图片参数，请明确本次需要的值；尚未提交生图。')
    return values[0]
  }
  const model = unique(/\b(glm-image|gpt-image-2\.[56]-(?:sunburst|flare))\b/gi, m => m[1].toLowerCase())
  if (model) Object.assign(patch, { model, quality: model === 'glm-image' ? 'hd' : base.model === 'glm-image' ? 'medium' : base.quality })
  const count = unique(/(?:请)?(?:先|再|只|仅)?生成\s*([1-9一二两三四五六七八九]|\d{2,})\s*张/g, m => ({一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}[m[1]] || +m[1]))
  if (count !== undefined) patch.count = count
  const quality = unique(/(?:质量|quality)\s*[:：为是=]?\s*(xhigh|max|auto|medium|high|low|最高|超高|自动|中|高|低)/gi, m => ({最高:'max',超高:'xhigh',自动:'auto',中:'medium',高:'high',低:'low'}[m[1]] || m[1].toLowerCase()))
  if (quality) patch.quality = quality
  const background = unique(/不透明背景|透明背景|背景透明|背景不透明|background\s*[:=：]\s*(transparent|opaque|auto)/gi, m => m[1]?.toLowerCase() || (/不透明/.test(m[0]) ? 'opaque' : 'transparent'))
  if (background) patch.background = background
  const complexity = unique(/(?:构图复杂度|complexity)\s*[:：为是=]?\s*(medium|high|low|中|高|低)/gi, m => ({中:'medium',高:'high',低:'low'}[m[1]] || m[1].toLowerCase()))
  if (complexity) patch.complexity=complexity
  const format=unique(/(?:输出格式|格式|output_format)\s*[:：为是=]?\s*(png|jpe?g|webp|svg|gif)\b/gi,m=>m[1].toLowerCase().replace('jpg','jpeg'))
  if(format){patch.outputFormat=format;if(format!=='gif'){patch.frameCount=undefined;patch.frameDurationMs=undefined}}
  const frames=unique(/(?:帧数|frame_count)\s*[:：为是=]?\s*(\d+)/gi,m=>+m[1]);if(frames!==undefined)patch.frameCount=frames
  const duration=unique(/(?:每帧时长|frame_duration_ms)\s*[:：为是=]?\s*(\d+)/gi,m=>+m[1]);if(duration!==undefined)patch.frameDurationMs=duration
  const resolution = unique(/(?:分辨率\s*[:：为是=]?\s*)?(2\s*k)|(?:分辨率\s*[:：为是=]?\s*)(标准)/gi, m => m[1] ? '2k' : 'standard')
  if (resolution) patch.resolution = resolution
  const dimensions = unique(/(?<![\d.])(\d{3,5})\s*[xX×*]\s*(\d{3,5})(?![\d.])/g, m => [+m[1], +m[2]])
  const ratio = unique(/(?:比例|宽高比|画幅|长宽比)\s*(?:为|是|用|[:：=])?\s*(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)(?![\d.])|(?<![\d.:：])(1:1|4:3|3:4|16:9|9:16|9:19\.5)(?![\d.])/g, m => m[3] ? m[3].split(':').map(Number) : [+m[1], +m[2]])
  const orientation = unique(/竖版|竖屏|横版|横屏|正方形|方形/g, m => /竖/.test(m[0]) ? 'portrait' : /横/.test(m[0]) ? 'landscape' : 'square')
  if (dimensions) Object.assign(patch, { ratio: 'custom', width: dimensions[0], height: dimensions[1], outputPreset: undefined })
  else if (ratio || orientation) {
    const current = base.width / base.height
    const target = ratio ? ratio[0] / ratio[1] : orientation === 'square' ? 1 : orientation === 'portrait' ? (current < 1 ? current : 9/16) : (current > 1 ? current : 16/9)
    const model = patch.model || base.model, step = model === 'glm-image' ? 32 : 16
    if (!Number.isFinite(target) || target <= 0 || target > (model === 'glm-image' ? 4 : 3) || target < 1/(model === 'glm-image' ? 4 : 3)) throw Error('提示词要求的图片比例超出当前模型支持范围；尚未提交生图。')
    const long = (patch.resolution || base.resolution) === '2k' ? 2048 : 1536
    Object.assign(patch, { ratio: 'custom', width: Math.round((target >= 1 ? long : long * target)/step)*step, height: Math.round((target >= 1 ? long/target : long)/step)*step, outputPreset: undefined })
  } else if (resolution && base.ratio !== 'custom') Object.assign(patch, { width: undefined, height: undefined })
  return patch
}
function resolveDesignPrompt(value, prompt) {
  const { validateDesignRequest } = require('./design-request.cjs')
  const base = validateDesignRequest(value)
  if (!base) return undefined
  const patch = promptOverrides(prompt, base)
  const bindings = base.bindings === undefined ? undefined : {...base.bindings,
    ...(patch.quality !== undefined ? {quality:true} : {}), ...(patch.background !== undefined ? {background:true} : {}),
    ...(patch.count !== undefined ? {count:true} : {}), ...(['width','height','resolution'].some(key=>Object.hasOwn(patch,key)) ? {size:true} : {}),
  }
  return validateDesignRequest({ ...base, ...patch, ...(bindings ? {bindings} : {}) })
}
module.exports = { parameterText, promptOverrides, resolveDesignPrompt }
