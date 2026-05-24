'use client'

import { layerPreviewText } from '@/app/lib/campaigns/image-step/layer-text'
import { layerCanvasTextStyle } from '@/app/lib/campaigns/image-step/layer-style'
import { layerBoxTransformCss } from '@/app/lib/campaigns/image-step/layer-transform'
import { previewCanvasLayout } from '@/app/lib/campaigns/image-step/preview-canvas'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

type Props = {
  parameters: ImageStepParameters
  backgroundUrl: string | null
  /** Approximate preview height in px — used to scale fonts. */
  maxHeightPx?: number
  className?: string
  emptyLabel?: string
}

/** Mini canvas: background + text layers (matches editor / send layout). */
export function ImageTemplatePreview({
  parameters,
  backgroundUrl,
  maxHeightPx = 220,
  className = '',
  emptyLabel = 'No background yet',
}: Props) {
  const aspect = parameters.aspect_mode ?? 'square'
  const canvasW = parameters.canvas_width ?? 1080
  const canvasH = parameters.canvas_height ?? 1080
  const layout = previewCanvasLayout(aspect, canvasW, canvasH)
  const layers = parameters.layers ?? []
  const fontScale = Math.min(0.45, Math.max(0.1, (maxHeightPx / canvasH) * 0.92))
  const hasBackground = Boolean(parameters.background_path?.trim())

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-950 ${className}`}
      style={{
        aspectRatio: layout.aspectRatio,
        maxHeight: maxHeightPx,
      }}
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 h-full w-full pointer-events-none"
          style={{ objectFit: layout.imageObjectFit }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 px-4 text-center text-sm text-slate-400">
          {emptyLabel}
        </div>
      )}
      {hasBackground
        ? layers.map((layer) => (
            <div
              key={layer.id}
              className="pointer-events-none absolute max-w-[92%]"
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  transform: layerBoxTransformCss(layer),
                  transformOrigin: 'center center',
                }}
              >
                <div style={layerCanvasTextStyle(layer, fontScale)}>{layerPreviewText(layer)}</div>
              </div>
            </div>
          ))
        : null}
    </div>
  )
}
