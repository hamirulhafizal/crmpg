import { clampLayerScale, clampRotation } from '@/app/lib/campaigns/image-step/layer-transform'
import type {
  ImageAspectMode,
  ImageLayerKind,
  ImageStepParameters,
  ImageTextAlign,
  ImageTextLayer,
} from '@/app/lib/campaigns/image-step/types'

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function parseAlign(v: unknown): ImageTextAlign {
  if (v === 'left' || v === 'center' || v === 'right') return v
  return 'center'
}

function parseLayer(raw: unknown, index: number, seenIds: Set<string>): ImageTextLayer | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const layer_kind: ImageLayerKind = o.layer_kind === 'static' ? 'static' : 'variable'
  const variable = String(o.variable ?? 'SenderName').replace(/[{}]/g, '').trim() || 'SenderName'
  let id = String(o.id ?? '').trim()
  if (!id || seenIds.has(id)) {
    id = `layer-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`
  }
  seenIds.add(id)
  return {
    id,
    layer_kind,
    variable,
    static_text: layer_kind === 'static' ? String(o.static_text ?? '') : undefined,
    x: clampPct(Number(o.x ?? 50)),
    y: clampPct(Number(o.y ?? 50)),
    rotation: clampRotation(Number(o.rotation ?? 0)),
    scale: clampLayerScale(Number(o.scale ?? 1)),
    flip_x: o.flip_x === true,
    flip_y: o.flip_y === true,
    font_family: String(o.font_family ?? 'Arial, sans-serif'),
    font_size: Math.max(8, Math.min(200, Number(o.font_size ?? 48))),
    color: String(o.color ?? '#ffffff'),
    align: parseAlign(o.align),
    font_weight: Number(o.font_weight ?? 700),
    text_background_color: String(o.text_background_color ?? '#000000'),
    text_background_opacity: Math.min(100, Math.max(0, Number(o.text_background_opacity ?? 0))),
  }
}

export function parseAspectMode(v: unknown): ImageAspectMode {
  if (v === 'fit' || v === 'original' || v === 'square') return v
  return 'square'
}

export function parseImageStepParameters(params: Record<string, unknown> | null | undefined): ImageStepParameters {
  const p = params ?? {}
  const layersRaw = Array.isArray(p.layers) ? p.layers : []
  const seenIds = new Set<string>()
  const layers = layersRaw
    .map((raw, i) => parseLayer(raw, i, seenIds))
    .filter((l): l is ImageTextLayer => l != null)

  return {
    step_order: Math.max(1, Number(p.step_order ?? 1)),
    delay_days: Math.max(0, Number(p.delay_days ?? 0)),
    send_time: p.send_time != null ? String(p.send_time) : '10:00',
    is_active: p.is_active !== false,
    enable_typing: p.enable_typing !== false,
    randomize_spaces: p.randomize_spaces === true,
    caption_template: String(p.caption_template ?? ''),
    background_path: String(p.background_path ?? ''),
    background_mimetype: String(p.background_mimetype ?? 'image/png'),
    canvas_width: Math.max(1, Number(p.canvas_width ?? 1080)),
    canvas_height: Math.max(1, Number(p.canvas_height ?? 1080)),
    aspect_mode: parseAspectMode(p.aspect_mode),
    layers,
  }
}

export function outputDimensions(
  aspectMode: ImageAspectMode,
  naturalW: number,
  naturalH: number
): { width: number; height: number } {
  const w = Math.max(1, naturalW)
  const h = Math.max(1, naturalH)
  if (aspectMode === 'square') {
    return { width: 1080, height: 1080 }
  }
  if (aspectMode === 'fit') {
    const maxSide = 1080
    const scale = Math.min(maxSide / w, maxSide / h, 1)
    return {
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    }
  }
  const maxSide = 2048
  const scale = Math.min(1, maxSide / Math.max(w, h))
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}
