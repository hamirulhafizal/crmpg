import { outputDimensions } from '@/app/lib/campaigns/image-step/parse'
import type { ImageAspectMode, ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

/** Design canvas size for preview — prefer stored upload dims, fall back to loaded image. */
export function resolvePreviewCanvasDimensions(
  parameters: Pick<ImageStepParameters, 'canvas_width' | 'canvas_height'>,
  natural?: { width: number; height: number } | null
): { width: number; height: number } {
  const storedW = Math.max(1, parameters.canvas_width ?? 1080)
  const storedH = Math.max(1, parameters.canvas_height ?? 1080)
  if (!natural?.width || !natural?.height) {
    return { width: storedW, height: storedH }
  }
  const nw = Math.max(1, natural.width)
  const nh = Math.max(1, natural.height)
  const storedIsDefaultSquare = storedW === 1080 && storedH === 1080
  const naturalNotSquare = Math.abs(nw / nh - 1) > 0.02
  if (storedIsDefaultSquare && naturalNotSquare) {
    return { width: nw, height: nh }
  }
  const storedRatio = storedW / storedH
  const naturalRatio = nw / nh
  if (Math.abs(storedRatio - naturalRatio) / naturalRatio > 0.12) {
    return { width: nw, height: nh }
  }
  return { width: storedW, height: storedH }
}

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

export type PreviewDesignMetrics = {
  layout: PreviewCanvasLayout
  outputWidth: number
  outputHeight: number
  /** CSS aspect-ratio value */
  aspectRatio: string
  /** Scale editor font sizes for this preview size */
  fontScale: number
  imageObjectFit: 'cover' | 'contain'
  displayWidth: number
  paddingBottomPct: number
}

/**
 * Size the preview surface like the send canvas (output dimensions), not a stretched wide box.
 * Layers use % of this box — same coordinate space as the workflow editor and PNG render.
 */
export function previewDesignMetrics(
  aspectMode: ImageAspectMode,
  canvasWidth: number,
  canvasHeight: number,
  maxPreviewWidthPx: number
): PreviewDesignMetrics {
  const layout = previewCanvasLayout(aspectMode, canvasWidth, canvasHeight)
  const { width: outputWidth, height: outputHeight } = outputDimensions(
    aspectMode,
    canvasWidth,
    canvasHeight
  )
  const displayWidth = Math.max(120, Math.min(maxPreviewWidthPx, outputWidth))
  /** Match workflow editor (~450px-wide canvas uses scale 0.42). */
  const referenceDisplayWidth = 450
  const fontScale = Math.min(0.45, Math.max(0.08, 0.42 * (displayWidth / referenceDisplayWidth)))
  return {
    layout,
    outputWidth,
    outputHeight,
    aspectRatio: layout.aspectRatio,
    fontScale,
    imageObjectFit: layout.imageObjectFit,
    displayWidth,
    paddingBottomPct: (outputHeight / outputWidth) * 100,
  }
}
