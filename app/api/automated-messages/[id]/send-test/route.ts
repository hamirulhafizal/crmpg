import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { WahaApiError, wahaFetch } from '@/app/lib/waha'
import { normalizedScheduledTitle, SCHEDULED_TITLE_GOLD_PRICE_POSTER } from '@/app/lib/scheduled-automation-titles'
import { fetchPublicGoldBuybackSnapshot } from '@/app/lib/public-gold-prices'

type GoldPosterPayload = {
  session: string
  groups: string[]
}

function parseGoldPosterPayload(raw: string): GoldPosterPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<GoldPosterPayload>
    const session = String(parsed.session || '').trim()
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.map((g) => String(g || '').trim()).filter((g) => g.endsWith('@g.us'))
      : []
    if (!session || groups.length === 0) return null
    return { session, groups: Array.from(new Set(groups)) }
  } catch {
    return null
  }
}

function resolveAppBaseUrl(request: Request): string {
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  if (envUrl) return envUrl.replace(/\/$/, '')
  const vercel = (process.env.VERCEL_URL || '').trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`.replace(/\/$/, '')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: row, error } = await supabase
      .from('scheduled_messages')
      .select('id, title, phone, message')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (error || !row) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    if (normalizedScheduledTitle(row.title) !== normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)) {
      return NextResponse.json({ error: 'This test endpoint is only for Gold price poster schedules' }, { status: 400 })
    }

    const payload = parseGoldPosterPayload(row.phone || '')
    if (!payload) return NextResponse.json({ error: 'Invalid Gold poster payload' }, { status: 400 })

    const snapshot = await fetchPublicGoldBuybackSnapshot()
    const posterUrl = `${resolveAppBaseUrl(request)}/api/automation/gold-poster?t=${encodeURIComponent(snapshot.fetchedAtIso)}`

    const text = row.message?.trim() || `PG Jewel 999 Buy: RM ${snapshot.pgJewel999Buy}/g
PG Jewel 916 Buy: RM ${snapshot.pgJewel916Buy}/g
Non-PG 999 Buy: RM ${snapshot.nonPg999Buy}/g
Non-PG 916 Buy: RM ${snapshot.nonPg916Buy}/g`

    const posterRes = await fetch(posterUrl, { cache: 'no-store' })
    if (!posterRes.ok) {
      return NextResponse.json(
        { error: `Poster fetch failed: ${posterRes.status} ${posterRes.statusText}`, debug: { stage: 'posterFetch', posterUrl } },
        { status: 500 }
      )
    }
    const posterBase64 = Buffer.from(await posterRes.arrayBuffer()).toString('base64')

    let sentCount = 0
    for (const groupId of payload.groups) {
      try {
        await wahaFetch(
          '/api/sendImage',
          {
            method: 'POST',
            body: JSON.stringify({
              session: payload.session,
              chatId: groupId,
              file: {
                data: posterBase64,
                filename: 'gold-price-poster.png',
                mimetype: 'image/png',
              },
            }),
          },
          { userId: user.id }
        )
      } catch (e: unknown) {
        if (e instanceof WahaApiError) {
          return NextResponse.json(
            {
              error: `sendImage failed for ${groupId}: ${e.message}`,
              debug: { stage: 'sendImage', groupId, status: e.status, path: e.path, posterUrl },
            },
            { status: 500 }
          )
        }
        throw e
      }

      try {
        await wahaFetch(
          '/api/sendText',
          {
            method: 'POST',
            body: JSON.stringify({
              session: payload.session,
              chatId: groupId,
              text,
            }),
          },
          { userId: user.id }
        )
      } catch (e: unknown) {
        if (e instanceof WahaApiError) {
          return NextResponse.json(
            {
              error: `sendText failed for ${groupId}: ${e.message}`,
              debug: { stage: 'sendText', groupId, status: e.status, path: e.path, posterUrl },
            },
            { status: 500 }
          )
        }
        throw e
      }
      sentCount++
    }

    return NextResponse.json({ success: true, sentCount, debug: { posterUrl, fetchedAt: snapshot.fetchedAtIso } })
  } catch (err: unknown) {
    console.error('gold-poster send-test error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send test poster'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

