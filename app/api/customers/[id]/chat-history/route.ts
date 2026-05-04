import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { fetchWahaChatMessages } from '@/app/lib/waha-chat-messages'
import { wahaFetch, WahaApiError } from '@/app/lib/waha'

type Params = { params: Promise<{ id: string }> }

type ChatHistoryRow = {
  id: string
  text: string
  timestamp: number | null
  fromMe: boolean
}

function unwrapMessagesPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.messages)) return o.messages
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.data)) return o.data
  }
  return []
}

function extractTimestamp(m: Record<string, unknown>): number | null {
  const t =
    m.timestamp ??
    m.msgTimestamp ??
    m.t ??
    (m.message as Record<string, unknown> | undefined)?.timestamp ??
    m.serverTimestamp
  if (typeof t !== 'number' || !Number.isFinite(t)) return null
  return t > 1e12 ? t : t * 1000
}

function extractText(m: Record<string, unknown>): string {
  const body =
    typeof m.body === 'string'
      ? m.body
      : typeof m.text === 'string'
        ? m.text
        : typeof (m.message as Record<string, unknown> | undefined)?.conversation === 'string'
          ? String((m.message as Record<string, unknown>).conversation)
          : typeof (m._data as Record<string, unknown> | undefined)?.body === 'string'
            ? String((m._data as Record<string, unknown>).body)
            : ''
  return body.trim()
}

function isFromMe(m: Record<string, unknown>): boolean {
  if (m.fromMe === true) return true
  const key = m.key as Record<string, unknown> | undefined
  if (key?.fromMe === true) return true
  return false
}

function mapMessages(rows: unknown[]): ChatHistoryRow[] {
  const mapped = rows
    .filter((x) => x && typeof x === 'object')
    .map((x, idx) => {
      const m = x as Record<string, unknown>
      const text = extractText(m)
      const timestamp = extractTimestamp(m)
      const rawId = m.id ?? (m.key as Record<string, unknown> | undefined)?.id
      return {
        id: typeof rawId === 'string' && rawId.trim() ? rawId : `msg-${idx}-${timestamp ?? 'na'}`,
        text,
        timestamp,
        fromMe: isFromMe(m),
      } satisfies ChatHistoryRow
    })
    .filter((m) => m.text.length > 0)

  mapped.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  return mapped
}

function mergeById(rows: ChatHistoryRow[]): ChatHistoryRow[] {
  const seen = new Set<string>()
  const out: ChatHistoryRow[] = []
  for (const row of rows) {
    const key = row.id || `${row.timestamp ?? 0}:${row.text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  return out
}

async function fetchMessagesByChatId(
  sessionName: string,
  targetChatId: string,
  userId: string,
  maxMessages: number
): Promise<{ path: string; rows: unknown[] }> {
  const encS = encodeURIComponent(sessionName)
  const encChat = encodeURIComponent(targetChatId)
  const pageSize = Math.min(maxMessages, 100)
  const all: unknown[] = []
  let offset = 0

  while (all.length < maxMessages) {
    const path = `/api/${encS}/chats/${encChat}/messages?limit=${pageSize}&offset=${offset}&downloadMedia=false`
    const data = await wahaFetch<unknown>(path, { method: 'GET' }, { userId })
    const rows = unwrapMessagesPayload(data)
    if (!rows.length) {
      return { path, rows: all }
    }
    all.push(...rows)
    if (rows.length < pageSize) {
      return { path, rows: all }
    }
    offset += pageSize
  }

  return {
    path: `/api/${encS}/chats/${encChat}/messages?limit=${pageSize}&offset=${Math.max(0, offset - pageSize)}&downloadMedia=false`,
    rows: all.slice(0, maxMessages),
  }
}

// GET /api/customers/[id]/chat-history?limit=80
export async function GET(request: Request, context: Params) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await context.params
    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })
    }

    const url = new URL(request.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 80) || 80, 1), 800)

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('id', customerId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (custErr) {
      return NextResponse.json({ error: custErr.message }, { status: 500 })
    }
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    if (!customer.phone || !String(customer.phone).trim()) {
      return NextResponse.json(
        { error: 'Customer has no phone number; WhatsApp chat cannot be resolved.' },
        { status: 400 }
      )
    }

    const { data: sessionRow, error: sessionErr } = await supabase
      .from('waha_user_sessions')
      .select('session_name')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 })
    }
    if (!sessionRow?.session_name) {
      return NextResponse.json(
        { error: 'No WAHA session configured for your account.' },
        { status: 400 }
      )
    }

    const sessionName = String(sessionRow.session_name)
    const msisdn = normalizePhoneToMsisdn(String(customer.phone))
    const chatId = `${msisdn}@c.us`

    try {
      const fetched = await fetchWahaChatMessages(sessionName, chatId, user.id, Math.min(limit, 200))
      const candidateChatIds = [
        fetched.knownChatId,
        chatId,
        `${msisdn}@s.whatsapp.net`,
        fetched.resolvedLid,
      ].filter((v): v is string => typeof v === 'string' && v.trim().includes('@'))

      let bestRows = fetched.messages
      let bestPath = fetched.usedPath
      let bestChatId = chatId

      for (const candidate of [...new Set(candidateChatIds)]) {
        try {
          const page = await fetchMessagesByChatId(sessionName, candidate, user.id, limit)
          if (page.rows.length > bestRows.length) {
            bestRows = page.rows
            bestPath = page.path
            bestChatId = candidate
          }
        } catch (err) {
          if (
            err instanceof WahaApiError &&
            (err.status === 404 ||
              err.status === 405 ||
              (err.status === 500 &&
                /chat not found|chat_not_found|unknown chat|no chat/i.test(err.message)))
          ) {
            continue
          }
          throw err
        }
      }

      const messages = mergeById(mapMessages(bestRows))
      return NextResponse.json({
        chat_id: bestChatId,
        session: sessionName,
        waha_messages_path: bestPath,
        waha_resolved_lid: fetched.resolvedLid,
        waha_known_chat_id: fetched.knownChatId,
        messages,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'WAHA request failed'
      const status = e instanceof WahaApiError ? e.status : 502
      const attempts = e instanceof WahaApiError ? e.attempts ?? [] : []
      const lastPath = e instanceof WahaApiError ? e.path : undefined
      const resolvedLid = e instanceof WahaApiError ? e.resolvedLid ?? null : null
      const knownChatId = e instanceof WahaApiError ? e.knownChatId ?? null : null

      return NextResponse.json(
        {
          error: msg,
          hint:
            status === 404
              ? 'Chat messages API returned 404 on all tried routes. Check WAHA version and NOWEB store/sync settings.'
              : 'Unable to load chat messages from WAHA.',
          debug: {
            wahaHttpStatus: status,
            session: sessionName,
            chatId,
            lastPath,
            resolvedLid,
            knownChatId,
            attempts,
          },
        },
        { status: status >= 400 && status < 600 ? status : 502 }
      )
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

