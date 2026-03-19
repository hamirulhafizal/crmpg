import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { wahaFetch } from '@/app/lib/waha'

const BATCH_SIZE = 20

interface ScheduledMessageRow {
  id: string
  user_id: string
  title: string | null
  phone: string
  message: string
  scheduled_at: string
}

interface ProfileRow {
  id: string
  sender_name: string | null
  pg_code: string | null
}

function replaceTemplateVariables(template: string, profile: ProfileRow): string {
  const senderName = profile.sender_name ?? ''
  const pgCode = profile.pg_code ?? ''

  return template
    .replace(/{SenderName}/g, senderName)
    .replace(/{PGCode}/g, pgCode)
}

async function sendWhatsAppMessage(phone: string, text: string) {
  // Normalise phone: keep digits only, ensure 60 prefix, add @c.us
  let digits = phone.replace(/[^0-9]/g, '')
  if (!digits.startsWith('60')) {
    if (digits.startsWith('0')) {
      digits = `60${digits.slice(1)}`
    } else {
      digits = `60${digits}`
    }
  }

  const chatId = `${digits}@c.us`

  await wahaFetch('/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      chatId,
      text,
    }),
  })
}

// GET /api/automation/cron
// Intended to be triggered by Vercel Cron every minute.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isTestCall = request.headers.get('x-test-call') === 'true'

  if (!isTestCall) {
    const expected = process.env.CRON_SECRET
    if (!expected || authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const supabase = await createClient()

    // 1. Fetch due, unlocked pending messages (limit batch size)
    const { data: due, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('id, user_id, phone, message, scheduled_at')
      .eq('status', 'pending')
      // Treat NULL as enabled for backward compatibility when the column was newly added.
      .or('is_enable.eq.true,is_enable.is.null')
      .lte('scheduled_at', new Date().toISOString())
      .is('locked_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE)

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

    const ids = due.map((m) => m.id)

    // 2. Lock rows so parallel cron runs don't double-send
    const nowIso = new Date().toISOString()
    const { data: lockedRows, error: lockError } = await supabase
      .from('scheduled_messages')
      .update({ locked_at: nowIso })
      .in('id', ids)
      .eq('status', 'pending')
      // Keep the same NULL=enabled semantics as the fetch query.
      .or('is_enable.eq.true,is_enable.is.null')
      .is('locked_at', null)
      .select('id')

    const lockedIdSet = new Set((lockedRows || []).map((r) => r.id))
    // If locking failed, fall back to processing what we fetched (worst case a later run retries).
    const dueToProcess = lockError ? due : due.filter((r) => lockedIdSet.has(r.id))

    let sent = 0
    let failed = 0

    // Group messages by user to minimise profile queries
    const byUser = new Map<string, ScheduledMessageRow[]>()
    for (const row of dueToProcess) {
      const group = byUser.get(row.user_id) || []
      group.push(row as ScheduledMessageRow)
      byUser.set(row.user_id, group)
    }

    for (const [userId, messages] of byUser.entries()) {
      // Fetch user profile data for variables
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, sender_name, pg_code')
        .eq('id', userId)
        .maybeSingle()

      const profileData: ProfileRow = {
        id: userId,
        sender_name: profile?.sender_name ?? null,
        pg_code: profile?.pg_code ?? null,
      }

      for (const messageRow of messages) {
        const finalMessage = replaceTemplateVariables(messageRow.message, profileData)

        try {
          await sendWhatsAppMessage(messageRow.phone, finalMessage)

          await supabase
            .from('scheduled_messages')
            .update({
              status: 'sent',
            })
            .eq('id', messageRow.id)

          sent++
        } catch (err: any) {
          console.error('Error sending WhatsApp message:', err)

          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
            })
            .eq('id', messageRow.id)

          failed++
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: dueToProcess.length,
      sent,
      failed,
    })
  } catch (err: any) {
    console.error('Error in automation cron:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

