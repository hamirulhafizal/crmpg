import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export type WorkflowMediaExportAsset = {
  /** Storage path in the exporter's bucket (used to remap on import). */
  source_path: string
  /** Workflow node id — used for the importer's storage path. */
  node_id: string
  mimetype: string
  data_base64: string
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

export function collectImageStepMediaRefs(
  def: WorkflowDefinition | null | undefined
): Array<{ node_id: string; source_path: string; mimetype: string }> {
  if (!def?.nodes?.length) return []
  const refs: Array<{ node_id: string; source_path: string; mimetype: string }> = []
  for (const node of def.nodes) {
    if (node.type !== 'crm.whatsapp.send_image') continue
    const source_path = String(node.parameters?.background_path ?? '').trim()
    if (!source_path) continue
    refs.push({
      node_id: node.id,
      source_path,
      mimetype:
        String(node.parameters?.background_mimetype ?? 'image/png').trim() || 'image/png',
    })
  }
  return refs
}

export async function buildWorkflowMediaExportAssets(
  def: WorkflowDefinition | null | undefined,
  download: (path: string) => Promise<Buffer | null>
): Promise<WorkflowMediaExportAsset[]> {
  const refs = collectImageStepMediaRefs(def)
  if (refs.length === 0) return []

  const cache = new Map<string, Buffer>()
  const assets: WorkflowMediaExportAsset[] = []

  for (const ref of refs) {
    let buffer = cache.get(ref.source_path)
    if (!buffer) {
      buffer = (await download(ref.source_path)) ?? undefined
      if (buffer?.length) cache.set(ref.source_path, buffer)
    }
    if (!buffer?.length) continue
    assets.push({
      source_path: ref.source_path,
      node_id: ref.node_id,
      mimetype: ref.mimetype,
      data_base64: buffer.toString('base64'),
    })
  }

  return assets
}

export function remapWorkflowDefinitionBackgroundPaths(
  def: WorkflowDefinition,
  pathRemap: Map<string, string>
): WorkflowDefinition {
  if (pathRemap.size === 0) return def
  return {
    ...def,
    nodes: def.nodes.map((node) => {
      if (node.type !== 'crm.whatsapp.send_image') return node
      const oldPath = String(node.parameters?.background_path ?? '').trim()
      const newPath = pathRemap.get(oldPath)
      if (!newPath) return node
      return {
        ...node,
        parameters: {
          ...node.parameters,
          background_path: newPath,
        },
      }
    }),
  }
}

export async function importWorkflowMediaAssets(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  assets: WorkflowMediaExportAsset[]
): Promise<Map<string, string>> {
  const pathRemap = new Map<string, string>()

  for (const asset of assets) {
    const sourcePath = asset.source_path?.trim()
    const nodeId = asset.node_id?.trim()
    const mimetype = asset.mimetype?.trim() || 'image/png'
    const dataBase64 = asset.data_base64?.trim()
    if (!sourcePath || !nodeId || !dataBase64) continue

    let buffer: Buffer
    try {
      buffer = Buffer.from(dataBase64, 'base64')
    } catch {
      continue
    }
    if (!buffer.length) continue

    const newPath = `${userId}/${campaignId}/${nodeId}/background.${extForMime(mimetype)}`
    const { error } = await supabase.storage
      .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
      .upload(newPath, buffer, {
        contentType: mimetype,
        upsert: true,
      })

    if (!error) {
      pathRemap.set(sourcePath, newPath)
    }
  }

  return pathRemap
}

export function imageStepsMissingBundledMedia(
  def: WorkflowDefinition | null | undefined,
  pathRemap: Map<string, string>
): string[] {
  const missing: string[] = []
  for (const ref of collectImageStepMediaRefs(def)) {
    if (!pathRemap.has(ref.source_path)) {
      missing.push(ref.node_id)
    }
  }
  return missing
}
