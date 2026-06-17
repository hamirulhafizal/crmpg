import type { SupabaseClient } from '@supabase/supabase-js'

import { addSaasBillingPeriod } from '@/app/lib/saas/billing'
import type { SaasBillingPeriod, SaasPlanRow } from '@/app/lib/saas/types'

export type ActivateSaasSubscriptionOptions = {
  userId: string
  planId: string
  amountPaid: number
  currency: string
  externalPaymentId?: string | null
  paymentMetadataExtra?: Record<string, unknown>
}

export async function activateSaasSubscriptionAfterPayment(
  admin: SupabaseClient,
  opts: ActivateSaasSubscriptionOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: plan, error: planErr } = await admin
    .from('saas_plans')
    .select('*')
    .eq('id', opts.planId)
    .maybeSingle()

  if (planErr || !plan) return { ok: false, error: 'Plan not found' }

  const planRow = plan as SaasPlanRow
  const periodStart = new Date()
  const billingPeriod = (planRow.billing_period || 'monthly') as SaasBillingPeriod
  const periodEnd =
    billingPeriod === 'none' ? null : addSaasBillingPeriod(periodStart, billingPeriod)

  const { data: existing } = await admin
    .from('saas_subscriptions')
    .select('payment_metadata, locked_price_amount')
    .eq('user_id', opts.userId)
    .maybeSingle()

  const prevMeta = (existing?.payment_metadata as Record<string, unknown>) || {}
  const lockedPrice =
    Number(existing?.locked_price_amount) > 0 && planRow.slug === 'pro'
      ? Number(existing?.locked_price_amount)
      : opts.amountPaid

  const mergedMeta = {
    ...prevMeta,
    ...(opts.paymentMetadataExtra && typeof opts.paymentMetadataExtra === 'object'
      ? opts.paymentMetadataExtra
      : {}),
    payment_confirmed_at: new Date().toISOString(),
    payment_provider: 'bayarcash',
    last_paid_amount: opts.amountPaid,
  }

  const { error: updErr } = await admin
    .from('saas_subscriptions')
    .update({
      plan_id: opts.planId,
      status: 'active',
      locked_price_amount: planRow.slug === 'free' ? 0 : lockedPrice,
      locked_currency: opts.currency || planRow.currency || 'MYR',
      trial_ends_at: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd?.toISOString() ?? null,
      payment_provider: 'bayarcash',
      payment_metadata: mergedMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', opts.userId)

  if (updErr) return { ok: false, error: updErr.message }

  if (planRow.slug === 'pro') {
    const { applyProPaidWhatsAppMigration } = await import('@/app/lib/saas/whatsapp-access')
    await applyProPaidWhatsAppMigration(opts.userId)
  }

  if (opts.externalPaymentId) {
    await admin
      .from('saas_subscriptions')
      .update({
        payment_metadata: {
          ...mergedMeta,
          external_payment_id: opts.externalPaymentId,
        },
      })
      .eq('user_id', opts.userId)
  }

  return { ok: true }
}
