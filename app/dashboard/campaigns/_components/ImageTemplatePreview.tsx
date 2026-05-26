'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageTextLayersCanvas } from '@/app/dashboard/campaigns/_components/ImageTextLayersCanvas'
import {
  previewCanvasLayout,
  resolvePreviewCanvasDimensions,
} from '@/app/lib/campaigns/image-step/preview-canvas'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

type Props = {
  parameters: ImageStepParameters
  backgroundUrl: string | null
  /** Max width of the design surface in px (height follows send aspect ratio). */
  maxWidthPx?: number
  className?: string
  emptyLabel?: string
}

const noop = () => {}

/**
 * Mini canvas — reuses the editor layer renderer so campaign detail / inspector match the dialog.
 */
export function ImageTemplatePreview({
  parameters,
  backgroundUrl,
  maxWidthPx = 320,
  className = '',
  emptyLabel = 'No background yet',
}: Props) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setNaturalSize(null)
  }, [backgroundUrl, parameters.background_path])

  const onBackgroundLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [])

  const aspectMode = parameters.aspect_mode ?? 'square'
  const designDims = useMemo(
    () => resolvePreviewCanvasDimensions(parameters, naturalSize),
    [parameters, naturalSize]
  )

  const layout = useMemo(
    () => previewCanvasLayout(aspectMode, designDims.width, designDims.height),
    [aspectMode, designDims.width, designDims.height]
  )

  const layers = parameters.layers ?? []

  return (
    <div className={className} style={{ width: '100%', maxWidth: maxWidthPx }}>
      <ImageTextLayersCanvas
        readOnly
        layers={layers}
        selectedLayerId={null}
        onSelectLayer={noop}
        onUpdateLayer={noop}
        onDuplicateLayer={noop}
        onRemoveLayer={noop}
        className="relative mx-auto w-full overflow-hidden bg-slate-950"
        style={{
          aspectRatio: layout.aspectRatio,
          maxHeight: 'min(52vh, 560px)',
        }}
      >
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ objectFit: layout.imageObjectFit }}
            draggable={false}
            onLoad={onBackgroundLoad}
          />
        ) : (
          <div className="absolute inset-0 flex min-h-[120px] items-center justify-center bg-slate-800 px-4 text-center text-sm text-slate-400">
            {emptyLabel}
          </div>
        )}
      </ImageTextLayersCanvas>
    </div>
  )
}
