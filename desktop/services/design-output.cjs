'use strict'
const PRESETS = require('./design-presets.json')

// Exact delivery dimensions are independent of the provider's generation size.
function finishDesignImage(image, nativeImage, presetId, background) {
  if (!Object.hasOwn(PRESETS, presetId)) throw Error('图片交付规格无效。')
  const preset = PRESETS[presetId], size = image.getSize()
  if (!size.width || !size.height || image.isEmpty()) throw Error('生成图片无法解码。')
  const scale = Math.min(preset.width / size.width, preset.height / size.height)
  const width = Math.max(1, Math.min(preset.width, Math.round(size.width * scale)))
  const height = Math.max(1, Math.min(preset.height, Math.round(size.height * scale)))
  const fitted = image.resize({ width, height, quality: 'best' })
  const pixels = fitted.toBitmap({ scaleFactor: 1 })
  if (pixels.length !== width * height * 4) throw Error('图片缩放结果无效。')
  const canvas = Buffer.alloc(preset.width * preset.height * 4, background === 'transparent' ? 0 : 255)
  const left = Math.floor((preset.width - width) / 2), top = Math.floor((preset.height - height) / 2)
  for (let y = 0; y < height; y++) pixels.copy(canvas, ((top + y) * preset.width + left) * 4, y * width * 4, (y + 1) * width * 4)
  const png = nativeImage.createFromBitmap(canvas, { width: preset.width, height: preset.height, scaleFactor: 1 }).toPNG()
  // Decimal MB is conservative for services using either MB or MiB.
  if (!png.length || png.length >= preset.maxMB * 1_000_000) throw Error(`交付图片须小于 ${preset.maxMB} MB。`)
  return { png, dimensions: { width: preset.width, height: preset.height } }
}
module.exports = { finishDesignImage }
