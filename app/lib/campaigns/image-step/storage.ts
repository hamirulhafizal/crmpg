import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function downloadWorkflowMedia(path: string): Promise<Buffer> {
  const trimmed = path.trim()
  if (!trimmed) {
    throw new Error('No background image uploaded for this step')
  }
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage.from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET).download(trimmed)
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to load background image')
  }
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
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
