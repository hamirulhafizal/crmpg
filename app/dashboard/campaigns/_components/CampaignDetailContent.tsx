'use client'

import type { ReactNode } from 'react'
import { CampaignAnalyticsCards } from '@/app/dashboard/campaigns/_components/CampaignAnalyticsCards'
import { CampaignStatusBadge } from '@/app/dashboard/campaigns/_components/CampaignStatusBadge'
import type { AudienceDueSample, AudienceEligibleSample } from '@/app/lib/campaigns/audience-preview'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { sendTimeDisplayLabel } from '@/app/lib/campaigns/schedule'

export type CampaignDetailPayload = {
  campaign: Record<string, unknown>
  steps: unknown[]
  stats: { enrolled: number; sent: number; failed: number; completed: number }
  recent_logs: Array<Record<string, unknown>>
  audience?: {
    criteria_lines: string[]
    filters: CampaignAudienceFilters
    generated_at: string
    eligible: {
      matching_total: number
      customers_scanned: number
      sample: AudienceEligibleSample[]
    }
    due_now: {
      total: number
      sample: AudienceDueSample[]
    }
  }
}

function displayCustomerLabel(row: AudienceEligibleSample): string {
  const s = row.save_name?.trim() || row.name?.trim()
  if (s) return s
  return row.pg_code?.trim() ? `PG ${row.pg_code}` : 'Customer'
}

function ToolbarIcon({ children, className = 'h-5 w-5' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block ${className} shrink-0`} aria-hidden>
      {children}
    </span>
  )
}

export function CampaignDetailContent(props: {
  payload: CampaignDetailPayload
  onEdit: () => void
  onRefresh: () => void
  onOpenWorkflow?: () => void
  /** POST /api/campaigns/[id]/run — sync enrollments + send due messages (same as cron, scoped to this campaign). */
  onTestRun?: () => Promise<void>
  testRunBusy?: boolean
}) {
  const { payload, onEdit, onRefresh, onOpenWorkflow, onTestRun, testRunBusy } = props

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
          <div className="flex flex-wrap gap-2">
            {onOpenWorkflow ? (
              <button
                type="button"
                onClick={onOpenWorkflow}
                title="Visualize workflow"
                aria-label="Visualize workflow"
                className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-900 hover:bg-indigo-100"
              >
                <ToolbarIcon>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM8 7h3m5 0h3M8 17h3m5 0h3" />
                  </svg>
                </ToolbarIcon>
              </button>
            ) : null}
            {/* <button
              type="button"
              onClick={onEdit}
              title="Edit campaign"
              aria-label="Edit campaign"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900 hover:bg-slate-50"
            >
              <ToolbarIcon>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
              </ToolbarIcon>
            </button> */}
            {/* {onTestRun ? (
              <button
                type="button"
                disabled={testRunBusy || c.status !== 'active'}
                title={
                  testRunBusy
                    ? 'Running test…'
                    : c.status !== 'active'
                      ? 'Activate the campaign to run a test (sync audience & send due messages).'
                      : 'Run enrollment sync and send up to 25 due WhatsApp messages now (same logic as cron).'
                }
                aria-label={
                  testRunBusy
                    ? 'Running test'
                    : c.status !== 'active'
                      ? 'Test run unavailable until campaign is active'
                      : 'Test run — sync audience and send due messages'
                }
                aria-busy={testRunBusy}
                onClick={() => void onTestRun()}
                className="inline-flex items-center justify-center rounded-xl border border-violet-300 bg-violet-50 p-2.5 text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testRunBusy ? (
                  <ToolbarIcon>
                    <svg
                      className="animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                  </ToolbarIcon>
                ) : (
                  <ToolbarIcon>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                      />
                    </svg>
                  </ToolbarIcon>
                )}
              </button>
            ) : null} */}
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh campaign data"
              aria-label="Refresh campaign data"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 p-2.5 text-white hover:bg-blue-700"
            >
              <ToolbarIcon>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
              </ToolbarIcon>
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

      {payload.audience ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">Target audience (rules)</h3>
            <p className="mb-3 text-xs text-slate-500">
              Criteria stored on this campaign. Enrollment uses the same rules when the campaign is active.
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700">
              {payload.audience.criteria_lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">Who matches today (live CRM preview)</h3>
            <p className="mb-3 text-xs text-slate-500">
              Customers in your CRM who match these filters right now (with a phone number). Scanned{' '}
              <span className="font-medium tabular-nums">{payload.audience.eligible.customers_scanned}</span> rows ·{' '}
              <span className="font-semibold text-slate-800 tabular-nums">{payload.audience.eligible.matching_total}</span>{' '}
              match · showing up to {payload.audience.eligible.sample.length} sample names.
            </p>
            {payload.audience.eligible.matching_total === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  {payload.audience.eligible.customers_scanned === 0
                    ? 'No customers were returned for your account — check that customers belong to your user in the CRM.'
                    : 'No customer currently passes all of these rules.'}
                </p>
                {payload.audience.eligible.customers_scanned > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-950">
                    <p className="font-semibold text-amber-900">Common reasons for zero matches</p>
                    <ul className="mt-2 list-inside list-disc space-y-1.5">
                      <li>
                        <strong>Phone required</strong> — only rows with a saved phone number are eligible for WhatsApp
                        campaigns.
                      </li>
                      <li>
                        <strong>CRM tags</strong> — tags like <code className="rounded bg-white/70 px-1">wedding_saving</code>{' '}
                        must be assigned on the customer via the CRM <strong>Tags</strong> feature (they live in the{' '}
                        <code className="rounded bg-white/70 px-1">customer_tags</code> table). Free-text or Excel columns
                        alone are not used here.
                      </li>
                      <li>
                        <strong>Exact slugs</strong> — tag slugs on the campaign must match the catalog (lowercase, same
                        spelling as in Admin tag settings).
                      </li>
                      <li>
                        <strong>Combined rules</strong> — account status, ethnicity, gender, location, last purchase
                        age, and segment filters are combined with AND logic together with tags.
                      </li>
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">PG code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payload.audience.eligible.sample.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 font-medium text-slate-900">{displayCustomerLabel(row)}</td>
                        <td className="px-3 py-2 text-slate-600">{row.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{row.pg_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">Today&apos;s send queue (due now)</h3>
            <p className="mb-3 text-xs text-slate-600">
              Active enrollments for this campaign that the cron (or Test run) will pick next: next send time is in the
              past or not set. Total due:{' '}
              <span className="font-semibold tabular-nums text-indigo-950">{payload.audience.due_now.total}</span>.
            </p>
            {payload.audience.due_now.total === 0 ? (
              <p className="text-sm text-slate-600">
                No one is queued for a send right now. Run enrollment (activate + cron / Test run) or wait until the
                next scheduled send time.
              </p>
            ) : payload.audience.due_now.sample.length === 0 ? (
              <p className="text-sm text-slate-600">
                {payload.audience.due_now.total} enrollment(s) due; sample list could not be loaded.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Last step</th>
                      <th className="px-3 py-2">Next send</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payload.audience.due_now.sample.map((row) => (
                      <tr key={row.enrollment_id}>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.customer ? displayCustomerLabel(row.customer) : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.customer?.phone || '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">{row.last_step_sent}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.next_send_at
                            ? new Date(row.next_send_at).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-slate-400">
            Audience preview at{' '}
            {new Date(payload.audience.generated_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            . Refresh to update.
          </p>
        </div>
      ) : null}

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
                · delay {String(s.delay_days)}d · send {sendTimeDisplayLabel(String(s.send_time ?? ''))}
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
                    <td className="py-2 pr-4 text-slate-600">{String(log.send_status)}</td>
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
        <div className="mb-4 h-6 w-48 rounded bg-slate-200/90 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full max-w-md rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-full max-w-sm rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-56 rounded bg-slate-200/90 animate-pulse" />
        <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />
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
