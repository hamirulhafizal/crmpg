import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type { ImageStepParameters, ImageTextLayer } from '@/app/lib/campaigns/image-step/types'
import { patchNodeParametersInDraft } from '@/app/lib/workflows/graph-mutate'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'

function dedupeLayers(layers: ImageTextLayer[]): ImageTextLayer[] {
  const seen = new Set<string>()
  const out: ImageTextLayer[] = []
  for (const l of layers) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    out.push(l)
  }
  return out
}

/** Fast path: update layers on the canvas node only (no full draft recompile). */
export function patchImageLayersInDraft(
  draft: WorkflowEditorDraft,
  nodeId: string,
  layers: ImageTextLayer[]
): WorkflowEditorDraft {
  const def = draft.definition
  if (!def) return draft
  const nextLayers = dedupeLayers(layers.map((l) => ({ ...l })))
  const nodes = def.nodes.map((n) => {
    if (n.id !== nodeId || n.type !== 'crm.whatsapp.send_image') return n
    return { ...n, parameters: { ...(n.parameters ?? {}), layers: nextLayers } }
  })
  return { ...draft, definition: { ...def, nodes } }
}

/** Patch image step node params and re-sync compiled draft fields (steps, etc.). */
export function patchImageStepInDraft(
  draft: WorkflowEditorDraft,
  nodeId: string,
  partial: Partial<ImageStepParameters>
): WorkflowEditorDraft {
  const keys = Object.keys(partial)
  if (keys.length === 1 && keys[0] === 'layers' && Array.isArray(partial.layers)) {
    return patchImageLayersInDraft(draft, nodeId, partial.layers as ImageTextLayer[])
  }

  const patched = patchNodeParametersInDraft(draft, nodeId, partial as Record<string, unknown>)
  return definitionToDraft(draftToDefinition(patched))
}
