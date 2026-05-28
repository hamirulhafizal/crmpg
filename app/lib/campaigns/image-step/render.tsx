import { resolveLayerText } from '@/app/lib/campaigns/image-step/layer-text'
import { layerBoxTransformCss, layerEffectiveFontSize } from '@/app/lib/campaigns/image-step/layer-transform'
import { layerTextBackgroundRgba } from '@/app/lib/campaigns/image-step/layer-style'
import {
  coerceWorkflowImageBuffer,
  type WorkflowImageBufferInput,
} from '@/app/lib/campaigns/image-step/coerce-buffer'
import { outputDimensions, parseImageStepParameters } from '@/app/lib/campaigns/image-step/parse'
import type { ImageStepParameters } from '@/app/lib/campaigns/image-step/types'

function alignToFlex(align: string): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'left') return 'flex-start'
  if (align === 'right') return 'flex-end'
  return 'center'
}

type OgImageResponseCtor = new (
  element: React.ReactElement,
  options: { width: number; height: number }
) => Response

async function loadOgImageResponse(): Promise<OgImageResponseCtor> {
  const mod = await import('next/dist/compiled/@vercel/og/index.node.js')
  return mod.ImageResponse as OgImageResponseCtor
}

function backgroundDataUrl(buffer: Buffer, mimetype: string): string {
  const mime = mimetype.trim() || 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

export async function renderCampaignImagePng(
  params: ImageStepParameters,
  background: WorkflowImageBufferInput,
  customer: Record<string, unknown>
): Promise<Buffer> {
  const parsed = parseImageStepParameters(params as Record<string, unknown>)
  if (!parsed.background_path?.trim()) {
    throw new Error('Upload a background image before sending')
  }

  const bg = coerceWorkflowImageBuffer(background)
  const mimetype = (parsed.background_mimetype ?? 'image/png').trim() || 'image/png'
  const imgSrc = backgroundDataUrl(bg, mimetype)
  const designW = Math.max(1, parsed.canvas_width ?? 1080)
  const designH = Math.max(1, parsed.canvas_height ?? 1080)
  const { width, height } = outputDimensions(parsed.aspect_mode ?? 'square', designW, designH)

  const objectFit =
    parsed.aspect_mode === 'original' ? 'contain' : parsed.aspect_mode === 'fit' ? 'contain' : 'cover'

  const layers = parsed.layers ?? []
  const ImageResponse = await loadOgImageResponse()

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: 'flex',
          position: 'relative',
          backgroundColor: '#111827',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <img
          src={imgSrc}
          alt=""
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit,
          }}
        />
        {layers.map((layer) => {
          const text = String(resolveLayerText(layer, customer) ?? '')
          const left = Number.isFinite(layer.x) ? (layer.x / 100) * width : width / 2
          const top = Number.isFinite(layer.y) ? (layer.y / 100) * height : height / 2
          const textBg = layerTextBackgroundRgba(layer)
          const fontSize = layerEffectiveFontSize(layer)
          const safeFontSize = Number.isFinite(fontSize) ? fontSize : 48
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
                    color: layer.color ?? '#ffffff',
                    fontFamily: layer.font_family ?? 'Arial, sans-serif',
                    fontSize: safeFontSize,
                    fontWeight: layer.font_weight ?? 700,
                    textAlign: layer.align,
                    lineHeight: 1.15,
                    whiteSpace: 'pre-wrap',
                    ...(textBg
                      ? {
                          backgroundColor: textBg,
                          padding: '0.35em 0.65em',
                          borderRadius: Math.round(safeFontSize * 0.12),
                        }
                      : {
                          // Satori crashes if textShadow is explicitly undefined
                          textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                        }),
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

  const ab = await imageResponse.arrayBuffer()
  if (!ab?.byteLength) {
    throw new Error('Image renderer returned an empty PNG')
  }
  return Buffer.from(ab)
}
