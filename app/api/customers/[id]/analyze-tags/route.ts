import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { fetchWahaChatMessages, formatChatTranscriptForLlm } from '@/app/lib/waha-chat-messages'
import { WahaApiError } from '@/app/lib/waha'

type Params = { params: Promise<{ id: string }> }

type TagFlat = {
  id: string
  slug: string
  label: string
  category_id: string
}

function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_SECRET_KEY or OPENAI_API_KEY is not configured')
  }
  const baseURL = process.env.BASE_URL_OPENAI?.trim()
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
}

function buildCatalogPrompt(
  categories: { id: string; key: string; name: string; allows_multiple: boolean }[],
  tags: TagFlat[]
): string {
  const lines: string[] = []
  for (const c of categories) {
    const inCat = tags.filter((t) => t.category_id === c.id)
    lines.push(
      `Category key: "${c.key}" (${c.name}). allows_multiple: ${c.allows_multiple}. Valid slugs: ${inCat.map((t) => `"${t.slug}" (${t.label})`).join(', ') || '(none)'}`
    )
  }
  return lines.join('\n')
}

function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function originalDataString(
  original: Record<string, unknown> | null,
  key: string
): string | null {
  if (!original) return null
  const v = original[key]
  if (v == null) return null
  const s = String(v).trim()
  return s !== '' ? s : null
}

function formatCustomerRecordForPrompt(row: {
  created_at: string | null
  last_purchase_at: string | null
  is_married: boolean | null
  original_data: Record<string, unknown> | null
}): string {
  const od = row.original_data
  const dateRegister = originalDataString(od, 'Date Register')
  const lastPurchaseFromOriginal = originalDataString(od, 'Last Purchase Date')

  const registered =
    dateRegister ??
    (row.created_at != null && String(row.created_at).trim() !== ''
      ? new Date(row.created_at).toISOString().slice(0, 10)
      : 'unknown')

  const lastPurchase =
    lastPurchaseFromOriginal ??
    (row.last_purchase_at != null && String(row.last_purchase_at).trim() !== ''
      ? new Date(row.last_purchase_at).toISOString().slice(0, 19) + 'Z'
      : 'none recorded in CRM')

  const married =
    row.is_married === true ? 'yes' : row.is_married === false ? 'no' : 'unknown'
  return `Known CRM fields for this customer (use with the transcript; prefer chat evidence when it clearly updates or contradicts stale profile data). Date registered and last purchase prefer Public Gold \`original_data\` when present.
- Date registered: ${registered}
- Last purchase at: ${lastPurchase}
- Married (profile field): ${married}`
}

/**
 * POST /api/customers/[id]/analyze-tags
 * Fetch WAHA chat → LLM → replace all CRM tags with AI result (`source=ai`).
 */
export async function POST(request: Request, context: Params) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth

    const { id: customerId } = await context.params
    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })
    }

    const maxMsgs = Math.min(
      Math.max(Number(process.env.ANALYZE_TAG_MAX_MESSAGES || 80) || 80, 1),
      200
    )
    const maxChars = Math.min(
      Math.max(Number(process.env.ANALYZE_TAG_MAX_TRANSCRIPT_CHARS || 14000) || 14000, 2000),
      100000
    )
    const model = process.env.OPENAI_MODEL_TAG_ANALYSIS?.trim() || 'gpt-4o-mini'

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, phone, created_at, last_purchase_at, is_married, original_data')
      .eq('id', customerId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (custErr) {
      console.error('analyze-tags customer:', custErr)
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
    const chatId = `${normalizePhoneToMsisdn(String(customer.phone))}@c.us`

    let messages: unknown[] = []
    let wahaPathUsed: string | null = null
    let wahaResolvedLid: string | null = null
    let wahaKnownChatId: string | null = null
    try {
      const fetched = await fetchWahaChatMessages(sessionName, chatId, user.id, maxMsgs)
      messages = fetched.messages
      wahaPathUsed = fetched.usedPath
      wahaResolvedLid = fetched.resolvedLid
      wahaKnownChatId = fetched.knownChatId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'WAHA request failed'
      const status = e instanceof WahaApiError ? e.status : 502
      const attempts = e instanceof WahaApiError ? e.attempts ?? [] : []
      const lastPath = e instanceof WahaApiError ? e.path : undefined
      const resolvedLidFromErr = e instanceof WahaApiError ? e.resolvedLid ?? null : null
      const knownChatIdFromErr = e instanceof WahaApiError ? e.knownChatId ?? null : null

      console.error('analyze-tags waha messages:', {
        status,
        lastPath,
        resolvedLid: resolvedLidFromErr,
        knownChatId: knownChatIdFromErr,
        attempts,
        err: e instanceof Error ? e.stack ?? e.message : e,
      })

      const lower = msg.toLowerCase()
      const isChatMissing =
        lower.includes('chat not found') ||
        lower.includes('chat_not_found') ||
        lower.includes('unknown chat')

      const hint = isChatMissing
        ? resolvedLidFromErr
          ? `WAHA mapped this number to LID ${resolvedLidFromErr}, but messages could still not be loaded. Confirm NOWEB store/sync and WAHA version; the chat may not exist on this session yet.`
          : 'WAHA has no chat thread for this number on this session. Open or send a message to this contact from WhatsApp on that session first, confirm the phone (country code) matches WhatsApp, and check NOWEB store / sync if history should already exist.'
        : status === 404
          ? resolvedLidFromErr && !knownChatIdFromErr
            ? 'WAHA resolved PN→LID, but no existing chat entry was found. In WAHA Chats API, message history still requires an existing chat in store (typically c.us/g.us in overview). Open a chat or send one message from that session, then retry.'
            : 'Chat messages API returned 404 on all tried routes. Check WAHA version (messages API may require WAHA Plus / correct engine), enable NOWEB store & sync, and that this chat exists on the session.'
          : status === 524 || status === 504
            ? 'Cloudflare or WAHA timed out waiting for chat history (often heavy chats or a slow host). Retry, lower ANALYZE_TAG_MAX_MESSAGES, increase WAHA/reverse-proxy timeouts, or raise WAHA_FETCH_TIMEOUT_MS if cutting off too early.'
            : status === 408
              ? `Request hit the client timeout (see WAHA_FETCH_TIMEOUT_MS, default 90s).`
              : 'Ensure WAHA session is online and GET chat messages is enabled for your server.'

      const httpStatus = isChatMissing
        ? 400
        : status >= 400 && status < 600
          ? status
          : 502

      return NextResponse.json(
        {
          error: msg,
          hint,
          debug: {
            wahaHttpStatus: status,
            session: sessionName,
            chatId,
            lastPath,
            resolvedLid: resolvedLidFromErr,
            knownChatId: knownChatIdFromErr,
            attempts,
          },
        },
        { status: httpStatus }
      )
    }

    const transcript = formatChatTranscriptForLlm(messages, maxChars)
    if (!transcript.trim()) {
      return NextResponse.json(
        {
          error: 'No readable chat text found.',
          hint: 'Send a few WhatsApp messages with this contact first, or check WAHA NOWEB store / sync settings.',
        },
        { status: 400 }
      )
    }

    const { data: categories, error: catErr } = await supabase
      .from('tag_categories')
      .select('id, key, name, allows_multiple')
      .order('sort_order', { ascending: true })

    const { data: tagRows, error: tagErr } = await supabase
      .from('tags')
      .select('id, slug, label, category_id')
      .order('sort_order', { ascending: true })

    if (catErr || tagErr) {
      console.error('analyze-tags catalog:', catErr || tagErr)
      return NextResponse.json({ error: 'Failed to load tag catalog' }, { status: 500 })
    }

    const cats = categories || []
    const tags = (tagRows || []) as TagFlat[]
    const categoryKeyById = new Map(cats.map((c) => [c.id, c.key]))
    if (cats.length === 0 || tags.length === 0) {
      return NextResponse.json(
        { error: 'Tag catalog is empty. Ask an admin to configure tags first.' },
        { status: 400 }
      )
    }

    const catalogBlock = buildCatalogPrompt(
      cats.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        allows_multiple: c.allows_multiple,
      })),
      tags.map((t) => ({ id: t.id, slug: t.slug, label: t.label, category_id: t.category_id }))
    )

    let openai: OpenAI
    try {
      openai = createOpenAIClient()
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'OpenAI client misconfigured' },
        { status: 500 }
      )
    }

    const customerRecordBlock = formatCustomerRecordForPrompt({
      created_at: customer.created_at ?? null,
      last_purchase_at: customer.last_purchase_at ?? null,
      is_married: customer.is_married ?? null,
      original_data:
        customer.original_data != null && typeof customer.original_data === 'object'
          ? (customer.original_data as Record<string, unknown>)
          : null,
    })
    

    const systemPrompt = `You are a CRM assistant for gold/jewellery dealers (Public Gold style). Read the WhatsApp transcript and assign segmentation tags ONLY from the allowed catalog below.

${customerRecordBlock}

Rules:
- Output valid JSON only (no markdown).
- Use keys "assignments" (array), "rationale_ms" (Malay, short), "rationale_en" (English, short).
- Each assignment must be {"category_key":"<category key from catalog>","slug":"<exact slug from that category>"}.
- For categories with allows_multiple false, output at most ONE assignment for that category_key.
- For categories with allows_multiple true, you may output multiple assignments with different slugs.
- This run replaces ALL CRM tags for the customer with your assignments only — include every category you can infer from the chat; skip only categories with no evidence.
- Slugs must match exactly one of the listed slugs (lowercase with underscores).

Catalog:
${catalogBlock}`

    const userPrompt = `WhatsApp transcript (oldest to newest):\n\n${transcript}`

    console.log('systemPrompt:-->', systemPrompt)
    console.log('userPrompt:-->', userPrompt)

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from language model' }, { status: 502 })
    }

    let parsed: {
      assignments?: { category_key?: string; slug?: string }[]
      rationale_ms?: string
      rationale_en?: string
    }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Model returned non-JSON' }, { status: 502 })
    }

    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : []

    const resolvedIds: string[] = []
    const skipped: string[] = []
    const seenExclusiveCategory = new Set<string>()
    const allowsMultipleByCategoryId = new Map(cats.map((c) => [c.id, c.allows_multiple]))

    for (const a of assignments) {
      const ck =
        typeof a.category_key === 'string' ? a.category_key.trim().toLowerCase() : ''
      const slug = typeof a.slug === 'string' ? normalizeSlug(a.slug) : ''
      if (!ck || !slug) continue

      const tag = tags.find((t) => categoryKeyById.get(t.category_id) === ck && t.slug === slug)
      if (!tag) {
        skipped.push(`${ck}/${slug}`)
        continue
      }

      const multi = allowsMultipleByCategoryId.get(tag.category_id)
      if (multi === false) {
        if (seenExclusiveCategory.has(tag.category_id)) continue
        seenExclusiveCategory.add(tag.category_id)
      }

      resolvedIds.push(tag.id)
    }

    const uniqueResolved = [...new Set(resolvedIds)]

    const { error: delAllErr } = await supabase
      .from('customer_tags')
      .delete()
      .eq('customer_id', customerId)

    if (delAllErr) {
      console.error('analyze-tags delete all:', delAllErr)
      return NextResponse.json({ error: delAllErr.message }, { status: 500 })
    }

    const inserts = uniqueResolved.map((tag_id) => ({
      customer_id: customerId,
      tag_id,
      user_id: user.id,
      source: 'ai' as const,
    }))

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from('customer_tags').insert(inserts)
      if (insErr) {
        console.error('analyze-tags insert:', insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      applied_tag_ids: uniqueResolved,
      skipped_unknown: skipped,
      rationale_ms: typeof parsed.rationale_ms === 'string' ? parsed.rationale_ms : null,
      rationale_en: typeof parsed.rationale_en === 'string' ? parsed.rationale_en : null,
      model,
      chat_id: chatId,
      session: sessionName,
      waha_messages_path: wahaPathUsed,
      waha_resolved_lid: wahaResolvedLid,
      waha_known_chat_id: wahaKnownChatId,
      transcript_chars: transcript.length,
    })
  } catch (e: unknown) {
    console.error('analyze-tags:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
