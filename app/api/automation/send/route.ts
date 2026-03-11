import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { wahaFetch } from '@/app/lib/waha'

const BATCH_SIZE = 20

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

function renderCustomerTemplate(template: string, customer: Customer): string {
  if (!template) return ''

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
}

async function sendWhatsAppMessage(session: string, phone: string, text: string) {
  // Normalise phone: keep digits only, ensure 60 prefix, add @c.us
  let digits = phone.replace(/[^0-9]/g, '')
  if (!digits.startsWith('60')) {
    if (digits.startsWith('0')) {
      digits = `60${digits.slice(1)}`
    } else {
      digits = `60${digits}`
    }
  }

  const chatId1 = `${digits}@c.us`
  const chatId = `60184644305@c.us`

  console.log('chatId1---->', chatId1)

  await wahaFetch('/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      session,
      chatId,
      text,
    }),
  })
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

    console.log('nowIso---->', nowIso)


    // 1. Get due, pending, unlocked scheduled messages
    const { data: due, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .is('locked_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE)

    console.log('fetchError---->',  fetchError)

      

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
    
    console.log('due---->', due)

    const ids = due.map((m: any) => m.id)

    // 2. Lock rows to avoid duplicate processing
    const lockIso = new Date().toISOString()
    const { error: lockError } = await supabase
      .from('scheduled_messages')
      .update({ locked_at: lockIso })
      .in('id', ids)
      .eq('status', 'pending')
      .is('locked_at', null)

    if (lockError) {
      console.error('Error locking scheduled messages:', lockError)
    }

    // 3. Resolve WAHA sessions per user so we know which session to send from.
    const userIds = Array.from(new Set((due as any[]).map((m) => m.user_id))) as string[]
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

    for (const row of due as ScheduledMessageRow[]) {
      try {
        const title = (row.title || '').toLowerCase().trim()
        const hasPhone = !!row.phone && row.phone.trim() !== ''

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

              for (const customer of todaysCustomers) {
                try {
                  const message = renderCustomerTemplate(row.message, customer)

                  console.log('customer---->', customer)
                  console.log('message---->', message)

                  await sendWhatsAppMessage(sessionName, customer.phone!, message)
                  sent++
                } catch (sendErr) {
                  console.error('Error sending birthday WhatsApp message:', sendErr)
                  failed++
                }
              }
            }
            break
          }

          // Default: direct send using configured phone
          case '': {
            try {
              await sendWhatsAppMessage(sessionName, row.phone, row.message)
              sent++
            } catch (sendErr) {
              console.error('Error sending direct WhatsApp message:', sendErr)
              failed++
            }
            break
          }

          default: {
            // Unsupported / misconfigured row; log and mark as failed
            console.warn('Scheduled message has no recognised handler (missing phone and not birthday):', row.id)
            failed++
            break
          }
        }

        // Update scheduling depending on type:
        // - Birthday: treat as a recurring daily job → keep status 'pending' and move scheduled_at to next day.
        // - Others: one-off → mark as 'sent'.
        if (title === 'birthday') {
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
      processed: due.length,
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

