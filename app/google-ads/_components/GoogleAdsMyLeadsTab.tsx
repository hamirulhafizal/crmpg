'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AnalyticsPeriod = 'this_month' | 'last_30_days' | 'all_time'

type DealerLead = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  icNumber: string | null
  pgCode: string | null
  location: string | null
  locationCity: string
  submittedAt: string
}

type LeadsData = {
  periodLabel: string
  summary: { totalLeads: number; uniqueLocations: number }
  byLocation: Array<{ city: string; count: number }>
  leads: DealerLead[]
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PERIOD_OPTIONS: { id: AnalyticsPeriod; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'all_time', label: 'All time' },
]

export function GoogleAdsMyLeadsTab() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('all_time')
  const [locationFilter, setLocationFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LeadsData | null>(null)
  const [selectedLead, setSelectedLead] = useState<DealerLead | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('period', period)
      if (locationFilter) params.set('location', locationFilter)

      const res = await fetch(`/api/google-ads/leads?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to load leads')
      setData(json as LeadsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [locationFilter, period])

  useEffect(() => {
    void load()
  }, [load])

  const filteredLeads = useMemo(() => {
    if (!data?.leads) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.leads
    return data.leads.filter((lead) => {
      return (
        (lead.name && lead.name.toLowerCase().includes(q)) ||
        (lead.email && lead.email.toLowerCase().includes(q)) ||
        (lead.phone && lead.phone.includes(q)) ||
        (lead.location && lead.location.toLowerCase().includes(q)) ||
        (lead.locationCity && lead.locationCity.toLowerCase().includes(q)) ||
        (lead.icNumber && lead.icNumber.includes(q)) ||
        (lead.pgCode && lead.pgCode.toLowerCase().includes(q))
      )
    })
  }, [data?.leads, search])

  const maxLocationCount = data?.byLocation[0]?.count ?? 1

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Your leads</h1>
            <p className="mt-1 text-sm text-slate-600">
              GAP registration leads assigned to you ({data?.periodLabel ?? '…'}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                period === opt.id
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All locations</option>
            {(data?.byLocation ?? []).map((loc) => (
              <option key={loc.city} value={loc.city}>
                {loc.city} ({loc.count})
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading your leads…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total GAP leads</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.summary.totalLeads}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Locations</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.summary.uniqueLocations}</p>
            </div>
          </div>

          <section className="flex max-h-96 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="shrink-0">
              <h2 className="text-base font-semibold text-slate-900">Leads by location</h2>
              <p className="mt-1 text-xs text-slate-500">Grouped by city (text before first comma)</p>
            </div>
            {data.byLocation.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No leads in this period.</p>
            ) : (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                <ul className="space-y-3">
                  {data.byLocation.map((loc) => (
                    <li key={loc.city}>
                      <button
                        type="button"
                        onClick={() => setLocationFilter(loc.city)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="w-28 shrink-0 truncate text-sm font-medium text-slate-800">
                          {loc.city}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className="block h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.max(8, (loc.count / maxLocationCount) * 100)}%` }}
                          />
                        </span>
                        <span className="w-8 text-right text-sm tabular-nums text-slate-600">{loc.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Lead details</h2>
              <p className="mt-1 text-xs text-slate-500">{filteredLeads.length} lead(s) shown</p>
            </div>
            {filteredLeads.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No GAP leads match the current filters.</p>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">PG code</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(lead.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{lead.name || '—'}</p>
                          <p className="text-xs text-slate-500">{lead.phone || lead.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-sm font-medium text-slate-800">{lead.pgCode || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{lead.locationCity}</p>
                          <p className="max-w-[200px] truncate text-xs text-slate-500">{lead.location || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Lead details</h3>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ['Name', selectedLead.name],
                ['Email', selectedLead.email],
                ['Phone', selectedLead.phone],
                ['IC', selectedLead.icNumber],
                ['PG code', selectedLead.pgCode],
                ['Location', selectedLead.location],
                ['City', selectedLead.locationCity],
                ['Submitted', fmtDate(selectedLead.submittedAt)],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="col-span-2 font-medium text-slate-900">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
