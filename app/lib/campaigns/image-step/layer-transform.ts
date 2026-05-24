import type { ImageTextLayer } from '@/app/lib/campaigns/image-step/types'

export const LAYER_SCALE_MIN = 0.25
export const LAYER_SCALE_MAX = 4

export function clampLayerScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(LAYER_SCALE_MAX, Math.max(LAYER_SCALE_MIN, scale))
}

export function clampRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Rotate + flip + scale for the layer box (positioning uses translate on parent). */
export function layerBoxTransformCss(layer: ImageTextLayer): string {
  const rot = layer.rotation ?? 0
  const scale = clampLayerScale(layer.scale ?? 1)
  const sx = scale * (layer.flip_x ? -1 : 1)
  const sy = scale * (layer.flip_y ? -1 : 1)
  return `rotate(${rot}deg) scale(${sx}, ${sy})`
}

/** Effective font size after canvas scale. */
export function layerEffectiveFontSize(layer: ImageTextLayer): number {
  return Math.max(8, Math.round(layer.font_size * clampLayerScale(layer.scale ?? 1)))
}
