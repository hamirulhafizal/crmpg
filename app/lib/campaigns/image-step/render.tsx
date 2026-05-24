import { ImageResponse } from 'next/og'
import { resolveLayerText } from '@/app/lib/campaigns/image-step/layer-text'
import { layerBoxTransformCss, layerEffectiveFontSize } from '@/app/lib/campaigns/image-step/layer-transform'
import { layerTextBackgroundRgba } from '@/app/lib/campaigns/image-step/layer-style'
import { outputDimensions, parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

function alignToFlex(align: string): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'left') return 'flex-start'
  if (align === 'right') return 'flex-end'
  return 'center'
}

export async function renderCampaignImagePng(
  params: ImageStepParameters,
  backgroundBuffer: Buffer,
  customer: Record<string, unknown>
): Promise<Buffer> {
  const parsed = parseImageStepParameters(params as Record<string, unknown>)
  if (!parsed.background_path?.trim()) {
    throw new Error('Upload a background image before sending')
  }

  const mimetype = parsed.background_mimetype ?? 'image/png'
  const dataUrl = `data:${mimetype};base64,${backgroundBuffer.toString('base64')}`
  const designW = Math.max(1, parsed.canvas_width ?? 1080)
  const designH = Math.max(1, parsed.canvas_height ?? 1080)
  const { width, height } = outputDimensions(parsed.aspect_mode ?? 'square', designW, designH)

  const objectFit =
    parsed.aspect_mode === 'original' ? 'contain' : parsed.aspect_mode === 'fit' ? 'contain' : 'cover'

  const layers = parsed.layers ?? []

  const response = new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: 'flex',
          position: 'relative',
          backgroundColor: '#111827',
        }}
      >
        <img
          src={dataUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
          }}
        />
        {layers.map((layer) => {
          const text = resolveLayerText(layer, customer)
          const left = (layer.x / 100) * width
          const top = (layer.y / 100) * height
          const textBg = layerTextBackgroundRgba(layer)
          const fontSize = layerEffectiveFontSize(layer)
          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left,
                top,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                maxWidth: width * 0.92,
                justifyContent: alignToFlex(layer.align),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  transform: layerBoxTransformCss(layer),
                  transformOrigin: 'center center',
                }}
              >
              <div
                style={{
                  display: 'flex',
                  color: layer.color,
                  fontFamily: layer.font_family,
                  fontSize,
                  fontWeight: layer.font_weight ?? 700,
                  textAlign: layer.align,
                  lineHeight: 1.15,
                  textShadow: textBg ? undefined : '0 2px 8px rgba(0,0,0,0.55)',
                  whiteSpace: 'pre-wrap',
                  ...(textBg
                    ? {
                        backgroundColor: textBg,
                        padding: '0.35em 0.65em',
                        borderRadius: Math.round(fontSize * 0.12),
                      }
                    : {}),
                }}
              >
                {text}
              </div>
              </div>
            </div>
          )
        })}
      </div>
    ),
    { width, height }
  )

  const ab = await response.arrayBuffer()
  return Buffer.from(ab)
}
