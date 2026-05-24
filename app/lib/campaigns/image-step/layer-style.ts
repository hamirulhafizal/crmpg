import type { CSSProperties } from 'react'
import type { ImageTextLayer } from '@/app/lib/campaigns/image-step/types'

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 3 && normalized.length !== 6) {
    return `rgba(0,0,0,${Math.min(1, Math.max(0, alpha))})`
  }
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r},${g},${b},${a})`
}

export function layerTextBackgroundRgba(layer: ImageTextLayer): string | null {
  const opacity = Math.min(100, Math.max(0, Number(layer.text_background_opacity ?? 0)))
  if (opacity <= 0) return null
  const color = String(layer.text_background_color ?? '#000000').trim() || '#000000'
  return hexToRgba(color, opacity / 100)
}

/** CSS styles for editor canvas preview. */
export function layerCanvasTextStyle(
  layer: ImageTextLayer,
  scale = 0.42
): CSSProperties {
  const bg = layerTextBackgroundRgba(layer)
  return {
    color: layer.color,
    fontFamily: layer.font_family,
    fontSize: `${Math.max(12, layer.font_size * scale)}px`,
    fontWeight: layer.font_weight ?? 700,
    textAlign: layer.align,
    textShadow: bg ? 'none' : '0 2px 10px rgba(0,0,0,0.65)',
    whiteSpace: 'pre-wrap',
    ...(bg
      ? {
          backgroundColor: bg,
          padding: '0.35em 0.65em',
          borderRadius: '0.25em',
        }
      : {}),
  }
}
