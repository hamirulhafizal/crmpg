import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

function safeFilename(raw: string | null, fallback: string) {
  const base = (raw || fallback).replace(/[^\w.\-]+/g, '_').slice(0, 120)
  return base || fallback
}

/**
 * Proxy media download so the browser can save R2 files even when
 * cross-origin Content-Disposition / CORS blocks <a download>.
 */
export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const url = (searchParams.get('url') || '').trim()
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 })
  }

  // Only allow our public media hosts (R2 / TryPost CDN).
  const host = parsed.hostname.toLowerCase()
  const allowed =
    host.endsWith('.r2.dev') ||
    host.endsWith('.r2.cloudflarestorage.com') ||
    host.endsWith('cdn.trypost.it') ||
    host === 'localhost' ||
    host.endsWith('.publicgolds.com')
  if (!allowed) {
    return NextResponse.json({ error: 'Host not allowed for download proxy.' }, { status: 403 })
  }

  const upstream = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream failed (${upstream.status})` },
      { status: 502 }
    )
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const filename = safeFilename(
    searchParams.get('filename'),
    contentType.includes('video') ? 'video.mp4' : 'media.bin'
  )
  const buffer = Buffer.from(await upstream.arrayBuffer())

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
