import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  isMediaR2Configured,
  loadMediaR2Settings,
  sizeLimitBytes,
  type MediaType,
} from '@/app/lib/media-r2-settings'
import {
  buildR2ObjectKey,
  mediaTypeFromMime,
  normalizeFolder,
  uploadToR2,
} from '@/app/lib/media-r2-storage'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'

type AssetRow = {
  id: string
  title: string
  original_filename: string
  media_type: MediaType
  mime_type: string
  size_bytes: number
  r2_key: string
  public_url: string
  folder: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

function serializeAsset(row: AssetRow) {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    r2Key: row.r2_key,
    publicUrl: row.public_url,
    folder: row.folder,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const mediaType = url.searchParams.get('type')?.trim() as MediaType | '' | null
  const folder = normalizeFolder(url.searchParams.get('folder') ?? '')
  const q = url.searchParams.get('q')?.trim() ?? ''

  try {
    const admin = createServiceRoleClient()
    let query = admin
      .from('admin_media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (mediaType && ['image', 'audio', 'video', 'pdf'].includes(mediaType)) {
      query = query.eq('media_type', mediaType)
    }
    if (folder) {
      query = query.eq('folder', folder)
    }
    if (q) {
      query = query.or(`title.ilike.%${q}%,original_filename.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({
      assets: (data ?? []).map((row) => serializeAsset(row as AssetRow)),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to list media'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const settings = await loadMediaR2Settings()
    if (!isMediaR2Configured(settings)) {
      return NextResponse.json(
        { error: 'R2 is not configured. Open Media settings and save credentials first.' },
        { status: 400 }
      )
    }

    const form = await request.formData()
    const file = form.get('file')
    const titleRaw = String(form.get('title') ?? '').trim()
    const folder = normalizeFolder(String(form.get('folder') ?? ''))

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file upload.' }, { status: 400 })
    }

    const mimeType = (file.type || 'application/octet-stream').toLowerCase()
    const mediaType = mediaTypeFromMime(mimeType)
    if (!mediaType) {
      return NextResponse.json(
        { error: 'Unsupported file type. Allowed: image, audio, video, PDF.' },
        { status: 400 }
      )
    }

    const maxBytes = sizeLimitBytes(settings, mediaType)
    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `File exceeds ${settings.sizeLimitsMb[mediaType]} MB limit for ${mediaType}.`,
        },
        { status: 400 }
      )
    }

    const originalFilename = file.name || 'upload'
    const title = titleRaw || originalFilename.replace(/\.[^.]+$/, '') || originalFilename
    const buffer = Buffer.from(await file.arrayBuffer())
    const r2Key = buildR2ObjectKey(mediaType, originalFilename, folder)

    let uploaded: { key: string; publicUrl: string }
    try {
      uploaded = await uploadToR2({
        settings,
        key: r2Key,
        body: buffer,
        mimeType,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'R2 upload failed'
      console.error('R2 upload error:', e)
      return NextResponse.json({ error: message, source: 'r2' }, { status: 502 })
    }

    const admin = createServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('admin_media_assets')
      .insert({
        title,
        original_filename: originalFilename,
        media_type: mediaType,
        mime_type: mimeType,
        size_bytes: file.size,
        r2_key: uploaded.key,
        public_url: uploaded.publicUrl,
        folder,
        uploaded_by: auth.user.id,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) {
      const { deleteFromR2 } = await import('@/app/lib/media-r2-storage')
      await deleteFromR2(settings, uploaded.key).catch(() => {})
      throw error
    }

    return NextResponse.json({ asset: serializeAsset(data as AssetRow) })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    console.error('Media upload error:', e)
    return NextResponse.json({ error: message, source: 'server' }, { status: 500 })
  }
}
