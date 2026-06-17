import nodemailer from 'nodemailer'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://crmpg.vercel.app').replace(/\/$/, '')

const BILLING_PATH = '/dashboard/billing'

/** Login first, then redirect to billing (renew / upgrade CTA). */
export function saasBillingRenewUrl(): string {
  return `${APP_ORIGIN}/login?next=${encodeURIComponent(BILLING_PATH)}`
}

async function loadUserEmail(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

export async function sendSaasEmail(opts: {
  userId: string
  subject: string
  text: string
}): Promise<boolean> {
  const to = await loadUserEmail(opts.userId)
  if (!to) return false

  const smtpUser = process.env.GMAIL_USER
  const smtpPass = process.env.GMAIL_PASS
  if (!smtpUser || !smtpPass) {
    console.error('[saas-email] GMAIL_USER/GMAIL_PASS missing')
    return false
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    })

    await transporter.sendMail({
      from: smtpUser,
      to,
      subject: opts.subject,
      text: opts.text,
    })
    return true
  } catch (err) {
    console.error('[saas-email] send failed:', err)
    return false
  }
}

export function saasBillingLinkText(): string {
  return saasBillingRenewUrl()
}
