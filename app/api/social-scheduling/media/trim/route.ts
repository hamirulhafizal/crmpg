import { NextResponse } from 'next/server'

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
  trimVideoToMaxSeconds,
  withMp4Filename,
} from '@/app/lib/social-content/chrome-safe-video'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SOCIAL_FOLDER = 'social-scheduling'

/**
 * Auto-cut a remote video to 0 → maxSeconds for a platform duration limit.
 * Keeps the source URL untouched; returns a new R2 asset.
 */
export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => null)) as {
      url?: string
      maxSeconds?: number
      sourceAssetId?: string
      filename?: string
    } | null

    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    const maxSeconds = Number(body?.maxSeconds)
    if (!url) {
      return NextResponse.json({ error: 'Missing video url.' }, { status: 400 })
    }
    if (!(maxSeconds > 0) || maxSeconds > 6 * 60 * 60) {
      return NextResponse.json({ error: 'maxSeconds must be between 1 and 21600.' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid url.' }, { status: 400 })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Unsupported protocol.' }, { status: 400 })
    }

    const host = parsed.hostname.toLowerCase()
    const allowed =
      host.endsWith('.r2.dev') ||
      host.endsWith('.r2.cloudflarestorage.com') ||
      host.endsWith('cdn.trypost.it') ||
      host === 'localhost' ||
      host.endsWith('.publicgolds.com')
    if (!allowed) {
      return NextResponse.json({ error: 'Host not allowed for trim.' }, { status: 403 })
    }

    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured. Open Media settings first.' },
        { status: 400 }
      )
    }

    const upstream = await fetch(url, { redirect: 'follow', cache: 'no-store' })
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream failed (${upstream.status})` }, { status: 502 })
    }
    const input = Buffer.from(await upstream.arrayBuffer())
    if (!input.length) {
      return NextResponse.json({ error: 'Empty media file.' }, { status: 502 })
    }

    let trimmed
    try {
      trimmed = await trimVideoToMaxSeconds(input, maxSeconds)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Trim failed'
      console.error('Social media trim error:', e)
      return NextResponse.json(
        { error: 'Could not trim this video for the channel limit.', details: message, source: 'ffmpeg' },
        { status: 422 }
      )
    }

    const maxBytes = sizeLimitBytes(settings, 'video')
    if (trimmed.buffer.length > maxBytes) {
      return NextResponse.json(
        { error: `Trimmed video exceeds ${settings.sizeLimitsMb.video} MB limit.` },
        { status: 400 }
      )
    }

    const originalFilename = withMp4Filename(
      typeof body?.filename === 'string' && body.filename.trim()
        ? body.filename.trim()
        : `trimmed-${Math.round(maxSeconds)}s.mp4`
    )
    const title = originalFilename.replace(/\.[^.]+$/, '') || originalFilename
    const r2Key = buildR2ObjectKey('video', originalFilename, SOCIAL_FOLDER)

    let uploaded: { key: string; publicUrl: string }
    try {
      uploaded = await uploadToR2({
        settings,
        key: r2Key,
        body: Buffer.from(trimmed.buffer),
        mimeType: trimmed.mimeType,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'R2 upload failed'
      return NextResponse.json({ error: message, source: 'r2' }, { status: 502 })
    }

    const admin = createServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('admin_media_assets')
      .insert({
        title: `${title} (≤${Math.round(maxSeconds)}s)`,
        original_filename: originalFilename,
        media_type: 'video',
        mime_type: trimmed.mimeType,
        size_bytes: trimmed.buffer.length,
        r2_key: uploaded.key,
        public_url: uploaded.publicUrl,
        folder: SOCIAL_FOLDER,
        uploaded_by: auth.user.id,
        created_at: now,
        updated_at: now,
      })
      .select('id, public_url, media_type, mime_type, original_filename, size_bytes, r2_key')
      .single()

    if (error) {
      const { deleteFromR2 } = await import('@/app/lib/media-r2-storage')
      await deleteFromR2(settings, uploaded.key).catch(() => {})
      throw error
    }

    return NextResponse.json({
      asset: {
        id: data.id,
        publicUrl: data.public_url,
        mediaType: data.media_type,
        mimeType: data.mime_type,
        originalFilename: data.original_filename,
        sizeBytes: data.size_bytes,
        r2Key: data.r2_key,
        durationSec: trimmed.durationSec ?? maxSeconds,
        sourceAssetId: typeof body?.sourceAssetId === 'string' ? body.sourceAssetId : null,
        trimmedToSec: maxSeconds,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Trim failed'
    console.error('Social media trim route error:', e)
    return NextResponse.json({ error: message, source: 'server' }, { status: 500 })
  }
}
