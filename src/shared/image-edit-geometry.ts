import type { EditPoint, EditStroke, EditResize } from '../image-editor-types'
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export function imagePoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): EditPoint {
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) }
}
export function strokeHit(stroke: EditStroke, point: EditPoint, width: number, height: number, radius: number) {
  const p = { x: point.x * width, y: point.y * height }
  return stroke.points.some((b, i) => {
    const a = stroke.points[Math.max(0, i - 1)], ax = a.x * width, ay = a.y * height
    const dx = b.x * width - ax, dy = b.y * height - ay
    const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1))
    return Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy) <= radius + stroke.width * Math.min(width, height) / 2
  })
}
export function cropRect(resize: EditResize, width: number, height: number) {
  return { x: Math.round((width - resize.width) * resize.x), y: Math.round((height - resize.height) * resize.y), width: resize.width, height: resize.height }
}
