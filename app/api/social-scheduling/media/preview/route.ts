import { NextResponse } from 'next/server'

import { toChromeSafePreview } from '@/app/lib/social-content/chrome-safe-video'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'

export const runtime = 'nodejs'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

/**
 * Re-encode remote video for Chromium preview.
 * Safari/QuickTime often play the original; Chrome freezes on MP4 edit lists.
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

  const host = parsed.hostname.toLowerCase()
  const allowed =
    host.endsWith('.r2.dev') ||
    host.endsWith('.r2.cloudflarestorage.com') ||
    host.endsWith('cdn.trypost.it') ||
    host === 'localhost' ||
    host.endsWith('.publicgolds.com')
  if (!allowed) {
    return NextResponse.json({ error: 'Host not allowed for preview proxy.' }, { status: 403 })
  }

  const upstream = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!upstream.ok) {
    return NextResponse.json({ error: `Upstream failed (${upstream.status})` }, { status: 502 })
  }

  const input = Buffer.from(await upstream.arrayBuffer())
  if (!input.length) {
    return NextResponse.json({ error: 'Empty media file' }, { status: 502 })
  }

  try {
    const encoded = await toChromeSafePreview(input)
    return new NextResponse(encoded.buffer, {
      status: 200,
      headers: {
        'Content-Type': encoded.mimeType,
        'Content-Length': String(encoded.buffer.length),
        'Content-Disposition': `inline; filename="preview.${encoded.extension}"`,
        'Cache-Control': 'private, max-age=600',
        'X-Preview-Transcode': 'ok',
        'X-Preview-Format': encoded.extension,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transcode failed'
    console.error('[media-preview] encode failed:', e)
    // Do NOT return the original bytes — Chrome will freeze again.
    return NextResponse.json(
      {
        error:
          'Could not build a Chrome-safe preview. Download the file and open it in QuickTime/Safari.',
        details: message,
      },
      { status: 422 }
    )
  }
}
