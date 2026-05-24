import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import type { ImageTextLayer } from '@/app/lib/campaigns/image-step/types'

function layerToken(variable: string): string {
  const v = variable.replace(/[{}]/g, '').trim()
  return `{${v}}`
}

export function isStaticLayer(layer: ImageTextLayer): boolean {
  return layer.layer_kind === 'static'
}

/** Text shown on the editor canvas (placeholders for variables). */
export function layerPreviewText(layer: ImageTextLayer): string {
  if (isStaticLayer(layer)) {
    const t = layer.static_text?.trim()
    return t || 'Your text'
  }
  return `{${layer.variable}}`
}

/** Short label for layer list. */
export function layerListLabel(layer: ImageTextLayer): string {
  if (isStaticLayer(layer)) {
    const t = layer.static_text?.trim()
    if (!t) return 'Fixed text'
    return t.length > 24 ? `${t.slice(0, 24)}…` : t
  }
  return `{${layer.variable}}`
}

/** Final text when sending / rendering PNG. */
export function resolveLayerText(
  layer: ImageTextLayer,
  customer: Record<string, unknown>
): string {
  if (isStaticLayer(layer)) {
    return layer.static_text ?? ''
  }
  return renderCampaignTemplateForCustomer(layerToken(layer.variable), customer)
}
