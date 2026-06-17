import { isProSubscriptionActive } from '@/app/lib/saas/billing'
import { loadSaasPlanBySlug } from '@/app/lib/saas/plans'
import type { SaasSubscriptionRow } from '@/app/lib/saas/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function startProTrialForUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceRoleClient()

  const proPlan = await loadSaasPlanBySlug('pro')
  if (!proPlan?.is_active) return { ok: false, error: 'Pro plan is not available' }
  if (proPlan.trial_days <= 0) return { ok: false, error: 'Pro trial is not enabled on this plan' }

  const { data: sub, error: subErr } = await admin
    .from('saas_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (subErr || !sub) return { ok: false, error: 'Subscription not found' }

  const subscription = sub as SaasSubscriptionRow
  const { data: currentPlan } = await admin.from('saas_plans').select('slug').eq('id', subscription.plan_id).maybeSingle()
  const planSlug = String(currentPlan?.slug ?? 'free')

  const meta = (subscription.payment_metadata ?? {}) as Record<string, unknown>
  if (meta.trial_used === true) {
    return { ok: false, error: 'You have already used your Pro trial' }
  }

  if (
    isProSubscriptionActive({
      planSlug,
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEnd: subscription.current_period_end,
    })
  ) {
    return { ok: false, error: 'You already have an active Pro subscription' }
  }

  const now = new Date()
  const trialEnd = new Date(now.getTime() + proPlan.trial_days * 24 * 60 * 60 * 1000)

  const { error: updErr } = await admin
    .from('saas_subscriptions')
    .update({
      plan_id: proPlan.id,
      status: 'trialing',
      locked_price_amount: Number(proPlan.price_amount),
      locked_currency: proPlan.currency,
      trial_ends_at: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      payment_metadata: {
        ...meta,
        trial_used: true,
        trial_started_at: now.toISOString(),
      },
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)

  if (updErr) return { ok: false, error: updErr.message }

  const { applyProTrialWhatsAppSetup } = await import('@/app/lib/saas/whatsapp-access')
  const { provisionProPlatformDefaults } = await import('@/app/lib/campaigns/platform-defaults')
  await applyProTrialWhatsAppSetup(userId)
  await provisionProPlatformDefaults(admin, userId)

  return { ok: true }
}
