import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

type WahaChat = {
  id?: string
  name?: string
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isWahaConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WAHA integration is not configured' }, { status: 503 })
    }

    const { session } = await params
    if (!session) return NextResponse.json({ error: 'Session is required' }, { status: 400 })

    const encSession = encodeURIComponent(session)
    const pageSize = 500
    const maxPages = 10
    let chats: WahaChat[] = []
    let lastError: unknown

    for (const basePath of [`/api/${encSession}/chats/overview`, `/api/${encSession}/chats`]) {
      chats = []
      lastError = null
      for (let page = 0; page < maxPages; page++) {
        const offset = page * pageSize
        const p = `${basePath}?limit=${pageSize}&offset=${offset}`
        try {
          const data = await wahaFetch<unknown>(p, { method: 'GET' }, { userId: user.id })
          const rows = Array.isArray(data) ? (data as WahaChat[]) : []
          chats.push(...rows)
          if (rows.length < pageSize) break
        } catch (e) {
          lastError = e
          chats = []
          break
        }
      }
      if (chats.length > 0) break
    }

    if (chats.length === 0 && lastError) throw lastError

    const groups = chats
      .filter((c) => typeof c.id === 'string' && c.id.endsWith('@g.us'))
      .map((c) => ({
        id: c.id as string,
        name: (c.name || c.id || '').toString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ groups })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load groups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

