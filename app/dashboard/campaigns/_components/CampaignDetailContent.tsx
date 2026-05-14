'use client'

import { CampaignAnalyticsCards } from '@/app/dashboard/campaigns/_components/CampaignAnalyticsCards'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'

export type CampaignDetailPayload = {
  campaign: Record<string, unknown>
  steps: unknown[]
  stats: { enrolled: number; sent: number; failed: number; completed: number }
  recent_logs: Array<Record<string, unknown>>
}

export function CampaignDetailContent(props: {
  payload: CampaignDetailPayload
  onEdit: () => void
  onRefresh: () => void
}) {
  const { payload, onEdit, onRefresh } = props

  const c = payload.campaign as {
    name: string
    description: string | null
    status: string
    trigger_type: string
    timezone: string | null
    daily_send_limit: number
    cooldown_days: number
  }

  const successRate =
    payload.stats.sent + payload.stats.failed > 0
      ? Math.round((payload.stats.sent / (payload.stats.sent + payload.stats.failed)) * 1000) / 10
      : null

  return (
    <div className="space-y-8 pb-16">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">{c.name}</h2>
              <CampaignStatusBadge status={c.status as never} />
            </div>
            {c.description ? <p className="mt-2 text-slate-600">{c.description}</p> : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 text-slate-900"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Trigger: <span className="font-medium">{c.trigger_type}</span> · TZ{' '}
          <span className="font-medium">{c.timezone || 'Asia/Kuala_Lumpur'}</span> · Daily cap{' '}
          <span className="font-medium">{c.daily_send_limit}</span> · Cooldown{' '}
          <span className="font-medium">{c.cooldown_days}d</span>
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Analytics</h3>
        <CampaignAnalyticsCards
          enrolled={payload.stats.enrolled}
          sent={payload.stats.sent}
          failed={payload.stats.failed}
          completed={payload.stats.completed}
        />
        {successRate != null ? (
          <p className="mt-3 text-sm text-slate-600">
            Delivery success rate (sent vs failed): <span className="font-semibold">{successRate}%</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No sends yet — stats will appear after the cron processes due messages.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Steps</h3>
        <ol className="space-y-3">
          {(payload.steps as Array<Record<string, unknown>>).map((s) => (
            <li key={String(s.id)} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
              <span className="font-semibold text-slate-900">Step {String(s.step_order)}</span>
              <span className="text-slate-600">
                {' '}
                · delay {String(s.delay_days)}d · send {String(s.send_time)?.slice(0, 5)}
              </span>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{String(s.message_template)}</pre>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Recent logs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Sent</th>
                <th className="py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.recent_logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-slate-500">
                    No log rows yet.
                  </td>
                </tr>
              ) : (
                payload.recent_logs.map((log) => (
                  <tr key={String(log.id)}>
                    <td className="py-2 pr-4 font-medium">{String(log.send_status)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {log.sent_at ? new Date(String(log.sent_at)).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-red-700">{log.error_message ? String(log.error_message) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function CampaignDetailSkeleton() {
  return (
    <div className="space-y-8 pb-16" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="h-9 w-64 max-w-[70%] rounded-lg bg-slate-200/90 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-16 rounded-xl bg-slate-200/80 animate-pulse" />
            <div className="h-10 w-24 rounded-xl bg-slate-200/80 animate-pulse" />
          </div>
        </div>
        <div className="h-4 w-full max-w-xl rounded bg-slate-200/70 animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-100 bg-slate-50/80 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-24 rounded bg-slate-200/90 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-32 rounded bg-slate-200/90 animate-pulse" />
        <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />
      </div>
    </div>
  )
}
