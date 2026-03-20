import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { wahaFetch } from '@/app/lib/waha'
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

function renderCustomerTemplate(template: string, customer: Customer): string {
  if (!template) return ''

  const lastPurchase = formatLastPurchaseForTemplate(customer.original_data)
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

async function sendWhatsAppMessage(session: string, phone: string, text: string) {
  const digits = normalisePhoneToMsisdn(phone)
  const chatId = `${digits}@c.us`

  await wahaFetch('/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      session,
      chatId,
      text,
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

async function checkWhatsAppNumberExists(session: string, phone: string): Promise<boolean> {
  try {
    const digits = normalisePhoneToMsisdn(phone)
    const url = `https://${process.env.NEXT_PUBLIC_WAHA_URL}/api/contacts/check-exists?phone=${encodeURIComponent(
      digits
    )}&session=${encodeURIComponent(session)}`

    const res = await fetch(url)

    if (!res.ok) {
      console.error('Failed to check WhatsApp contact existence, proceeding with send:', res.status)
      // Fail-open to avoid blocking sends if the external API is down.
      return true
    }

    const data: any = await res.json().catch(() => null)

    // Expected WAHA response:
    // { "numberExists": false }
    // { "numberExists": true, "chatId": "80028243066938@lid" }
    if (!data || typeof data.numberExists !== 'boolean') {
      // If the shape is unexpected, fail-open so messages still go out.
      return true
    }

    return data.numberExists
  } catch (err) {
    console.error('Error calling WhatsApp contact check API, proceeding with send:', err)
    // Fail-open if the check itself fails.
    return true
  }
}

async function getEmailFallbackConfig(userId: string): Promise<EmailFallbackConfig | null> {
  // Look up Gmail app password from WAHA user sessions
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from('waha_user_sessions')
    .select('gmaill_app_password, gmail_message')
    .eq('user_id', userId)
    .not('gmaill_app_password', 'is', null)
    .limit(1)
    .maybeSingle()

  if (sessionError || !sessionRow?.gmaill_app_password) {
    return null
  }

  // Use the authenticated user's primary email as the Gmail account
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) {
    return null
  }

  return {
    fromEmail: data.user.email,
    appPassword: sessionRow.gmaill_app_password,
    gmailTemplate: (sessionRow as any).gmail_message || null,
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
    if (isEnableProbeError?.code === '42703') {
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
    const { data: due, error: fetchError } = await fetchQuery


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
    const { data: lockedRows, error: lockError } = await lockQuery

    if (lockError) {
      console.error('Error locking scheduled messages:', lockError)
    }

    // 3. Resolve WAHA sessions per user so we know which session to send from.
    const lockedIdSet = new Set((lockedRows || []).map((r) => r.id))
    // If locking failed, fall back to processing what we fetched (worst case a later run retries).
    const dueToProcess = lockError ? due : (due as ScheduledMessageRow[]).filter((r) => lockedIdSet.has(r.id))

    const userIds = Array.from(new Set((dueToProcess as any[]).map((m) => m.user_id))) as string[]
    const { data: sessionRows, error: sessionError } = await supabase
      .from('waha_user_sessions')
      .select('user_id, session_name')
      .in('user_id', userIds)

    if (sessionError) {
      console.error('Error fetching WAHA sessions for users:', sessionError)
    }

    const sessionByUser = new Map<string, string>()
    for (const s of sessionRows || []) {
      if (!sessionByUser.has(s.user_id) && s.session_name) {
        sessionByUser.set(s.user_id, s.session_name)
      }
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

    for (const row of dueToProcess as ScheduledMessageRow[]) {
      try {
        const title = normalizedScheduledTitle(row.title)
        const hasPhone = !!row.phone && row.phone.trim() !== ''
        const isDailyRecurringAutomation =
          title === 'birthday' ||
          title === 'inactive follow-up' ||
          title === 'free account follow-up'

        const sessionName = sessionByUser.get(row.user_id)
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

                  const exists = await checkWhatsAppNumberExists(sessionName, customer.phone!)

                  if (!exists) {
                    console.log(
                      'WhatsApp contact does not exist for customer, using email fallback:',
                      customer.id
                    )
                    const emailSent = await sendEmailFallback(row.user_id, customer, message)
                    if (emailSent) {
                      sent++
                    } else {
                      failed++
                    }
                  } else {
                    try {
                      await sendWhatsAppMessage(sessionName, customer.phone!, message)
                      sent++
                    } catch (sendErr) {
                      console.error(
                        'Error sending birthday WhatsApp message, attempting email fallback:',
                        sendErr
                      )
                      // const emailSent = await sendEmailFallback(row.user_id, customer, message)
                      // if (emailSent) {
                      //   sent++
                      // } else {
                      //   failed++
                      // }
                    }
                  }
                } catch (err) {
                  console.error('Error preparing birthday message:', err)
                  failed++
                }
              }
            }
            break
          }

          case 'inactive follow-up':
          case 'free account follow-up': {
            const kind = title === 'inactive follow-up' ? 'inactive' : 'free'

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
              const status = getAccountStatusKey(c.original_data)
              if (kind === 'inactive') {
                if (status !== 'inactive') return false
                const parts = getLastPurchaseUtcMonthDate(c.original_data)
                if (!parts) return false
                return parts.month === todayMonth && parts.day === todayDate
              }
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

                const exists = await checkWhatsAppNumberExists(sessionName, customer.phone!)

                let delivered = false
                if (!exists) {
                  console.log(
                    'WhatsApp contact does not exist for customer, using email fallback:',
                    customer.id
                  )
                  delivered = await sendEmailFallback(row.user_id, customer, message)
                } else {
                  try {
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
                      // Delay between greeting and the main template.
                      await randomDelayBetween(3000, 5000)
                    }

                    await sendWhatsAppMessage(sessionName, customer.phone!, message)
                    delivered = true
                  } catch (sendErr) {
                    console.error(
                      'Error sending follow-up WhatsApp message, attempting email fallback:',
                      sendErr
                    )
                    delivered = await sendEmailFallback(row.user_id, customer, message)
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
                await randomDelayBetween(1000, 2000)
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
      processed: dueToProcess.length,
      sent,
      failed,
    })
  } catch (err: any) {
    console.error('Error in /api/automation/send worker:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

