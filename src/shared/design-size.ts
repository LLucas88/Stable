import type { DesignRequest } from '../types'
import presets from '../../desktop/services/design-presets.json'
export const DESIGN_PRESETS = presets
export function businessDesign(value: DesignRequest, outputPreset: keyof typeof presets): DesignRequest {
  const preset = presets[outputPreset]
  const limit = value.model === 'glm-image' ? 4 : 3
  const ratio = Math.max(1 / limit, Math.min(limit, preset.width / preset.height))
  const longSide = Math.min(2048, Math.max(value.resolution === '2k' ? 2048 : 1280, 512 * Math.max(ratio, 1 / ratio)))
  const width = snap(ratio >= 1 ? longSide : longSide * ratio), height = snap(ratio >= 1 ? longSide / ratio : longSide)
  const next = resizeDesign({ ...value, ratio: 'custom', width, height, aspectLocked: false }, 'width', width)
  return { ...next, outputPreset, aspectLocked: value.aspectLocked !== false }
}

export const DESIGN_SIZES = {
  '1:1': [[1280, 1280], [2048, 2048]],
  '4:3': [[1280, 960], [2048, 1536]],
  '3:4': [[960, 1280], [1536, 2048]],
  '16:9': [[1536, 864], [2048, 1152]],
  '9:16': [[864, 1536], [1152, 2048]],
} as const
export type DesignRatio = keyof typeof DESIGN_SIZES

export function designDimensions(value: DesignRequest): [number, number] {
  if (value.width && value.height) return [value.width, value.height]
  const preset = DESIGN_SIZES[value.ratio === 'custom' ? '1:1' : value.ratio]
  return [...preset[value.resolution === '2k' ? 1 : 0]]
}

export function presetDesign(value: DesignRequest, ratio: DesignRatio, resolution = value.resolution): DesignRequest {
  const [width, height] = DESIGN_SIZES[ratio][resolution === '2k' ? 1 : 0]
  return { ...value, outputPreset: undefined, ratio, resolution, width, height }
}

const snap = (value: number) => Math.min(2048, Math.max(512, Math.round(value / 32) * 32))
export function resizeDesign(value: DesignRequest, axis: 'width' | 'height', raw: number): DesignRequest {
  let [width, height] = designDimensions(value)
  if (!Number.isFinite(raw)) return value
  if (value.aspectLocked === false) {
    if (axis === 'width') width = snap(raw)
    else height = snap(raw)
  } else {
    const ratio = width / height
    if (axis === 'width') {
      width = snap(Math.min(Math.min(2048, 2048 * ratio), Math.max(Math.max(512, 512 * ratio), raw)))
      height = snap(width / ratio)
    } else {
      height = snap(Math.min(Math.min(2048, 2048 / ratio), Math.max(Math.max(512, 512 / ratio), raw)))
      width = snap(height * ratio)
    }
  }
  if (value.model !== 'glm-image') {
    if(width>height*3)height=snap(Math.ceil(width/3/32)*32)
    if(height>width*3)width=snap(Math.ceil(height/3/32)*32)
    while(width*height<655360) {if(width<=height)width+=32;else height+=32}
  }
  return { ...value, outputPreset: undefined, ratio: 'custom', width, height }
}
