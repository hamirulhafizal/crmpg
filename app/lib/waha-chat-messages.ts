import { wahaFetch, WahaApiError, type WahaAttempt } from '@/app/lib/waha'

/** WAHA: map phone (PN) → LID JID so chat/messages APIs find NOWEB threads keyed by @lid */
async function fetchWahaPnToLid(
  sessionName: string,
  msisdnDigits: string,
  userId: string
): Promise<string | null> {
  const encS = encodeURIComponent(sessionName)
  const pnPaths = [
    `/api/${encS}/lids/pn/${encodeURIComponent(msisdnDigits)}`,
    `/api/${encS}/lids/pn/${encodeURIComponent(`${msisdnDigits}@c.us`)}`,
    `/api/sessions/${encS}/lids/pn/${encodeURIComponent(msisdnDigits)}`,
  ]
  for (const path of pnPaths) {
    try {
      const data = await wahaFetch<unknown>(path, { method: 'GET' }, { userId })
      if (data && typeof data === 'object') {
        const lid = (data as Record<string, unknown>).lid
        if (typeof lid === 'string' && /@lid$/i.test(lid.trim())) return lid.trim()
      }
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
      return null
    }
  }
  return null
}

type WahaChatOverviewRow = { id?: string; name?: string; picture?: string | null }

/**
 * Discover a chat that WAHA already knows in its chat store.
 * Important: `lids/pn` mapping doesn't guarantee message API availability.
 */
async function resolveExistingChatId(
  sessionName: string,
  userId: string,
  candidateIds: string[]
): Promise<string | null> {
  const encS = encodeURIComponent(sessionName)
  const filtered = candidateIds.map((x) => x.trim()).filter(Boolean)
  if (filtered.length === 0) return null
  const qs = filtered.map((id) => `ids=${encodeURIComponent(id)}`).join('&')
  const paths = [
    `/api/${encS}/chats/overview?limit=50&offset=0&${qs}`,
    `/api/${encS}/chats?limit=100&offset=0&${qs}`,
  ]
  for (const path of paths) {
    try {
      const data = await wahaFetch<unknown>(path, { method: 'GET' }, { userId })
      const rows = Array.isArray(data) ? (data as WahaChatOverviewRow[]) : []
      const id = rows.find((r) => typeof r?.id === 'string' && r.id.trim())?.id?.trim()
      if (id) return id
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
      return null
    }
  }
  return null
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

function buildMessageFetchCandidates(
  sessionName: string,
  chatId: string,
  limit: number,
  lidChatId: string | null,
  knownChatId: string | null
): string[] {
  const lim = Math.min(Math.max(limit, 1), 200)
  const encSession = encodeURIComponent(sessionName)
  const encChat = encodeURIComponent(chatId)
  const msisdn = chatId.replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, '')
  const encChatC = encodeURIComponent(`${msisdn}@c.us`)
  const encChatS = encodeURIComponent(`${msisdn}@s.whatsapp.net`)
  const encLid =
    lidChatId && /@lid$/i.test(lidChatId.trim()) ? encodeURIComponent(lidChatId.trim()) : null
  const L = encodeURIComponent(String(lim))

  const encKnown =
    knownChatId && knownChatId.includes('@') ? encodeURIComponent(knownChatId.trim()) : null
  const encChats = [
    ...new Set([...(encKnown ? [encKnown] : []), encChat, encChatC, encChatS, ...(encLid ? [encLid] : [])]),
  ]

  const ordered: string[] = []
  for (const ec of encChats) {
    ordered.push(`/api/${encSession}/chats/${ec}/messages?limit=${L}`)
    ordered.push(`/api/${encSession}/chats/${ec}/messages/?limit=${L}`)
    ordered.push(`/api/${encSession}/chats/${ec}/messages?limit=${L}&downloadMedia=false`)
    ordered.push(`/api/sessions/${encSession}/chats/${ec}/messages?limit=${L}`)
    ordered.push(`/api/sessions/${encSession}/chats/${ec}/messages/?limit=${L}`)
  }
  const seen = new Set<string>()
  return ordered.filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
}

/** WAHA often returns 500 + chat_not_found for wrong JID suffix; same as 404 for our retry loop */
function isRetryableChatIdOrRouteFailure(e: WahaApiError): boolean {
  if (e.status === 404 || e.status === 405) return true
  if (e.status !== 500) return false
  const m = e.message.toLowerCase()
  if (m.includes('chat not found')) return true
  if (m.includes('chat_not_found')) return true
  if (m.includes('unknown chat')) return true
  if (m.includes('no chat')) return true
  return false
}

/**
 * Fetch chat messages from WAHA; resolves PN→LID when supported, then tries many URLs
 * (404/405 and some 500 chat-not-found → next path).
 */
export async function fetchWahaChatMessages(
  sessionName: string,
  chatId: string,
  userId: string,
  limit: number
): Promise<{
  messages: unknown[]
  usedPath: string | null
  resolvedLid: string | null
  knownChatId: string | null
}> {
  const msisdn = chatId.replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, '')
  const resolvedLid = await fetchWahaPnToLid(sessionName, msisdn, userId)
  const knownChatId = await resolveExistingChatId(sessionName, userId, [
    `${msisdn}@c.us`,
    `${msisdn}@s.whatsapp.net`,
    msisdn,
    ...(resolvedLid ? [resolvedLid] : []),
  ])
  const candidates = buildMessageFetchCandidates(
    sessionName,
    chatId,
    limit,
    resolvedLid,
    knownChatId
  )
  let lastErr: unknown
  const attempts: WahaAttempt[] = []

  for (const path of candidates) {
    try {
      const data = await wahaFetch<unknown>(path, { method: 'GET' }, { userId })
      const rows = unwrapMessagesPayload(data)
      return { messages: rows, usedPath: path, resolvedLid, knownChatId }
    } catch (e) {
      lastErr = e
      if (e instanceof WahaApiError) {
        e.resolvedLid = resolvedLid
        e.knownChatId = knownChatId
        attempts.push({ path: e.path, status: e.status, message: e.message })
        e.attempts = attempts
        if (isRetryableChatIdOrRouteFailure(e)) continue
      }
      throw e
    }
  }
  if (lastErr instanceof WahaApiError) {
    lastErr.attempts = attempts
    lastErr.resolvedLid = resolvedLid
    lastErr.knownChatId = knownChatId
    throw lastErr
  }
  if (lastErr) throw lastErr
  return { messages: [], usedPath: null, resolvedLid, knownChatId }
}

function extractTimestamp(m: Record<string, unknown>): number {
  const t =
    m.timestamp ??
    m.msgTimestamp ??
    m.t ??
    (m.message as Record<string, unknown> | undefined)?.timestamp ??
    m.serverTimestamp
  if (typeof t === 'number' && Number.isFinite(t)) {
    return t > 1e12 ? t : t * 1000
  }
  return 0
}

function extractBody(m: Record<string, unknown>): string {
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
  const k = m.key as Record<string, unknown> | undefined
  if (k?.fromMe === true) return true
  return false
}

/** Sort ascending by time; format compact transcript for LLM. */
export function formatChatTranscriptForLlm(messages: unknown[], maxChars: number): string {
  const rows = messages.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  const sorted = [...rows].sort((a, b) => extractTimestamp(a) - extractTimestamp(b))

  const lines: string[] = []
  for (const m of sorted) {
    const text = extractBody(m)
    if (!text) continue
    const role = isFromMe(m) ? 'Agent' : 'Customer'
    lines.push(`${role}: ${text}`)
  }

  let out = lines.join('\n')
  if (out.length > maxChars) {
    out = '...[older messages omitted]\n' + out.slice(out.length - maxChars + 40)
  }
  return out
}
