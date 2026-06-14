import { pauseExcessActiveCampaigns } from '@/app/lib/saas/enforce'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import { sendSaasEmail, saasBillingLinkText } from '@/app/lib/saas/email'
import { isProSubscriptionActive } from '@/app/lib/saas/billing'
import { loadSaasPlanBySlug } from '@/app/lib/saas/plans'
import type { SaasSubscriptionRow } from '@/app/lib/saas/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type SaasCronSummary = {
  expired_count: number
  campaigns_paused: number
  trial_reminders_sent: number
  renewal_reminders_sent: number
  expiry_notices_sent: number
}

const MS_DAY = 24 * 60 * 60 * 1000

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const end = new Date(iso).getTime()
  return Math.ceil((end - now.getTime()) / MS_DAY)
}

function metaFlagSent(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || typeof meta[key] === 'string'
}

export async function processSaasSubscriptionsCron(now = new Date()): Promise<SaasCronSummary> {
  const admin = createServiceRoleClient()
  const summary: SaasCronSummary = {
    expired_count: 0,
    campaigns_paused: 0,
    trial_reminders_sent: 0,
    renewal_reminders_sent: 0,
    expiry_notices_sent: 0,
  }

  const freePlan = await loadSaasPlanBySlug('free')
  if (!freePlan) throw new Error('Free plan not found')

  const { data: subs, error } = await admin.from('saas_subscriptions').select('*').in('status', ['trialing', 'active', 'expired'])

  if (error) throw new Error(error.message)

  const planSlugCache = new Map<string, string>()

  for (const raw of subs ?? []) {
    const sub = raw as SaasSubscriptionRow
    if (await isPlatformAdmin(sub.user_id)) continue

    let planSlug = planSlugCache.get(sub.plan_id)
    if (!planSlug) {
      const { data: planRow } = await admin.from('saas_plans').select('slug').eq('id', sub.plan_id).maybeSingle()
      planSlug = String(planRow?.slug ?? 'free')
      planSlugCache.set(sub.plan_id, planSlug)
    }
    const meta = { ...(sub.payment_metadata ?? {}) } as Record<string, unknown>
    let metaDirty = false

    const proActive = isProSubscriptionActive({
      planSlug,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      now,
    })

    // Expire lapsed Pro / trial
    if (planSlug === 'pro' && !proActive && sub.status !== 'expired' && sub.status !== 'cancelled') {
      const { error: updErr } = await admin
        .from('saas_subscriptions')
        .update({
          status: 'expired',
          plan_id: freePlan.id,
          locked_price_amount: 0,
          trial_ends_at: null,
          current_period_end: null,
          payment_metadata: {
            ...meta,
            expired_at: now.toISOString(),
            previous_plan_slug: 'pro',
          },
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id)

      if (!updErr) {
        summary.expired_count += 1
        const paused = await pauseExcessActiveCampaigns(sub.user_id, 1)
        summary.campaigns_paused += paused

        if (!metaFlagSent(meta, 'expired_notice_sent_at')) {
          const sent = await sendSaasEmail({
            userId: sub.user_id,
            subject: 'CRMPG - Your Pro subscription has expired',
            text: [
              'Your Pro subscription has ended and your account is now on the Free plan.',
              '',
              'Free plan includes 1 active campaign and WAHA WhatsApp only.',
              'Extra active campaigns have been paused automatically.',
              '',
              'Renew or start a new trial here:',
              saasBillingLinkText(),
            ].join('\n'),
          })
          if (sent) {
            await admin
              .from('saas_subscriptions')
              .update({
                payment_metadata: {
                  ...meta,
                  expired_notice_sent_at: now.toISOString(),
                },
                updated_at: now.toISOString(),
              })
              .eq('id', sub.id)
            summary.expiry_notices_sent += 1
          }
        }
      }
      continue
    }

    if (!proActive || planSlug !== 'pro') continue

    // Trial ending reminders (3d and 1d)
    if (sub.status === 'trialing' && sub.trial_ends_at) {
      const days = daysUntil(sub.trial_ends_at, now)
      if (days === 3 && !metaFlagSent(meta, 'trial_reminder_3d_sent_at')) {
        const sent = await sendSaasEmail({
          userId: sub.user_id,
          subject: 'CRMPG - Pro trial ends in 3 days',
          text: [
            'Your Pro trial ends in 3 days.',
            '',
            'Subscribe now to keep unlimited campaigns and WasenderAPI:',
            saasBillingLinkText(),
          ].join('\n'),
        })
        if (sent) {
          meta.trial_reminder_3d_sent_at = now.toISOString()
          metaDirty = true
          summary.trial_reminders_sent += 1
        }
      }
      if (days === 1 && !metaFlagSent(meta, 'trial_reminder_1d_sent_at')) {
        const sent = await sendSaasEmail({
          userId: sub.user_id,
          subject: 'CRMPG - Pro trial ends tomorrow',
          text: [
            'Your Pro trial ends tomorrow.',
            '',
            'Subscribe to continue with Pro features:',
            saasBillingLinkText(),
          ].join('\n'),
        })
        if (sent) {
          meta.trial_reminder_1d_sent_at = now.toISOString()
          metaDirty = true
          summary.trial_reminders_sent += 1
        }
      }
    }

    // Renewal reminder (7 days before period end)
    if (sub.status === 'active' && sub.current_period_end) {
      const days = daysUntil(sub.current_period_end, now)
      if (days === 7 && !metaFlagSent(meta, 'renewal_reminder_7d_sent_at')) {
        const sent = await sendSaasEmail({
          userId: sub.user_id,
          subject: 'CRMPG - Pro subscription renews in 7 days',
          text: [
            'Your Pro subscription renews in 7 days.',
            '',
            'Renew early or update billing here:',
            saasBillingLinkText(),
          ].join('\n'),
        })
        if (sent) {
          meta.renewal_reminder_7d_sent_at = now.toISOString()
          metaDirty = true
          summary.renewal_reminders_sent += 1
        }
      }
    }

    if (metaDirty) {
      await admin
        .from('saas_subscriptions')
        .update({ payment_metadata: meta, updated_at: now.toISOString() })
        .eq('id', sub.id)
    }
  }

  return summary
}
