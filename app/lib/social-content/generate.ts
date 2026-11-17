import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { createSocialPosts } from '@/app/lib/trypost/posts'
import { defaultContentTypeForPlatform } from '@/app/lib/trypost/content-types'
import type { TryPostSocialAccount } from '@/app/lib/trypost/types'
import { loadTryPostWorkspaceForUser } from '@/app/lib/trypost/workspaces'
import {
  DEFAULT_GENERATE_DAYS,
  DEFAULT_TIME_ZONE,
  SEVEN_DAY_CATEGORY_ROTATION,
  getCategory,
} from '@/app/lib/social-content/categories'
import { generateHybridCaption } from '@/app/lib/social-content/captions'
import { markMediaUsed, pickMediaForCategory } from '@/app/lib/social-content/media'
import { buildPeakSlots } from '@/app/lib/social-content/peak-slots'

export type BatchProgress = {
  current: number
  total: number
  label: string
  message: string
  startedAt?: string
  finishedAt?: string | null
}

export type BatchItemPublic = {
  id: string
  dayIndex: number
  categoryId: string
  categoryLabel: string
  caption: string
  mediaUrl: string | null
  mediaThumbUrl: string | null
  mediaType: string | null
  mediaSource: string | null
  mediaTitle: string | null
  suggestedAt: string | null
  socialAccountIds: string[]
  status: string
  lastError: string | null
}

export type BatchPublic = {
  id: string
  status: string
  days: number
  timeZone: string
  socialAccountIds: string[]
  createdAt: string
  progress: BatchProgress | null
  items: BatchItemPublic[]
}

function connectedAccountIds(channels: TryPostSocialAccount[]): string[] {
  return channels.filter((c) => c.status === 'connected' && c.id).map((c) => c.id)
}

function mapItem(row: Record<string, unknown>): BatchItemPublic {
  return {
    id: String(row.id),
    dayIndex: Number(row.day_index),
    categoryId: String(row.category_id),
    categoryLabel: String(row.category_label),
    caption: String(row.caption || ''),
    mediaUrl: row.media_url ? String(row.media_url) : null,
    mediaThumbUrl: row.media_thumb_url ? String(row.media_thumb_url) : null,
    mediaType: row.media_type ? String(row.media_type) : null,
    mediaSource: row.media_source ? String(row.media_source) : null,
    mediaTitle: row.media_title ? String(row.media_title) : null,
    suggestedAt: row.suggested_at ? String(row.suggested_at) : null,
    socialAccountIds: Array.isArray(row.social_account_ids)
      ? (row.social_account_ids as string[])
      : [],
    status: String(row.status || 'draft'),
    lastError: row.last_error ? String(row.last_error) : null,
  }
}

function readProgress(meta: unknown): BatchProgress | null {
  if (!meta || typeof meta !== 'object') return null
  const progress = (meta as { progress?: unknown }).progress
  if (!progress || typeof progress !== 'object') return null
  const p = progress as Record<string, unknown>
  return {
    current: Number(p.current || 0),
    total: Number(p.total || DEFAULT_GENERATE_DAYS),
    label: String(p.label || ''),
    message: String(p.message || ''),
    startedAt: typeof p.startedAt === 'string' ? p.startedAt : undefined,
    finishedAt: typeof p.finishedAt === 'string' ? p.finishedAt : null,
  }
}

async function updateBatchProgress(
  batchId: string,
  existingMeta: Record<string, unknown>,
  progress: BatchProgress,
  status?: string
) {
  const admin = createServiceRoleClient()
  const patch: Record<string, unknown> = {
    meta: { ...existingMeta, progress },
    updated_at: new Date().toISOString(),
  }
  if (status) patch.status = status
  await admin.from('social_content_batches').update(patch).eq('id', batchId)
}

function toBatchPublic(
  batch: Record<string, unknown>,
  items: Record<string, unknown>[]
): BatchPublic {
  return {
    id: String(batch.id),
    status: String(batch.status),
    days: Number(batch.days),
    timeZone: String(batch.time_zone || DEFAULT_TIME_ZONE),
    socialAccountIds: Array.isArray(batch.social_account_ids)
      ? (batch.social_account_ids as string[])
      : [],
    createdAt: String(batch.created_at),
    progress: readProgress(batch.meta),
    items: items.map(mapItem),
  }
}

export async function getLatestContentBatch(userId: string): Promise<BatchPublic | null> {
  const admin = createServiceRoleClient()
  const { data: batch } = await admin
    .from('social_content_batches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!batch) return null

  const { data: items } = await admin
    .from('social_content_batch_items')
    .select('*')
    .eq('batch_id', batch.id)
    .order('day_index', { ascending: true })

  return toBatchPublic(batch as Record<string, unknown>, (items ?? []) as Record<string, unknown>[])
}

export async function getContentBatchById(
  userId: string,
  batchId: string
): Promise<BatchPublic | null> {
  const admin = createServiceRoleClient()
  const { data: batch } = await admin
    .from('social_content_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!batch) return null

  const { data: items } = await admin
    .from('social_content_batch_items')
    .select('*')
    .eq('batch_id', batch.id)
    .order('day_index', { ascending: true })

  return toBatchPublic(batch as Record<string, unknown>, (items ?? []) as Record<string, unknown>[])
}

/** Create batch shell + enqueue background work. Returns immediately. */
export async function startContentBatchGeneration(input: {
  userId: string
  recreate?: boolean
}): Promise<BatchPublic> {
  const workspace = await loadTryPostWorkspaceForUser(input.userId)
  if (!workspace) throw new Error('Connect a TryPost workspace first.')

  const channels = (workspace.channels ?? []) as TryPostSocialAccount[]
  const accountIds = connectedAccountIds(channels)
  if (!accountIds.length) throw new Error('No connected social accounts. Sync channels first.')

  const admin = createServiceRoleClient()

  // Prevent overlapping generators for the same user.
  const { data: running } = await admin
    .from('social_content_batches')
    .select('id')
    .eq('user_id', input.userId)
    .eq('status', 'generating')
    .limit(1)
    .maybeSingle()

  if (running && !input.recreate) {
    const existing = await getContentBatchById(input.userId, running.id)
    if (existing) return existing
  }

  if (input.recreate || running) {
    await admin
      .from('social_content_batches')
      .update({ status: 'discarded', updated_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .in('status', ['pending_review', 'generating'])
  }

  const days = DEFAULT_GENERATE_DAYS
  const timeZone = DEFAULT_TIME_ZONE
  const startedAt = new Date().toISOString()
  const progress: BatchProgress = {
    current: 0,
    total: days,
    label: 'Bersedia',
    message: 'Background service sedang mula…',
    startedAt,
    finishedAt: null,
  }

  const { data: batch, error: batchError } = await admin
    .from('social_content_batches')
    .insert({
      user_id: input.userId,
      workspace_id: workspace.id,
      status: 'generating',
      days,
      time_zone: timeZone,
      social_account_ids: accountIds,
      meta: {
        recreate: Boolean(input.recreate),
        peakHours: [12, 20, 21],
        progress,
        background: true,
      },
    })
    .select('*')
    .single()

  if (batchError || !batch) {
    throw new Error(batchError?.message || 'Failed to create content batch')
  }

  return toBatchPublic(batch as Record<string, unknown>, [])
}

/** Background worker: fill items for a generating batch. */
export async function processContentBatchGeneration(input: {
  userId: string
  batchId: string
}): Promise<BatchPublic> {
  const admin = createServiceRoleClient()
  const { data: batch } = await admin
    .from('social_content_batches')
    .select('*')
    .eq('id', input.batchId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (!batch) throw new Error('Batch not found')
  if (batch.status !== 'generating') {
    return (await getContentBatchById(input.userId, input.batchId))!
  }

  const existingMeta =
    typeof batch.meta === 'object' && batch.meta ? (batch.meta as Record<string, unknown>) : {}
  const accountIds: string[] = Array.isArray(batch.social_account_ids)
    ? batch.social_account_ids
    : []
  const days = Number(batch.days || DEFAULT_GENERATE_DAYS)

  // Resume safety: if all day rows already exist, just mark ready (unblocks stuck UI).
  const { count: existingCount } = await admin
    .from('social_content_batch_items')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batch.id)
  if ((existingCount ?? 0) >= days) {
    const finishedAt = new Date().toISOString()
    await admin
      .from('social_content_batches')
      .update({
        status: 'pending_review',
        updated_at: finishedAt,
        meta: {
          ...existingMeta,
          progress: {
            current: days,
            total: days,
            label: 'Siap!',
            message: '7 hari content ready untuk review.',
            startedAt: readProgress(existingMeta)?.startedAt || finishedAt,
            finishedAt,
          },
        },
      })
      .eq('id', batch.id)
      .eq('status', 'generating')
    return (await getContentBatchById(input.userId, batch.id))!
  }
  const timeZone = String(batch.time_zone || DEFAULT_TIME_ZONE)
  const slots = buildPeakSlots({ days, timeZone })
  const rotation = SEVEN_DAY_CATEGORY_ROTATION.slice(0, days)
  const excludeKeys = new Set<string>()
  const startedAt =
    readProgress(existingMeta)?.startedAt || new Date().toISOString()

  try {
    for (let i = 0; i < days; i++) {
      // Stop if batch was discarded mid-run.
      const { data: live } = await admin
        .from('social_content_batches')
        .select('status')
        .eq('id', batch.id)
        .maybeSingle()
      if (!live || live.status !== 'generating') {
        return (await getContentBatchById(input.userId, batch.id))!
      }

      const categoryId = rotation[i]!
      const category = getCategory(categoryId)!
      const suggestedAt = slots[i] || null

      await updateBatchProgress(batch.id, existingMeta, {
        current: i,
        total: days,
        label: `Hari ${i + 1} · ${category.label}`,
        message: 'Mencari media (R2 + Telegram)…',
        startedAt,
        finishedAt: null,
      })

      let media = null as Awaited<ReturnType<typeof pickMediaForCategory>>
      try {
        media = await pickMediaForCategory({
          userId: input.userId,
          category,
          excludeKeys,
        })
      } catch {
        media = null
      }

      if (media) excludeKeys.add(media.mediaKey)

      await updateBatchProgress(batch.id, existingMeta, {
        current: i,
        total: days,
        label: `Hari ${i + 1} · ${category.label}`,
        message: media
          ? 'Menulis caption BM (hook → plot twist)…'
          : 'Tiada media — skip & terus…',
        startedAt,
        finishedAt: null,
      })

      const { caption, source } = await generateHybridCaption({
        category,
        mediaTitle: media?.mediaTitle,
        mediaCaption: media?.mediaCaption,
        mediaType: media?.mediaType,
        salt: Date.now() + i * 97,
      })

      const { data: item, error: itemError } = await admin
        .from('social_content_batch_items')
        .upsert(
          {
            batch_id: batch.id,
            day_index: i,
            category_id: category.id,
            category_label: category.label,
            caption,
            media_url: media?.mediaUrl ?? null,
            media_thumb_url:
              media?.mediaThumbUrl ??
              (media?.mediaType === 'image' ? media.mediaUrl : null) ??
              null,
            media_type: media?.mediaType ?? null,
            media_source: media?.mediaSource ?? null,
            media_key: media?.mediaKey ?? null,
            media_title: media?.mediaTitle ?? null,
            suggested_at: suggestedAt?.toISOString() ?? null,
            social_account_ids: accountIds,
            status: media ? 'draft' : 'skipped',
            last_error: media ? null : 'No unused media found for this category (R2 + Telegram).',
            meta: {
              captionSource: source,
              telegramChatId: media?.telegramChatId ?? null,
              telegramMessageId: media?.telegramMessageId ?? null,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'batch_id,day_index' }
        )
        .select('*')
        .single()

      if (itemError || !item) {
        throw new Error(itemError?.message || `Failed to create day ${i + 1} item`)
      }

      if (media) {
        await markMediaUsed({
          userId: input.userId,
          mediaKey: media.mediaKey,
          mediaUrl: media.mediaUrl,
          categoryId: category.id,
          batchItemId: item.id,
        })
      }

      await updateBatchProgress(batch.id, existingMeta, {
        current: i + 1,
        total: days,
        label: `Hari ${i + 1} selesai`,
        message: media ? 'Draft disimpan. Seterusnya…' : 'Skipped — tiada media.',
        startedAt,
        finishedAt: null,
      })
    }

    const finishedAt = new Date().toISOString()
    await admin
      .from('social_content_batches')
      .update({
        status: 'pending_review',
        updated_at: finishedAt,
        meta: {
          ...existingMeta,
          progress: {
            current: days,
            total: days,
            label: 'Siap!',
            message: '7 hari content ready untuk review.',
            startedAt,
            finishedAt,
          },
        },
      })
      .eq('id', batch.id)
      .eq('status', 'generating')

    return (await getContentBatchById(input.userId, batch.id))!
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generate failed'
    await admin
      .from('social_content_batches')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        meta: {
          ...existingMeta,
          progress: {
            current: readProgress(existingMeta)?.current || 0,
            total: days,
            label: 'Gagal',
            message,
            startedAt,
            finishedAt: new Date().toISOString(),
          },
          error: message,
        },
      })
      .eq('id', batch.id)
    throw err
  }
}

/** @deprecated Prefer start + process for background. Kept for sync callers. */
export async function generateContentBatch(input: {
  userId: string
  recreate?: boolean
}): Promise<BatchPublic> {
  const started = await startContentBatchGeneration(input)
  return processContentBatchGeneration({ userId: input.userId, batchId: started.id })
}

export async function approveContentBatch(input: {
  userId: string
  batchId: string
}): Promise<{ approved: number; failed: number; batch: BatchPublic }> {
  const admin = createServiceRoleClient()
  const { data: batch } = await admin
    .from('social_content_batches')
    .select('*')
    .eq('id', input.batchId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (!batch) throw new Error('Batch not found')
  if (batch.status === 'generating') throw new Error('Batch still generating — wait until ready.')
  if (batch.status === 'approved') throw new Error('Batch already approved')
  if (batch.status === 'failed') throw new Error('Batch failed — recreate first.')

  const workspace = await loadTryPostWorkspaceForUser(input.userId)
  if (!workspace) throw new Error('Workspace missing')
  const channels = (workspace.channels ?? []) as TryPostSocialAccount[]
  const channelById = new Map(channels.map((c) => [c.id, c]))

  const { data: items } = await admin
    .from('social_content_batch_items')
    .select('*')
    .eq('batch_id', batch.id)
    .order('day_index', { ascending: true })

  let approved = 0
  let failed = 0

  for (const item of items ?? []) {
    if (item.status === 'skipped' || !item.media_url || !item.caption) {
      failed += 1
      continue
    }

    const accountIds: string[] = Array.isArray(item.social_account_ids)
      ? item.social_account_ids
      : []

    try {
      const destinations = accountIds.map((socialAccountId) => {
        const channel = channelById.get(socialAccountId)
        const platform = channel?.platform || 'instagram'
        const contentType = defaultContentTypeForPlatform(platform, [
          item.media_type === 'video' ? 'video' : 'image',
        ])
        return {
          socialAccountId,
          content: item.caption as string,
          contentType,
          mediaUrls: [String(item.media_url)],
        }
      })

      const result = await createSocialPosts({
        userId: input.userId,
        content: String(item.caption),
        socialAccountIds: accountIds,
        publishMode: 'draft',
        scheduledAt: null,
        mediaUrls: [String(item.media_url)],
        destinations,
      })

      const postIds = (result.posts ?? []).map((p) => p.id)
      await admin
        .from('social_content_batch_items')
        .update({
          status: 'approved',
          trypost_post_ids: postIds,
          last_error: null,
          updated_at: new Date().toISOString(),
          meta: {
            ...(typeof item.meta === 'object' && item.meta ? item.meta : {}),
            suggestedAtKept: item.suggested_at,
          },
        })
        .eq('id', item.id)
      approved += 1
    } catch (err) {
      failed += 1
      await admin
        .from('social_content_batch_items')
        .update({
          status: 'failed',
          last_error: err instanceof Error ? err.message : 'Approve failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    }
  }

  await admin
    .from('social_content_batches')
    .update({
      status: 'approved',
      updated_at: new Date().toISOString(),
      meta: {
        ...(typeof batch.meta === 'object' && batch.meta ? batch.meta : {}),
        approved,
        failed,
      },
    })
    .eq('id', batch.id)

  const latest = await getLatestContentBatch(input.userId)
  return {
    approved,
    failed,
    batch: latest!,
  }
}
