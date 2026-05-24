import { outputDimensions } from '@/app/lib/campaigns/image-step/parse'
import type { ImageAspectMode } from '@/app/lib/campaigns/image-step/types'

export type PreviewCanvasLayout = {
  aspectRatio: string
  imageObjectFit: 'cover' | 'contain'
  description: string
}

export function previewCanvasLayout(
  aspectMode: ImageAspectMode,
  canvasWidth: number,
  canvasHeight: number
): PreviewCanvasLayout {
  const w = Math.max(1, canvasWidth)
  const h = Math.max(1, canvasHeight)

  if (aspectMode === 'square') {
    return {
      aspectRatio: '1 / 1',
      imageObjectFit: 'cover',
      description: '1:1 square · background cropped to fill',
    }
  }

  const { width, height } = outputDimensions(aspectMode, w, h)
  const ratio = `${width} / ${height}`

  if (aspectMode === 'fit') {
    return {
      aspectRatio: ratio,
      imageObjectFit: 'contain',
      description: `Fit · up to ${width}×${height}px · full image visible`,
    }
  }

  return {
    aspectRatio: ratio,
    imageObjectFit: 'contain',
    description: `Original · ${width}×${height}px · natural proportions`,
  }
}
