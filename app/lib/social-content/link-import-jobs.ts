import { randomUUID } from 'node:crypto'

import {
  isMediaR2Configured,
  loadMediaR2Settings,
  sizeLimitBytes,
} from '@/app/lib/media-r2-settings'
import {
  buildR2ObjectKey,
  uploadToR2,
} from '@/app/lib/media-r2-storage'
import {
  buildDealerCta,
  detectSocialPlatform,
  downloadSocialVideo,
  generateRepostCaption,
  normalizeSocialUrl,
} from '@/app/lib/social-content/link-import'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

const SOCIAL_FOLDER = 'social-scheduling'
const LEASE_MS = 4 * 60 * 1000

export type LinkImportJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type LinkImportJobRow = {
  id: string
  user_id: string
  source_url: string
  platform: string | null
  status: LinkImportJobStatus
  progress_label: string | null
  progress_pct: number
  error_message: string | null
  asset_id: string | null
  caption: string | null
  caption_source: string | null
  meta: Record<string, unknown>
  lease_owner: string | null
  lease_expires_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type LinkImportJobPublic = {
  id: string
  sourceUrl: string
  platform: string | null
  status: LinkImportJobStatus
  progressLabel: string | null
  progressPct: number
  errorMessage: string | null
  caption: string | null
  captionSource: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
  completedAt: string | null
  asset: {
    id: string
    title: string
    publicUrl: string
    mediaType: string
    mimeType: string
    originalFilename: string
    sizeBytes: number
    r2Key: string
    folder: string
  } | null
}

function serializeJob(
  row: LinkImportJobRow,
  asset: LinkImportJobPublic['asset'] = null
): LinkImportJobPublic {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    platform: row.platform,
    status: row.status,
    progressLabel: row.progress_label,
    progressPct: row.progress_pct,
    errorMessage: row.error_message,
    caption: row.caption,
    captionSource: row.caption_source,
    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    asset,
  }
}

async function loadAssetForJob(assetId: string | null): Promise<LinkImportJobPublic['asset']> {
  if (!assetId) return null
  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('admin_media_assets')
    .select('id, title, public_url, media_type, mime_type, original_filename, size_bytes, r2_key, folder')
    .eq('id', assetId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    title: data.title || data.original_filename || 'Imported video',
    publicUrl: data.public_url,
    mediaType: data.media_type,
    mimeType: data.mime_type,
    originalFilename: data.original_filename,
    sizeBytes: data.size_bytes,
    r2Key: data.r2_key,
    folder: data.folder || SOCIAL_FOLDER,
  }
}

export async function getLinkImportJobForUser(
  userId: string,
  jobId: string
): Promise<LinkImportJobPublic | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('social_link_import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as LinkImportJobRow
  return serializeJob(row, await loadAssetForJob(row.asset_id))
}

export async function getActiveLinkImportJobForUser(
  userId: string
): Promise<LinkImportJobPublic | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('social_link_import_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as LinkImportJobRow
  return serializeJob(row, await loadAssetForJob(row.asset_id))
}

export async function getLatestLinkImportJobForUser(
  userId: string
): Promise<LinkImportJobPublic | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('social_link_import_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as LinkImportJobRow
  return serializeJob(row, await loadAssetForJob(row.asset_id))
}

async function updateJob(
  jobId: string,
  patch: Partial<{
    status: LinkImportJobStatus
    progress_label: string | null
    progress_pct: number
    error_message: string | null
    asset_id: string | null
    caption: string | null
    caption_source: string | null
    meta: Record<string, unknown>
    lease_owner: string | null
    lease_expires_at: string | null
    started_at: string | null
    completed_at: string | null
    platform: string | null
  }>
) {
  const admin = createServiceRoleClient()
  const { error } = await admin.from('social_link_import_jobs').update(patch).eq('id', jobId)
  if (error) throw error
}

export async function enqueueLinkImportJob(opts: {
  userId: string
  url: string
}): Promise<LinkImportJobPublic> {
  const sourceUrl = normalizeSocialUrl(opts.url)
  const platform = detectSocialPlatform(sourceUrl)
  if (platform === 'unknown') {
    throw new Error('Supported platforms: YouTube, Instagram, TikTok, Facebook.')
  }

  const settings = await loadMediaR2Settings()
  if (!isMediaR2Configured(settings)) {
    throw new Error('Cloudflare R2 is not configured. Open Media settings first.')
  }

  const admin = createServiceRoleClient()

  // Cancel any previous active job for this user (unique active index).
  await admin
    .from('social_link_import_jobs')
    .update({
      status: 'cancelled',
      error_message: 'Superseded by a new paste-link import.',
      completed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('user_id', opts.userId)
    .in('status', ['queued', 'running'])

  const { data, error } = await admin
    .from('social_link_import_jobs')
    .insert({
      user_id: opts.userId,
      source_url: sourceUrl,
      platform,
      status: 'queued',
      progress_label: 'Queued — will keep running if you close the app',
      progress_pct: 0,
      meta: {},
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to enqueue import job')
  }

  return serializeJob(data as LinkImportJobRow)
}

async function claimJob(jobId: string, owner: string): Promise<LinkImportJobRow | null> {
  const admin = createServiceRoleClient()
  const now = Date.now()
  const leaseExpires = new Date(now + LEASE_MS).toISOString()

  const { data: current } = await admin
    .from('social_link_import_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (!current) return null
  const row = current as LinkImportJobRow
  if (row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') {
    return null
  }

  const leaseExpired =
    !row.lease_expires_at || new Date(row.lease_expires_at).getTime() <= now
  const canSteal =
    row.status === 'queued' ||
    (row.status === 'running' && (leaseExpired || row.lease_owner === owner))
  if (!canSteal) return null

  const { data, error } = await admin
    .from('social_link_import_jobs')
    .update({
      status: 'running',
      lease_owner: owner,
      lease_expires_at: leaseExpires,
      started_at: row.started_at || new Date().toISOString(),
      progress_label: row.progress_label || 'Starting download…',
    })
    .eq('id', jobId)
    .in('status', ['queued', 'running'])
    .select('*')
    .maybeSingle()

  if (error) throw error
  return (data as LinkImportJobRow | null) ?? null
}

async function heartbeat(jobId: string, owner: string, label: string, pct: number) {
  const admin = createServiceRoleClient()
  await admin
    .from('social_link_import_jobs')
    .update({
      progress_label: label,
      progress_pct: pct,
      lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
      lease_owner: owner,
    })
    .eq('id', jobId)
    .eq('lease_owner', owner)
    .eq('status', 'running')
}

/**
 * Process one job end-to-end. Safe to call from `after()` or cron reclaim.
 */
export async function processLinkImportJob(jobId: string): Promise<void> {
  const owner = `worker-${randomUUID().slice(0, 8)}`
  const claimed = await claimJob(jobId, owner)
  if (!claimed) return

  try {
    await heartbeat(jobId, owner, 'Downloading video…', 15)

    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      throw new Error('Cloudflare R2 is not configured.')
    }

    const downloaded = await downloadSocialVideo(claimed.source_url)
    const maxBytes = sizeLimitBytes(settings, 'video')
    if (downloaded.buffer.length > maxBytes) {
      throw new Error(`Video exceeds ${settings.sizeLimitsMb.video} MB limit.`)
    }

    await heartbeat(jobId, owner, 'Generating BM caption…', 55)

    const admin = createServiceRoleClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('username_pbo, phone, full_name')
      .eq('id', claimed.user_id)
      .maybeSingle()

    const cta = buildDealerCta({
      usernamePbo: profile?.username_pbo,
      phone: profile?.phone,
    })
    const { caption, source: captionSource } = await generateRepostCaption({
      meta: downloaded.meta,
      cta,
    })

    await heartbeat(jobId, owner, 'Uploading to media library…', 75)

    const originalFilename = downloaded.filename || 'social-import.mp4'
    const title =
      downloaded.meta.title?.slice(0, 120) ||
      originalFilename.replace(/\.[^.]+$/, '') ||
      'Imported social video'
    const r2Key = buildR2ObjectKey('video', originalFilename, SOCIAL_FOLDER)

    const uploaded = await uploadToR2({
      settings,
      key: r2Key,
      body: Buffer.from(downloaded.buffer),
      mimeType: downloaded.mimeType,
    })

    const now = new Date().toISOString()
    const { data: asset, error: assetError } = await admin
      .from('admin_media_assets')
      .insert({
        title,
        original_filename: originalFilename,
        media_type: 'video',
        mime_type: downloaded.mimeType,
        size_bytes: downloaded.buffer.length,
        r2_key: uploaded.key,
        public_url: uploaded.publicUrl,
        folder: SOCIAL_FOLDER,
        uploaded_by: claimed.user_id,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (assetError || !asset) {
      const { deleteFromR2 } = await import('@/app/lib/media-r2-storage')
      await deleteFromR2(settings, uploaded.key).catch(() => {})
      throw new Error(assetError?.message || 'Failed to save media asset')
    }

    await updateJob(jobId, {
      status: 'completed',
      progress_label: 'Ready',
      progress_pct: 100,
      asset_id: asset.id,
      caption,
      caption_source: captionSource,
      meta: {
        platform: downloaded.meta.platform,
        title: downloaded.meta.title,
        authorUsername: downloaded.meta.authorUsername,
        cta,
      },
      completed_at: now,
      lease_owner: null,
      lease_expires_at: null,
      platform: downloaded.meta.platform,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Import failed'
    console.error('[link-import-job] failed', jobId, e)
    await updateJob(jobId, {
      status: 'failed',
      progress_label: 'Failed',
      progress_pct: 100,
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    }).catch(() => {})
  }
}

/** Cron / reclaim: pick stale queued/running jobs and process them. */
export async function reclaimAndProcessLinkImportJobs(limit = 3): Promise<number> {
  const admin = createServiceRoleClient()
  const now = Date.now()

  const { data: queued, error: qErr } = await admin
    .from('social_link_import_jobs')
    .select('id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (qErr) throw qErr

  const { data: running, error: rErr } = await admin
    .from('social_link_import_jobs')
    .select('id, lease_expires_at')
    .eq('status', 'running')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (rErr) throw rErr

  const staleRunning = (running ?? []).filter((row) => {
    const exp = row.lease_expires_at ? new Date(String(row.lease_expires_at)).getTime() : 0
    return !exp || exp <= now
  })

  const ids = [
    ...(queued ?? []).map((r) => String(r.id)),
    ...staleRunning.map((r) => String(r.id)),
  ].slice(0, limit)

  for (const id of ids) {
    await processLinkImportJob(id)
  }
  return ids.length
}
