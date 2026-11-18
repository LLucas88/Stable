'use strict'
const PRESETS = require('./design-presets.json')
function deliverySpec(policy) {
  if (!policy) return null
  if(policy.size==='auto'&&!policy.outputPreset)return {version:1,autoSize:true,maxBytes:20*1024*1024,background:policy.background||'auto',fit:'strict'}
  const preset = policy.outputPreset && PRESETS[policy.outputPreset]
  if (policy.outputPreset && !Object.hasOwn(PRESETS, policy.outputPreset)) throw Error('图片交付规格无效。')
  const [width, height] = String(policy.size || '').split('x').map(Number)
  if (!preset && (!width || !height)) throw Error('图片交付尺寸无效。')
  return { version: 1, width: preset?.width || width, height: preset?.height || height, maxBytes: preset ? preset.maxMB * 1_000_000 : 20 * 1024 * 1024, background: policy.background || 'opaque', fit: policy.fit || 'strict' }
}
function inspectDesignImage(image, spec, bytes) {
  const size = image.getSize()
  if (image.isEmpty() || !size.width || !size.height || (!spec.autoSize && (size.width !== spec.width || size.height !== spec.height))) throw Error('交付图片实际尺寸与目标不一致。')
  if (!bytes?.length || bytes.length >= spec.maxBytes) throw Error('交付图片文件大小超过规格上限。')
  if (spec.background === 'transparent') {
    const pixels = image.toBitmap({ scaleFactor: 1 })
    let transparent = false
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) { transparent = true; break }
    if (!transparent) throw Error('交付图片没有实际透明像素，未满足透明背景要求。')
  }
  return { ...size, bytes: bytes.length }
}
function finishDesignImage(image, nativeImage, policy, background) {
  const spec = typeof policy === 'string' ? deliverySpec({ outputPreset: policy, background }) : deliverySpec(policy)
  const size = image.getSize()
  if (!size.width || !size.height || image.isEmpty()) throw Error('生成图片无法解码。')
  if(spec.autoSize){const png=image.toPNG();inspectDesignImage(image,spec,png);return {png,dimensions:size,spec}}
  const scale = Math.min(spec.width / size.width, spec.height / size.height)
  const width = Math.max(1, Math.round(size.width * scale)), height = Math.max(1, Math.round(size.height * scale))
  let output
  if (width === spec.width && height === spec.height) output = image.resize({ width, height, quality: 'best' })
  else if (spec.fit === 'contain') {
    const fitted = image.resize({ width, height, quality: 'best' }), pixels = fitted.toBitmap({ scaleFactor: 1 })
    const canvas = Buffer.alloc(spec.width * spec.height * 4, spec.background === 'transparent' ? 0 : 255)
    const left = Math.floor((spec.width - width) / 2), top = Math.floor((spec.height - height) / 2)
    for (let y = 0; y < height; y++) pixels.copy(canvas, ((top + y) * spec.width + left) * 4, y * width * 4, (y + 1) * width * 4)
    output = nativeImage.createFromBitmap(canvas, { width: spec.width, height: spec.height, scaleFactor: 1 })
  } else if (spec.fit === 'cover') {
    const cover = Math.max(spec.width / size.width, spec.height / size.height)
    const w = Math.max(spec.width, Math.round(size.width * cover)), h = Math.max(spec.height, Math.round(size.height * cover))
    output = image.resize({ width: w, height: h, quality: 'best' }).crop({ x: Math.floor((w - spec.width) / 2), y: Math.floor((h - spec.height) / 2), width: spec.width, height: spec.height })
  } else throw Object.assign(Error('图片比例与交付画布不一致；原图已保留。请预览后在尺寸面板明确选择允许留边或居中裁切，或另行确认重新构图/扩图。不会自动裁切、拉伸或重复生图。'), { code: 'DESIGN_FIT_REQUIRED' })
  const png = output.toPNG()
  inspectDesignImage(nativeImage.createFromBuffer(png), spec, png)
  return { png, dimensions: { width: spec.width, height: spec.height }, spec }
}
module.exports = { finishDesignImage, deliverySpec, inspectDesignImage }
