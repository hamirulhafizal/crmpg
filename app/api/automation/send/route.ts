import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { getWahaConfig, wahaFetch } from '@/app/lib/waha'
import {
  formatLastPurchaseForTemplate,
  formatRegistrationForTemplate,
  getAccountStatusKey,
  getLastPurchaseUtcMonthDate,
  getRegistrationUtcMonthDate,
} from '@/app/lib/customer-account-status'
import { normalizedScheduledTitle } from '@/app/lib/scheduled-automation-titles'

const BATCH_SIZE = 20
const WARMUP_MESSAGE_MARKER = '__WARMUP_ENABLED__\n'
const SESSION_EXPIRED_NOTICE_COOLDOWN_MS = 12 * 60 * 60 * 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function randomDelayBetween(minMs: number, maxMs: number) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await sleep(delay)
}

// Service-role Supabase client so this worker can bypass RLS safely.
// Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Basic customer type for template rendering
interface Customer {
  id: string
  user_id: string
  name: string | null
  dob: string | null
  email: string | null
  phone: string | null
  location: string | null
  gender: string | null
  ethnicity: string | null
  age: number | null
  prefix: string | null
  first_name: string | null
  sender_name: string | null
  save_name: string | null
  pg_code: string | null
  original_data?: unknown
  created_at?: string | null
  last_purchase_at?: string | null
  is_monthly_buyer?: boolean | null
}

interface ScheduledMessageRow {
  id: string
  user_id: string
  title: string | null
  phone: string
  message: string
  scheduled_at: string
  status: string
}

interface EmailFallbackConfig {
  fromEmail: string
  appPassword: string
  gmailTemplate: string | null
}

interface WahaSessionInfo {
  name: string
  status?: string
}

interface WahaUserSessionRow {
  user_id: string
  session_name: string
  last_known_waha_status?: string | null
  session_expired_notified_at?: string | null
}

function isMissingIsEnableColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('is_enable') && msg.includes('does not exist')
}

function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('does not exist')
}

function renderCustomerTemplate(template: string, customer: Customer): string {
  if (!template) return ''

  const lastPurchase = formatLastPurchaseForTemplate(customer)
  const registration = formatRegistrationForTemplate(
    customer.original_data,
    customer.created_at ?? undefined
  )

  // Map variables from customer record
  return template
    .replace(/{Name}/g, customer.name || '')
    .replace(/{DOB}/g, customer.dob || '')
    .replace(/{Email}/g, customer.email || '')
    .replace(/{Phone}/g, customer.phone || '')
    .replace(/{Location}/g, customer.location || '')
    .replace(/{Gender}/g, customer.gender || '')
    .replace(/{Ethnicity}/g, customer.ethnicity || '')
    .replace(/{Age}/g, customer.age != null ? String(customer.age) : '')
    .replace(/{Prefix}/g, customer.prefix || '')
    .replace(/{FirstName}/g, customer.first_name || '')
    .replace(/{SenderName}/g, customer.sender_name || customer.name || '')
    .replace(/{SaveName}/g, customer.save_name || '')
    .replace(/{PGCode}/g, customer.pg_code || '')
    .replace(/{LastPurchaseDate}/g, lastPurchase)
    .replace(/{RegistrationDate}/g, registration)
}

function humanizeWhatsAppText(input: string): string {
  // Conservative "humanization" to reduce identical-looking automation.
  // - Add occasional extra spaces between words.
  // - Add occasional '.' variation at end of sentences ('.' -> '..'/'...').
  const extraSpaceBetweenWordsProbability = 0.25

  let text = input.replace(/(\S) (\S)/g, (match, a: string, b: string) => {
    const twoSpaces = Math.random() < extraSpaceBetweenWordsProbability
    return `${a}${twoSpaces ? '  ' : ' '}${b}`
  })

  // Only extend single '.' that are sentence-ending (followed by whitespace/end).
  // We avoid touching '...' by ensuring the next char is NOT another '.'.
  const extendDoubleProbability = 0.12 // '.' -> '..'
  const extendTripleProbability = 0.03 // '.' -> '...'

  text = text.replace(/(?<!\.)(\.)(?!\.)(\s*($|\n))/g, (match, dot: string, ws: string) => {
    const r = Math.random()
    if (r < extendTripleProbability) return `${dot}..${ws}`
    if (r < extendDoubleProbability + extendTripleProbability) return `${dot}.${ws}`
    return match
  })

  return text
}

async function sendWhatsAppMessage(session: string, phone: string, text: string) {
  const digits = normalisePhoneToMsisdn(phone)
  const chatId = `${digits}@c.us`
  const humanText = humanizeWhatsAppText(text)

  // WAHA "human-like" typing indicators.
  // These should never block the actual send; if typing endpoints fail,
  // we still proceed with sending the text.
  const baseDelayMs = 900
  const perCharExtraMs = 6
  const maxDelayMs = 2600
  const computed = baseDelayMs + Math.min(humanText.length, 250) * perCharExtraMs
  const typingDelayMs = Math.max(baseDelayMs, Math.min(maxDelayMs, computed))
  const minTyping = Math.max(400, Math.floor(typingDelayMs * 0.8))
  const maxTyping = Math.max(minTyping + 50, Math.floor(typingDelayMs * 1.1))

  try {
    await wahaFetch('/api/startTyping', {
      method: 'POST',
      body: JSON.stringify({
        session,
        chatId,
      }),
    })
  } catch (e) {
    console.warn('startTyping failed; continuing with sendText:', e)
  }

  await randomDelayBetween(minTyping, maxTyping)

  try {
    await wahaFetch('/api/stopTyping', {
      method: 'POST',
      body: JSON.stringify({
        session,
        chatId,
      }),
    })
  } catch (e) {
    console.warn('stopTyping failed; continuing with sendText:', e)
  }

  await wahaFetch('/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      session,
      chatId,
      text: humanText,
    }),
  })
}

function normalisePhoneToMsisdn(phone: string): string {
  // Normalise phone: keep digits only, ensure 60 prefix, add @c.us
  let digits = phone.replace(/[^0-9]/g, '')
  if (!digits.startsWith('60')) {
    if (digits.startsWith('0')) {
      digits = `60${digits.slice(1)}`
    } else {
      digits = `60${digits}`
    }
  }

  return digits
}

/** WAHA `/api/contacts/check-exists` result — same auth as `wahaFetch`. */
type WhatsAppContactCheck =
  | { ok: true; numberExists: boolean }
  | { ok: false; reason: string }

async function checkWhatsAppNumberExists(session: string, phone: string): Promise<WhatsAppContactCheck> {
  const { baseUrl, apiKey } = getWahaConfig()
  if (!baseUrl || !apiKey) {
    console.warn('WAHA_API_BASE_URL or WAHA_API_KEY missing; contact check unavailable')
    return { ok: false, reason: 'waha_not_configured' }
  }

  try {
    const digits = normalisePhoneToMsisdn(phone)
    const url = `${baseUrl}/api/contacts/check-exists?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(session)}`

    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    })

    if (!res.ok) {
      console.error('WhatsApp contact check HTTP error:', res.status)
      return { ok: false, reason: `http_${res.status}` }
    }

    const data: unknown = await res.json().catch(() => null)
    const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
    if (rec && typeof rec.numberExists === 'boolean') {
      return { ok: true, numberExists: rec.numberExists }
    }

    console.error('WhatsApp contact check: unexpected response shape')
    return { ok: false, reason: 'bad_response' }
  } catch (err) {
    console.error('WhatsApp contact check failed:', err)
    return { ok: false, reason: 'network_or_fetch' }
  }
}

function pickGmailAppPassword(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null
  const a = row.gmail_app_password
  const b = row.gmaill_app_password
  const raw = (typeof a === 'string' ? a : typeof b === 'string' ? b : '').trim()
  return raw.length > 0 ? raw : null
}

async function getEmailFallbackConfig(userId: string): Promise<EmailFallbackConfig | null> {
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('waha_user_sessions')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (sessionError || !sessionRow) {
    return null
  }

  const row = sessionRow as Record<string, unknown>
  const appPassword = pickGmailAppPassword(row)
  if (!appPassword) {
    return null
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) {
    return null
  }

  const gmailTemplate =
    typeof row.gmail_message === 'string' ? row.gmail_message : row.gmail_message != null ? String(row.gmail_message) : null

  return {
    fromEmail: data.user.email,
    appPassword,
    gmailTemplate,
  }
}

async function sendEmailFallback(userId: string, customer: Customer, text: string): Promise<boolean> {
  if (!customer.email) return false

  const cfg = await getEmailFallbackConfig(userId)
  if (!cfg) return false

  if (!cfg.gmailTemplate || cfg.gmailTemplate.trim().length === 0) {
    // No Gmail template configured; nothing to send.
    return false
  }

  const renderedText = renderCustomerTemplate(cfg.gmailTemplate, customer)

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: cfg.fromEmail,
        pass: cfg.appPassword,
      },
    })

    await transporter.sendMail({
      from: cfg.fromEmail,
      to: customer.email,
      subject: 'Public Gold',
      text: renderedText,
    })

    return true
  } catch (err) {
    console.error('Error sending fallback email:', err)
    return false
  }
}

function isExpiredWahaSessionStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').trim().toUpperCase()
  return normalized === 'STOPPED' || normalized === 'FAILED'
}

function normalizeWahaStatus(status: string | null | undefined): string {
  return (status || '').trim().toUpperCase()
}

function shouldSendExpiredNotice(
  previousStatus: string | null | undefined,
  currentStatus: string | null | undefined,
  lastNotifiedAt: string | null | undefined
): boolean {
  if (!isExpiredWahaSessionStatus(currentStatus)) return false
  if (!isExpiredWahaSessionStatus(previousStatus)) return true
  if (!lastNotifiedAt) return true

  const last = Date.parse(lastNotifiedAt)
  if (Number.isNaN(last)) return true

  return Date.now() - last >= SESSION_EXPIRED_NOTICE_COOLDOWN_MS
}

async function sendWahaSessionExpiredNotice(userId: string, sessionName: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) {
    console.error('Unable to load user email for WAHA expiry notice:', error)
    return false
  }

  const smtpUser = process.env.GMAIL_USER
  const smtpPass = process.env.GMAIL_PASS
  if (!smtpUser || !smtpPass) {
    console.error('GMAIL_USER/GMAIL_PASS missing; cannot send WAHA expiry notice email')
    return false
  }

  const loginUrl = 'https://crmpg.vercel.app/login?next=%2Fwaha-integration'

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    await transporter.sendMail({
      from: smtpUser,
      to: data.user.email,
      subject: 'CRMPG - Action needed: WAHA session expired',
      text: [
        'Your WAHA session is no longer active and needs to be reconnected.',
        '',
        `Session: ${sessionName}`,
        '',
        'Please log in and rescan your WAHA QR code here:',
        loginUrl,
      ].join('\n'),
    })

    return true
  } catch (err) {
    console.error('Failed to send WAHA session expired notice email:', err)
    return false
  }
}

// Use GET so you can call this via an HTTP GET (e.g. from Supabase cron if you switch to net.http_get).
// The logic is identical; only the HTTP verb changes.
export async function GET(request: Request) {

  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET 

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('triggering send---->')

  try {
    const supabase = supabaseAdmin
    const nowIso = new Date().toISOString()

    // Some environments may lag schema changes (or point to a different DB).
    // Probe once so cron can still run even if `is_enable` is unavailable.
    let supportsIsEnable = true
    const { error: isEnableProbeError } = await supabase
      .from('scheduled_messages')
      .select('id, is_enable')
      .limit(1)
    if (isMissingIsEnableColumn(isEnableProbeError || undefined)) {
      supportsIsEnable = false
      console.warn(
        'scheduled_messages.is_enable is unavailable in this environment; proceeding without enable filter'
      )
    } else if (isEnableProbeError) {
      console.warn('Unable to verify is_enable support:', isEnableProbeError)
    }


    // 1. Get due, pending, unlocked scheduled messages
    let fetchQuery = supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .is('locked_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE)
    if (supportsIsEnable) {
      // Treat NULL as enabled for backward compatibility when the column was newly added.
      fetchQuery = fetchQuery.or('is_enable.eq.true,is_enable.is.null')
    }
    let { data: due, error: fetchError } = await fetchQuery

    if (fetchError && isMissingIsEnableColumn(fetchError || undefined)) {
      supportsIsEnable = false
      console.warn(
        'Fetch query referenced scheduled_messages.is_enable but column is missing; retrying without enable filter'
      )
      const retry = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', nowIso)
        .is('locked_at', null)
        .order('scheduled_at', { ascending: true })
        .limit(BATCH_SIZE)
      due = retry.data
      fetchError = retry.error
    }


    if (fetchError) {
      console.error('Error fetching scheduled messages:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!due || due.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
      })
    }
    
    const ids = due.map((m: any) => m.id)

    // 2. Lock rows to avoid duplicate processing
    const lockIso = new Date().toISOString()
    let lockQuery = supabase
      .from('scheduled_messages')
      .update({ locked_at: lockIso })
      .in('id', ids)
      .eq('status', 'pending')
      .is('locked_at', null)
      .select('id')
    if (supportsIsEnable) {
      // Keep the same NULL=enabled semantics as the fetch query.
      lockQuery = lockQuery.or('is_enable.eq.true,is_enable.is.null')
    }
    let { data: lockedRows, error: lockError } = await lockQuery

    if (lockError && isMissingIsEnableColumn(lockError || undefined)) {
      supportsIsEnable = false
      console.warn(
        'Lock query referenced scheduled_messages.is_enable but column is missing; retrying without enable filter'
      )
      const retry = await supabase
        .from('scheduled_messages')
        .update({ locked_at: lockIso })
        .in('id', ids)
        .eq('status', 'pending')
        .is('locked_at', null)
        .select('id')
      lockedRows = retry.data
      lockError = retry.error
    }

    if (lockError) {
      console.error('Error locking scheduled messages:', lockError)
      // Do not continue with unlocked rows; this can cause duplicate sends
      // when another worker run successfully locks/processes the same rows.
      return NextResponse.json({ error: 'Failed to lock scheduled messages' }, { status: 500 })
    }

    // 3. Resolve WAHA sessions per user so we know which session to send from.
    const lockedIdSet = new Set((lockedRows || []).map((r) => r.id))
    const dueToProcess = (due as ScheduledMessageRow[]).filter((r) => lockedIdSet.has(r.id))

    if (dueToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
      })
    }

    const userIds = Array.from(new Set((dueToProcess as any[]).map((m) => m.user_id))) as string[]
    let supportsSessionExpiryTracking = true
    let sessionRows: WahaUserSessionRow[] | null = null
    let sessionError: { code?: string; message?: string } | null = null

    const sessionQuery = await supabase
      .from('waha_user_sessions')
      .select('user_id, session_name, last_known_waha_status, session_expired_notified_at')
      .in('user_id', userIds)
    sessionRows = sessionQuery.data as WahaUserSessionRow[] | null
    sessionError = sessionQuery.error as { code?: string; message?: string } | null

    if (sessionError && isMissingColumn(sessionError || undefined)) {
      supportsSessionExpiryTracking = false
      const retry = await supabase
        .from('waha_user_sessions')
        .select('user_id, session_name')
        .in('user_id', userIds)
      sessionRows = retry.data as WahaUserSessionRow[] | null
      sessionError = retry.error as { code?: string; message?: string } | null
    }

    if (sessionError) {
      console.error('Error fetching WAHA sessions for users:', sessionError)
    }

    const sessionByUser = new Map<string, WahaUserSessionRow>()
    for (const s of (sessionRows || []) as WahaUserSessionRow[]) {
      if (!sessionByUser.has(s.user_id) && s.session_name) {
        sessionByUser.set(s.user_id, s)
      }
    }

    const usersWithExpiredSession = new Set<string>()
    const usersToNotifyExpiredSession: Array<{ userId: string; sessionName: string }> = []
    for (const [userId, sessionRow] of sessionByUser.entries()) {
      const sessionName = sessionRow.session_name
      try {
        const waSession = await wahaFetch<WahaSessionInfo>(
          `/api/sessions/${encodeURIComponent(sessionName)}`
        )
        const currentStatus = normalizeWahaStatus(waSession?.status)
        if (isExpiredWahaSessionStatus(currentStatus)) {
          usersWithExpiredSession.add(userId)
        }

        const notifyNow = shouldSendExpiredNotice(
          sessionRow.last_known_waha_status,
          currentStatus,
          sessionRow.session_expired_notified_at
        )
        if (notifyNow) {
          usersToNotifyExpiredSession.push({ userId, sessionName })
        }

        if (supportsSessionExpiryTracking) {
          const updatePayload: Record<string, string | null> = {
            last_known_waha_status: currentStatus || null,
          }
          if (notifyNow) {
            updatePayload.session_expired_notified_at = new Date().toISOString()
          }

          const { error: trackErr } = await supabase
            .from('waha_user_sessions')
            .update(updatePayload)
            .eq('user_id', userId)
            .eq('session_name', sessionName)

          if (trackErr) {
            console.error('Failed updating WAHA session status tracking:', userId, sessionName, trackErr)
          }
        }
      } catch (waErr) {
        console.error(
          'Unable to load WAHA session status from WAHA API:',
          sessionName,
          waErr
        )
      }
    }

    if (usersWithExpiredSession.size > 0) {
      for (const item of usersToNotifyExpiredSession) {
        await sendWahaSessionExpiredNotice(item.userId, item.sessionName)
      }

      const blockedIds = dueToProcess
        .filter((row) => usersWithExpiredSession.has(row.user_id))
        .map((row) => row.id)
      if (blockedIds.length > 0) {
        await supabase
          .from('scheduled_messages')
          .update({ locked_at: null })
          .in('id', blockedIds)
      }
    }

    const processableRows = dueToProcess.filter((row) => !usersWithExpiredSession.has(row.user_id))

    if (processableRows.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        skippedExpiredSessions: dueToProcess.length,
      })
    }

    let sent = 0
    let failed = 0

    // Compute "today" in Malaysia time (UTC+8) so birthdays follow local date,
    // not pure UTC (which would appear as "yesterday" for late-night runs).
    const nowForTz = new Date()
    const MALAYSIA_OFFSET_MINUTES = 8 * 60
    const localTzNow = new Date(nowForTz.getTime() + MALAYSIA_OFFSET_MINUTES * 60 * 1000)
    const todayMonth = localTzNow.getUTCMonth()
    const todayDate = localTzNow.getUTCDate()

    for (const row of processableRows as ScheduledMessageRow[]) {
      try {
        const title = normalizedScheduledTitle(row.title)
        const hasPhone = !!row.phone && row.phone.trim() !== ''
        const isDailyRecurringAutomation =
          title === 'birthday' ||
          // title === 'inactive follow-up' ||
          title === 'free account follow-up'

        const session = sessionByUser.get(row.user_id)
        const sessionName = session?.session_name
        if (!sessionName) {
          console.warn('No WAHA session configured for user, skipping message row:', row.user_id, row.id)
          failed++
          continue
        }

        switch (title) {
          // Birthday automation: title contains "birthday" and phone is empty
          case 'birthday': {
            const { data: allCustomers, error: custError } = await supabase
              .from('customers')
              .select('*')
              .eq('user_id', row.user_id)
              .not('dob', 'is', null)
              .not('phone', 'is', null)

            if (custError) {
              console.error('Error fetching customers for birthday automation:', custError)
              failed++
              break
            }

            if (allCustomers && allCustomers.length > 0) {
              const todaysCustomers = (allCustomers as Customer[]).filter((c) => {
                if (!c.dob) return false
                const dob = new Date(c.dob)
                return dob.getUTCMonth() === todayMonth && dob.getUTCDate() === todayDate
              })

              console.log('todaysCustomers---->', todaysCustomers)

              for (const customer of todaysCustomers) {
                try {
                  // Add random delay (3–6 seconds) between customers
                  await randomDelayBetween(3000, 6000)

                  const message = renderCustomerTemplate(row.message, customer)

                  const contactCheck = await checkWhatsAppNumberExists(sessionName, customer.phone!)
                  const tryEmail = () => sendEmailFallback(row.user_id, customer, message)
                  const tryWa = () => sendWhatsAppMessage(sessionName, customer.phone!, message)

                  let birthdayDelivered = false
                  if (contactCheck.ok && contactCheck.numberExists) {
                    try {
                      await tryWa()
                      birthdayDelivered = true
                    } catch (sendErr) {
                      console.error(
                        'Error sending birthday WhatsApp message, attempting email fallback:',
                        sendErr
                      )
                      birthdayDelivered = await tryEmail()
                    }
                  } else if (contactCheck.ok && !contactCheck.numberExists) {
                    console.log('WhatsApp number not on WhatsApp; trying email first:', customer.id)
                    birthdayDelivered = await tryEmail()
                    if (!birthdayDelivered) {
                      try {
                        await tryWa()
                        birthdayDelivered = true
                      } catch {
                        birthdayDelivered = false
                      }
                    }
                  } else {
                    console.log(
                      'WhatsApp contact check unavailable; trying email first:',
                      customer.id,
                      !contactCheck.ok ? contactCheck.reason : ''
                    )
                    birthdayDelivered = await tryEmail()
                    if (!birthdayDelivered) {
                      try {
                        await tryWa()
                        birthdayDelivered = true
                      } catch (waErr) {
                        console.error('Birthday: email skipped/failed and WhatsApp failed:', waErr)
                        birthdayDelivered = false
                      }
                    }
                  }

                  if (birthdayDelivered) sent++
                  else failed++
                } catch (err) {
                  console.error('Error preparing birthday message:', err)
                  failed++
                }
              }
            }
            break
          }

          //case 'inactive follow-up':
          case 'free account follow-up': {
            const kind = 'free'

            const { data: sentRows, error: sentErr } = await supabaseAdmin
              .from('followup_campaign_sends')
              .select('customer_id')
              .eq('user_id', row.user_id)
              .eq('kind', kind)

            if (sentErr) {
              console.error('Error loading follow-up send log:', sentErr)
              failed++
              break
            }

            const alreadySent = new Set(
              (sentRows || []).map((r: { customer_id: string }) => r.customer_id)
            )

            const { data: allCustomers, error: custError } = await supabaseAdmin
              .from('customers')
              .select('*')
              .eq('user_id', row.user_id)
              .not('phone', 'is', null)

            if (custError) {
              console.error('Error fetching customers for follow-up automation:', custError)
              failed++
              break
            }

            const candidates = (allCustomers || []).filter((c: Customer) => {
              if (alreadySent.has(c.id)) return false
              const status = getAccountStatusKey(c)
              // if (kind === 'inactive') {
              //   if (status !== 'inactive') return false
              //   const parts = getLastPurchaseUtcMonthDate(c)
              //   if (!parts) return false
              //   return parts.month === todayMonth && parts.day === todayDate
              // }
              if (status !== 'free') return false
              const regParts = getRegistrationUtcMonthDate(c.original_data, c.created_at)
              if (!regParts) return false
              return regParts.month === todayMonth && regParts.day === todayDate
            })

            const warmupEnabled = row.message.startsWith(WARMUP_MESSAGE_MARKER)
            const followupTemplate = warmupEnabled
              ? row.message.slice(WARMUP_MESSAGE_MARKER.length)
              : row.message
            const localHour = localTzNow.getUTCHours() // local time (Malaysia) hour

            for (const customer of candidates) {
              try {
                const message = renderCustomerTemplate(followupTemplate, customer)

                const contactCheck = await checkWhatsAppNumberExists(sessionName, customer.phone!)

                const sendFollowUpWhatsApp = async () => {
                  if (warmupEnabled) {
                    const isMalay = (customer.ethnicity || '').toLowerCase() === 'malay'
                    const timeGreeting =
                      localHour < 12
                        ? 'Selamat Pagi'
                        : localHour < 15
                          ? 'Selamat Tengahari'
                          : localHour < 18
                            ? 'Selamat Petang'
                            : 'Selamat Malam'

                    const warmerTemplate = isMalay
                      ? 'Salam, {SenderName}'
                      : `${timeGreeting}, {SenderName}`

                    const warmerText = renderCustomerTemplate(warmerTemplate, customer)
                    await sendWhatsAppMessage(sessionName, customer.phone!, warmerText)
                    await randomDelayBetween(30000, 60000)
                  }

                  await sendWhatsAppMessage(sessionName, customer.phone!, message)
                }

                let delivered = false
                if (contactCheck.ok && contactCheck.numberExists) {
                  try {
                    await sendFollowUpWhatsApp()
                    delivered = true
                  } catch (sendErr) {
                    console.error(
                      'Error sending follow-up WhatsApp message, attempting email fallback:',
                      sendErr
                    )
                    delivered = await sendEmailFallback(row.user_id, customer, message)
                  }
                } else if (contactCheck.ok && !contactCheck.numberExists) {
                  console.log('Follow-up: number not on WhatsApp; email first:', customer.id)
                  delivered = await sendEmailFallback(row.user_id, customer, message)
                  if (!delivered) {
                    try {
                      await sendFollowUpWhatsApp()
                      delivered = true
                    } catch {
                      delivered = false
                    }
                  }
                } else {
                  console.log(
                    'Follow-up: contact check unavailable; email first:',
                    customer.id,
                    !contactCheck.ok ? contactCheck.reason : ''
                  )
                  delivered = await sendEmailFallback(row.user_id, customer, message)
                  if (!delivered) {
                    try {
                      await sendFollowUpWhatsApp()
                      delivered = true
                    } catch {
                      delivered = false
                    }
                  }
                }

                if (delivered) {
                  const { error: insErr } = await supabaseAdmin.from('followup_campaign_sends').insert({
                    user_id: row.user_id,
                    customer_id: customer.id,
                    kind,
                    scheduled_message_id: row.id,
                  })
                  if (insErr) {
                    console.error('Error recording follow-up send:', insErr)
                    failed++
                  } else {
                    sent++
                  }
                } else {
                  failed++
                }

                // Interval between customers to avoid bursts / rate limits.
                await randomDelayBetween(30000, 60000)
              } catch (err) {
                console.error('Error preparing follow-up message:', err)
                failed++
              }
            }
            break
          }

          default: {
            if (!hasPhone) {
              console.warn(
                'Scheduled message has no recognised handler (missing phone and not a broadcast automation):',
                row.id
              )
              failed++
              break
            }
            try {
              await sendWhatsAppMessage(sessionName, row.phone, row.message)
              sent++
            } catch (sendErr) {
              console.error('Error sending direct WhatsApp message:', sendErr)
              failed++
            }
            break
          }
        }

        // Update scheduling depending on type:
        // - Broadcast automations: recurring daily job → keep status 'pending' and move scheduled_at to next day.
        // - Others: one-off → mark as 'sent'.
        if (isDailyRecurringAutomation) {
          const nextRun = new Date()
          nextRun.setUTCDate(nextRun.getUTCDate() + 1)

          await supabase
            .from('scheduled_messages')
            .update({
              status: 'pending',
              locked_at: null,
              scheduled_at: nextRun.toISOString(),
            })
            .eq('id', row.id)
        } else {
          await supabase
            .from('scheduled_messages')
            .update({ status: 'sent', locked_at: null })
            .eq('id', row.id)
        }
      } catch (err) {
        console.error('Error processing scheduled message row:', err)
        failed++
        await supabase
          .from('scheduled_messages')
          .update({ status: 'failed', locked_at: null })
          .eq('id', row.id)
      }
    }

    return NextResponse.json({
      success: true,
      processed: processableRows.length,
      sent,
      failed,
      skippedExpiredSessions: dueToProcess.length - processableRows.length,
    })
  } catch (err: any) {
    console.error('Error in /api/automation/send worker:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

