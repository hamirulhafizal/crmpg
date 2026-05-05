import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type PaymentRow = {
  amount: number | string
  participant_id: string
  package:
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }[]
    | null
}

type SubscriptionRow = {
  status: string
  current_period_end: string | null
  package:
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }[]
    | null
}

function onePackage(
  pkg:
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }
    | { id: string; name: string; billing_period: 'monthly' | 'yearly' }[]
    | null
) {
  return Array.isArray(pkg) ? pkg[0] : pkg
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const expiringBy = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [{ data: paidRows, error: payErr }, { data: subs, error: subErr }, { count: participantCount, error: partErr }] =
      await Promise.all([
        admin
          .from('google_ads_payments')
          .select(
            `
            amount,
            participant_id,
            package:google_ads_packages!package_id (
              id,
              name,
              billing_period
            )
          `
          )
          .eq('status', 'paid')
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', monthEnd.toISOString()),
        admin
          .from('google_ads_subscriptions')
          .select(
            `
            status,
            current_period_end,
            package:google_ads_packages!package_id (
              id,
              name,
              billing_period
            )
          `
          ),
        admin.from('google_ads_participants').select('id', { count: 'exact', head: true }),
      ])

    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })
    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
    if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 })

    const payments = (paidRows || []) as PaymentRow[]
    const subRows = (subs || []) as SubscriptionRow[]

    const totalCollected = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const uniquePayingParticipants = new Set(payments.map((p) => p.participant_id)).size

    const byPackage = new Map<
      string,
      { package_id: string; name: string; billing_period: 'monthly' | 'yearly'; amount: number; count: number }
    >()
    const byPeriod = {
      monthly: { amount: 0, count: 0 },
      yearly: { amount: 0, count: 0 },
    }

    for (const row of payments) {
      const pkg = onePackage(row.package)
      if (!pkg) continue
      const amount = Number(row.amount || 0)
      const prev = byPackage.get(pkg.id)
      if (prev) {
        prev.amount += amount
        prev.count += 1
      } else {
        byPackage.set(pkg.id, {
          package_id: pkg.id,
          name: pkg.name,
          billing_period: pkg.billing_period,
          amount,
          count: 1,
        })
      }
      byPeriod[pkg.billing_period].amount += amount
      byPeriod[pkg.billing_period].count += 1
    }

    let activeMembers = 0
    let pendingPaymentMembers = 0
    let expiredMembers = 0
    let expiringIn7Days = 0
    const activeByPackage = new Map<string, { package_id: string; name: string; billing_period: 'monthly' | 'yearly'; members: number }>()

    for (const sub of subRows) {
      const status = (sub.status || '').toLowerCase()
      if (status === 'pending_payment') pendingPaymentMembers += 1
      if (status === 'expired') expiredMembers += 1

      if (status === 'active' && sub.current_period_end) {
        const end = new Date(sub.current_period_end)
        if (end.getTime() >= now.getTime()) {
          activeMembers += 1
          if (end.getTime() <= expiringBy.getTime()) expiringIn7Days += 1
          const pkg = onePackage(sub.package)
          if (pkg) {
            const prev = activeByPackage.get(pkg.id)
            if (prev) prev.members += 1
            else {
              activeByPackage.set(pkg.id, {
                package_id: pkg.id,
                name: pkg.name,
                billing_period: pkg.billing_period,
                members: 1,
              })
            }
          }
        } else {
          expiredMembers += 1
        }
      }
    }

    return NextResponse.json({
      month: {
        key: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
      },
      totals: {
        participants: participantCount || 0,
        activeMembers,
        pendingPaymentMembers,
        expiredMembers,
        expiringIn7Days,
      },
      collection: {
        currency: 'MYR',
        totalCollected,
        paymentCount: payments.length,
        uniquePayingParticipants,
        averagePerPayment: payments.length > 0 ? totalCollected / payments.length : 0,
        byBillingPeriod: byPeriod,
        byPackage: Array.from(byPackage.values()).sort((a, b) => b.amount - a.amount),
      },
      activeByPackage: Array.from(activeByPackage.values()).sort((a, b) => b.members - a.members),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load Google Ads stats' }, { status: 500 })
  }
}

