import {
  pauseAllActiveCampaigns,
  pauseExcessActiveCampaigns,
} from '@/app/lib/saas/enforce'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import { sendSaasEmail, saasBillingLinkText } from '@/app/lib/saas/email'
import { sendTrialReminder } from '@/app/lib/saas/trial-reminder'
import { hasPlatformWriteAccess, isFreeTrialActive, isProSubscriptionActive } from '@/app/lib/saas/billing'
import { loadSaasPlanBySlug } from '@/app/lib/saas/plans'
import type { SaasSubscriptionRow } from '@/app/lib/saas/types'
import { deleteAllWhatsAppSessionsForUser } from '@/app/lib/whatsapp/sessions'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type SaasCronSummary = {
  expired_count: number
  free_trial_expired_count: number
  campaigns_paused: number
  whatsapp_sessions_deleted: number
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

function freeTrialDays(planTrialDays: number): number {
  return Math.max(planTrialDays, 1)
}

export async function processSaasSubscriptionsCron(now = new Date()): Promise<SaasCronSummary> {
  const admin = createServiceRoleClient()
  const summary: SaasCronSummary = {
    expired_count: 0,
    free_trial_expired_count: 0,
    campaigns_paused: 0,
    whatsapp_sessions_deleted: 0,
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

    const freeTrialActive = isFreeTrialActive({
      planSlug,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      now,
    })

    const writeAccess = hasPlatformWriteAccess({
      planSlug,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      now,
    })

    // Expire lapsed Free signup trial
    if (planSlug === 'free' && sub.status === 'trialing' && !freeTrialActive) {
      const { error: updErr } = await admin
        .from('saas_subscriptions')
        .update({
          status: 'expired',
          trial_ends_at: sub.trial_ends_at,
          current_period_end: sub.trial_ends_at,
          payment_metadata: {
            ...meta,
            free_trial_expired_at: now.toISOString(),
          },
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id)

      if (!updErr) {
        summary.free_trial_expired_count += 1
        summary.expired_count += 1
        summary.campaigns_paused += await pauseAllActiveCampaigns(sub.user_id)
        summary.whatsapp_sessions_deleted += await deleteAllWhatsAppSessionsForUser(sub.user_id)

        if (!metaFlagSent(meta, 'free_trial_expired_notice_sent_at')) {
          const sent = await sendSaasEmail({
            userId: sub.user_id,
            subject: 'CRMPG - Your free trial has ended',
            text: [
              'Your 3-day free trial has ended.',
              '',
              'WhatsApp connections have been removed and active campaigns paused.',
              'You can still sign in and view your customers (read-only).',
              '',
              'Upgrade to Pro to restore WhatsApp and campaigns:',
              saasBillingLinkText(),
            ].join('\n'),
          })
          if (sent) {
            await admin
              .from('saas_subscriptions')
              .update({
                payment_metadata: {
                  ...meta,
                  free_trial_expired_notice_sent_at: now.toISOString(),
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

    // Expire lapsed Pro / Pro trial → fresh Free trial
    if (planSlug === 'pro' && !proActive && sub.status !== 'expired' && sub.status !== 'cancelled') {
      const trialDays = freeTrialDays(freePlan.trial_days)
      const trialEnd = new Date(now.getTime() + trialDays * MS_DAY)

      const { error: updErr } = await admin
        .from('saas_subscriptions')
        .update({
          status: 'trialing',
          plan_id: freePlan.id,
          locked_price_amount: 0,
          trial_ends_at: trialEnd.toISOString(),
          current_period_start: now.toISOString(),
          current_period_end: trialEnd.toISOString(),
          payment_metadata: {
            ...meta,
            pro_expired_at: now.toISOString(),
            previous_plan_slug: 'pro',
            expired_notice_sent_at: undefined,
          },
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id)

      if (!updErr) {
        summary.expired_count += 1
        summary.campaigns_paused += await pauseExcessActiveCampaigns(sub.user_id, 1)

        if (!metaFlagSent(meta, 'pro_expired_notice_sent_at')) {
          const sent = await sendSaasEmail({
            userId: sub.user_id,
            subject: 'CRMPG - Your Pro subscription has ended',
            text: [
              'Your Pro subscription has ended.',
              '',
              `You now have a ${trialDays}-day Free trial (1 active campaign, WAHA WhatsApp).`,
              'Extra active campaigns have been paused automatically.',
              '',
              'Upgrade to Pro anytime:',
              saasBillingLinkText(),
            ].join('\n'),
          })
          if (sent) {
            await admin
              .from('saas_subscriptions')
              .update({
                payment_metadata: {
                  ...meta,
                  pro_expired_notice_sent_at: now.toISOString(),
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

    if (!writeAccess) continue

    // Free trial ending reminder (1 day)
    if (planSlug === 'free' && sub.status === 'trialing' && sub.trial_ends_at) {
      const days = daysUntil(sub.trial_ends_at, now)
      if (days === 1 && !metaFlagSent(meta, 'free_trial_reminder_1d_sent_at')) {
        const result = await sendTrialReminder({
          userId: sub.user_id,
          kind: 'free_1d',
          trialEndsAt: sub.trial_ends_at,
        })
        if (result.ok) {
          meta.free_trial_reminder_1d_sent_at = now.toISOString()
          meta.free_trial_reminder_1d_channel = result.channel
          metaDirty = true
          summary.trial_reminders_sent += 1
        }
      }
    }

    if (!proActive || planSlug !== 'pro') {
      if (metaDirty) {
        await admin
          .from('saas_subscriptions')
          .update({ payment_metadata: meta, updated_at: now.toISOString() })
          .eq('id', sub.id)
      }
      continue
    }

    // Pro trial ending reminders (3d and 1d)
    if (sub.status === 'trialing' && sub.trial_ends_at) {
      const days = daysUntil(sub.trial_ends_at, now)
      if (days === 3 && !metaFlagSent(meta, 'trial_reminder_3d_sent_at')) {
        const result = await sendTrialReminder({
          userId: sub.user_id,
          kind: 'pro_3d',
          trialEndsAt: sub.trial_ends_at,
        })
        if (result.ok) {
          meta.trial_reminder_3d_sent_at = now.toISOString()
          meta.trial_reminder_3d_channel = result.channel
          metaDirty = true
          summary.trial_reminders_sent += 1
        }
      }
      if (days === 1 && !metaFlagSent(meta, 'trial_reminder_1d_sent_at')) {
        const result = await sendTrialReminder({
          userId: sub.user_id,
          kind: 'pro_1d',
          trialEndsAt: sub.trial_ends_at,
        })
        if (result.ok) {
          meta.trial_reminder_1d_sent_at = now.toISOString()
          meta.trial_reminder_1d_channel = result.channel
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
