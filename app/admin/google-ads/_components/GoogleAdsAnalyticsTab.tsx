'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { adminFetch } from '@/app/lib/admin-api-client'

type AnalyticsPeriod = 'this_month' | 'last_30_days' | 'all_time' | 'custom'
type ParticipantStatusFilter = 'all' | 'active' | 'inactive'

type AnalyticsLead = {
  id: string
  participantId: string | null
  participantName: string | null
  participantEmail: string | null
  participantActive: boolean
  name: string | null
  email: string | null
  phone: string | null
  icNumber: string | null
  pgCode: string | null
  location: string | null
  locationCity: string
  submittedAt: string
}

type AnalyticsData = {
  periodLabel: string
  summary: {
    totalLeads: number
    uniqueLocations: number
    activeParticipants: number
    participantCount: number
  }
  byLocation: Array<{ city: string; count: number }>
  byParticipant: Array<{
    participantId: string
    userId: string
    displayName: string
    email: string | null
    isActive: boolean
    leadCount: number
  }>
  leads: AnalyticsLead[]
}

type ImportSummary = {
  ok: boolean
  filename?: string
  totalMessages: number
  parsedGapLeads: number
  inserted: number
  updated: number
  skippedDuplicate: number
  skippedAlreadyImported: number
  skippedNoParticipant: number
  skippedInvalid: number
  skippedNonGap: number
  unmatchedDealers: Array<{ dealerEmail: string; count: number }>
  byParticipant: Array<{
    participantId: string
    displayName: string
    email: string
    inserted: number
    updated: number
    skippedDuplicate: number
    skippedAlreadyImported: number
  }>
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
  { id: 'custom', label: 'Custom' },
]

export function GoogleAdsAnalyticsTab() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [participantStatus, setParticipantStatus] = useState<ParticipantStatusFilter>('all')
  const [participantId, setParticipantId] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [selectedLead, setSelectedLead] = useState<AnalyticsLead | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('period', period)
      if (period === 'custom') {
        if (customFrom) params.set('from', customFrom)
        if (customTo) params.set('to', customTo)
      }
      if (participantStatus !== 'all') params.set('participantStatus', participantStatus)
      if (participantId) params.set('participantId', participantId)
      if (locationFilter) params.set('location', locationFilter)

      const res = await fetch(`/api/admin/google-ads/analytics?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to load analytics')
      setData(json as AnalyticsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [customFrom, customTo, locationFilter, participantId, participantStatus, period])

  useEffect(() => {
    void load()
  }, [load])

  const deleteLead = async (lead: AnalyticsLead) => {
    const label = lead.name || lead.email || lead.phone || 'this lead'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return

    setDeletingLeadId(lead.id)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/google-ads/analytics/leads/${lead.id}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to delete lead')

      if (selectedLead?.id === lead.id) setSelectedLead(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete lead')
    } finally {
      setDeletingLeadId(null)
    }
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await adminFetch('/api/admin/google-ads/analytics/import', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Import failed')
      setImportResult(json as ImportSummary)
      setPeriod('all_time')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
        (lead.participantName && lead.participantName.toLowerCase().includes(q)) ||
        (lead.icNumber && lead.icNumber.includes(q)) ||
        (lead.pgCode && lead.pgCode.toLowerCase().includes(q))
      )
    })
  }, [data?.leads, search])

  const maxLocationCount = data?.byLocation[0]?.count ?? 1

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Lead analytics</h2>
            <p className="mt-1 text-sm text-slate-600">
              GAP registration leads by location and participant ({data?.periodLabel ?? '…'}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mbox,application/mbox"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {importing ? 'Importing…' : 'Import leads'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Import historical GAP leads from Gmail Takeout (.mbox). Leads are matched to participants by dealer email.
        </p>

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

        {period === 'custom' && (
          <div className="mt-3 flex flex-wrap gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={participantStatus}
            onChange={(e) => setParticipantStatus(e.target.value as ParticipantStatusFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All participants</option>
            <option value="active">Active subscription only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All participants (detail)</option>
            {(data?.byParticipant ?? []).map((p) => (
              <option key={p.participantId} value={p.participantId}>
                {p.displayName} ({p.leadCount})
              </option>
            ))}
          </select>
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
      </section>

      {importError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {importError}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading analytics…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total GAP leads', value: data.summary.totalLeads },
              { label: 'Locations', value: data.summary.uniqueLocations },
              { label: 'Participants', value: data.summary.participantCount },
              { label: 'Active participants', value: data.summary.activeParticipants },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section className="flex max-h-96 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="shrink-0">
                <h3 className="text-base font-semibold text-slate-900">Leads by location</h3>
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

            <section className="flex max-h-96 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="shrink-0">
                <h3 className="text-base font-semibold text-slate-900">Leads by participant</h3>
                <p className="mt-1 text-xs text-slate-500">Click a row to filter leads below</p>
              </div>
              {data.byParticipant.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No participants match filters.</p>
              ) : (
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <ul className="space-y-2">
                    {data.byParticipant.map((p) => (
                    <li key={p.participantId}>
                      <button
                        type="button"
                        onClick={() => setParticipantId(p.participantId)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                          participantId === p.participantId
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{p.displayName}</p>
                          <p className="truncate text-xs text-slate-500">{p.email ?? p.userId}</p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900">{p.leadCount}</p>
                          <p
                            className={`text-[10px] font-medium uppercase ${
                              p.isActive ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {p.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Lead details</h3>
              <p className="mt-1 text-xs text-slate-500">{filteredLeads.length} lead(s) shown</p>
            </div>
            {filteredLeads.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No GAP leads match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">PG code</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Participant</th>
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
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{lead.participantName || '—'}</p>
                          <p
                            className={`text-[10px] font-medium uppercase ${
                              lead.participantActive ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {lead.participantActive ? 'Active' : 'Inactive'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedLead(lead)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              disabled={deletingLeadId === lead.id}
                              onClick={() => void deleteLead(lead)}
                              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                            >
                              {deletingLeadId === lead.id ? '…' : 'Delete'}
                            </button>
                          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
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
                ['Participant', selectedLead.participantName],
                ['Dealer email', selectedLead.participantEmail],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="col-span-2 font-medium text-slate-900">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={deletingLeadId === selectedLead.id}
                onClick={() => void deleteLead(selectedLead)}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {deletingLeadId === selectedLead.id ? 'Deleting…' : 'Delete lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Import complete</h3>
                <p className="mt-1 text-sm text-slate-500">{importResult.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Messages scanned', importResult.totalMessages],
                ['GAP leads found', importResult.parsedGapLeads],
                ['Inserted', importResult.inserted],
                ['Updated existing CRM', importResult.updated],
                ['Duplicates skipped', importResult.skippedDuplicate],
                ['Already imported', importResult.skippedAlreadyImported],
                ['No participant match', importResult.skippedNoParticipant],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-lg font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            {importResult.byParticipant.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-slate-900">By participant</h4>
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {importResult.byParticipant.map((p) => (
                    <li
                      key={p.participantId}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{p.displayName}</p>
                        <p className="truncate text-xs text-slate-500">{p.email}</p>
                      </div>
                      <p className="ml-3 shrink-0 font-semibold tabular-nums text-emerald-700">
                        +{p.inserted}
                        {p.updated > 0 ? ` / ↑${p.updated}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importResult.unmatchedDealers.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-amber-800">Unmatched dealer emails</h4>
                <p className="mt-1 text-xs text-slate-500">
                  These leads were in the mbox but no Google Ads participant uses that email.
                </p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {importResult.unmatchedDealers.map((row) => (
                    <li key={row.dealerEmail}>
                      {row.dealerEmail} ({row.count})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
