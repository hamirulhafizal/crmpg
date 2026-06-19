import { sendSaasEmail, saasBillingRenewUrl } from '@/app/lib/saas/email'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { sendWhatsAppText } from '@/app/lib/whatsapp/send'

export type TrialReminderKind = 'free_1d' | 'pro_3d' | 'pro_1d'

export type TrialReminderResult =
  | { ok: true; channel: 'whatsapp' | 'email' }
  | { ok: false; reason: string }

let cachedReminderSenderUserId: string | null | undefined

/** Platform reminder WhatsApp is sent from the auth user matching GMAIL_USER. */
export async function resolveSaasReminderWhatsAppSenderId(): Promise<string | null> {
  const gmailUser = (process.env.GMAIL_USER || '').trim().toLowerCase()
  if (!gmailUser) {
    console.warn('[saas-reminder] GMAIL_USER not set; WhatsApp reminders disabled')
    return null
  }

  if (cachedReminderSenderUserId !== undefined) {
    return cachedReminderSenderUserId
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    console.error('[saas-reminder] listUsers failed:', error.message)
    cachedReminderSenderUserId = null
    return null
  }

  const match = (data.users ?? []).find((u) => (u.email || '').trim().toLowerCase() === gmailUser)
  cachedReminderSenderUserId = match?.id ?? null
  if (!cachedReminderSenderUserId) {
    console.warn('[saas-reminder] No auth user found for GMAIL_USER:', gmailUser)
  }
  return cachedReminderSenderUserId
}

async function pickWorkingSession(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data: rows } = await admin
    .from('waha_user_sessions')
    .select('session_name, last_known_waha_status')
    .eq('user_id', userId)

  const list = rows ?? []
  const working = list.find((r) => {
    const s = String(r.last_known_waha_status || '').toUpperCase()
    return s === 'WORKING' || s === 'CONNECTED'
  })
  if (working?.session_name) return working.session_name
  return list[0]?.session_name ?? null
}

function fmtExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function buildReminderCopy(kind: TrialReminderKind, trialEndsAt: string): { subject: string; text: string } {
  const renewUrl = saasBillingRenewUrl()
  const expiryLabel = fmtExpiry(trialEndsAt)

  if (kind === 'free_1d') {
    return {
      subject: 'CRMPG - Free trial ends tomorrow',
      text: [
        'Your CRMPG free trial ends tomorrow.',
        '',
        `Trial ends: ${expiryLabel}`,
        '',
        'After it ends, WhatsApp will disconnect and campaigns will pause.',
        'You can still view customers (read-only).',
        '',
        'Upgrade to Pro to keep full access:',
        renewUrl,
      ].join('\n'),
    }
  }

  if (kind === 'pro_3d') {
    return {
      subject: 'CRMPG - Pro trial ends in 3 days',
      text: [
        'Your CRMPG Pro trial ends in 3 days.',
        '',
        `Trial ends: ${expiryLabel}`,
        '',
        'Subscribe to keep unlimited campaigns and WasenderAPI:',
        renewUrl,
      ].join('\n'),
    }
  }

  return {
    subject: 'CRMPG - Pro trial ends tomorrow',
    text: [
      'Your CRMPG Pro trial ends tomorrow.',
      '',
      `Trial ends: ${expiryLabel}`,
      '',
      'Subscribe to continue with Pro features:',
      renewUrl,
    ].join('\n'),
  }
}

function whatsAppReminderText(kind: TrialReminderKind, trialEndsAt: string): string {
  const renewUrl = saasBillingRenewUrl()
  const expiryLabel = fmtExpiry(trialEndsAt)

  if (kind === 'free_1d') {
    return [
      'CRMPG — free trial ending soon',
      '',
      'Your free trial ends tomorrow.',
      `Ends: ${expiryLabel}`,
      '',
      'After that, WhatsApp disconnects and campaigns pause (customers stay viewable).',
      '',
      'Upgrade to Pro 👇',
      renewUrl,
    ].join('\n')
  }

  if (kind === 'pro_3d') {
    return [
      'CRMPG — Pro trial ending soon',
      '',
      'Your Pro trial ends in 3 days.',
      `Ends: ${expiryLabel}`,
      '',
      'Subscribe to keep unlimited workflows & WasenderAPI 👇',
      renewUrl,
    ].join('\n')
  }

  return [
    'CRMPG — Pro trial ending soon',
    '',
    'Your Pro trial ends tomorrow.',
    `Ends: ${expiryLabel}`,
    '',
    'Subscribe to continue 👇',
    renewUrl,
  ].join('\n')
}

async function loadSubscriberPhone(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data } = await admin.from('profiles').select('phone').eq('id', userId).maybeSingle()
  const phone = (data?.phone || '').trim()
  return phone || null
}

async function sendViaAdminWhatsApp(opts: {
  subscriberUserId: string
  phone: string
  kind: TrialReminderKind
  trialEndsAt: string
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const senderUserId = await resolveSaasReminderWhatsAppSenderId()
  if (!senderUserId) {
    return { ok: false, reason: 'reminder_sender_not_configured' }
  }

  if (!(await isWhatsAppConfigured({ userId: senderUserId }))) {
    return { ok: false, reason: 'admin_whatsapp_not_configured' }
  }

  const session = await pickWorkingSession(senderUserId)
  if (!session) {
    return { ok: false, reason: 'admin_whatsapp_session_missing' }
  }

  try {
    await sendWhatsAppText({
      userId: senderUserId,
      session,
      phone: opts.phone,
      text: whatsAppReminderText(opts.kind, opts.trialEndsAt),
      enableTyping: false,
      randomizeSpaces: false,
    })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'whatsapp_send_failed'
    console.error('[saas-reminder] WhatsApp send failed:', opts.subscriberUserId, message)
    return { ok: false, reason: message }
  }
}

/** WhatsApp first (admin GMAIL_USER session), Gmail fallback via platform .env SMTP. */
export async function sendTrialReminder(opts: {
  userId: string
  kind: TrialReminderKind
  trialEndsAt: string
}): Promise<TrialReminderResult> {
  const { subject, text } = buildReminderCopy(opts.kind, opts.trialEndsAt)
  const phone = await loadSubscriberPhone(opts.userId)

  if (phone) {
    const wa = await sendViaAdminWhatsApp({
      subscriberUserId: opts.userId,
      phone,
      kind: opts.kind,
      trialEndsAt: opts.trialEndsAt,
    })
    if (wa.ok) {
      return { ok: true, channel: 'whatsapp' }
    }
    console.info('[saas-reminder] WhatsApp skipped, trying Gmail:', opts.userId, wa.reason)
  }

  const emailed = await sendSaasEmail({
    userId: opts.userId,
    subject,
    text,
  })
  if (emailed) {
    return { ok: true, channel: 'email' }
  }

  return { ok: false, reason: phone ? 'whatsapp_and_email_failed' : 'no_phone_and_email_failed' }
}
