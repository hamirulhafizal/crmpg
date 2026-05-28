import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

function blobLikeToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data)
  }
  if (data && typeof data === 'object' && typeof (data as Blob).arrayBuffer === 'function') {
    throw new Error('downloadWorkflowMedia: use blobToBuffer() for Blob payloads')
  }
  throw new Error('Unexpected storage download payload type')
}

async function blobToBuffer(data: Blob): Promise<Buffer> {
  const ab = await data.arrayBuffer()
  if (!ab || ab.byteLength === 0) {
    throw new Error('Background image file is empty')
  }
  return Buffer.from(ab)
}

export async function downloadWorkflowMedia(path: string): Promise<Buffer> {
  const trimmed = path.trim()
  if (!trimmed) {
    throw new Error('No background image uploaded for this step')
  }
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage.from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET).download(trimmed)
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to load background image from storage')
  }

  const buffer =
    data instanceof Blob
      ? await blobToBuffer(data)
      : blobLikeToBuffer(data)

  if (!buffer.length) {
    throw new Error('Background image file is empty')
  }
  return buffer
}

export async function signedWorkflowMediaUrl(path: string, expiresInSec = 3600): Promise<string> {
  const trimmed = path.trim()
  if (!trimmed) return ''
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage
    .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
    .createSignedUrl(trimmed, expiresInSec)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to sign media URL')
  }
  return data.signedUrl
}
