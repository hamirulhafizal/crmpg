import { renderCampaignTemplateForCustomer } from '@/app/lib/campaigns/template'
import { resolveDealerImageVariable } from '@/app/lib/campaigns/image-step/dealer-context'
import type { DealerImageContext, ImageTextLayer } from '@/app/lib/campaigns/image-step/types'

function layerToken(variable: string): string {
  const v = variable.replace(/[{}]/g, '').trim()
  return `{${v}}`
}

export function isStaticLayer(layer: ImageTextLayer): boolean {
  return layer.layer_kind === 'static'
}

export function isDealerLayer(layer: ImageTextLayer): boolean {
  return layer.layer_kind === 'dealer'
}

export function isCustomerVariableLayer(layer: ImageTextLayer): boolean {
  return !isStaticLayer(layer) && !isDealerLayer(layer)
}

/** Text shown on the editor canvas (placeholders for variables). */
export function layerPreviewText(
  layer: ImageTextLayer,
  dealerPreview?: DealerImageContext | null
): string {
  if (isStaticLayer(layer)) {
    const t = layer.static_text?.trim()
    return t || 'Your text'
  }
  if (isDealerLayer(layer)) {
    const resolved = resolveDealerImageVariable(layer.variable, dealerPreview)?.trim()
    if (resolved) return resolved
    return `{${layer.variable}}`
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
  customer: Record<string, unknown>,
  dealer?: DealerImageContext | null
): string {
  if (isStaticLayer(layer)) {
    return layer.static_text ?? ''
  }
  if (isDealerLayer(layer)) {
    return resolveDealerImageVariable(layer.variable, dealer)
  }
  return renderCampaignTemplateForCustomer(layerToken(layer.variable), customer)
}
