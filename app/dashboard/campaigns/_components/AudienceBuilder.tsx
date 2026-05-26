'use client'

import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import type { CategoryRow } from '@/app/admin/settings/tag-admin-sidebar'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

const STATUSES = ['temporary', 'freeze', 'active', 'free', 'inactive', 'unknown'] as const
const ETHNICITIES = ['Malay', 'Chinese', 'Indian', 'Other'] as const
type FlatTag = {
  slug: string
  label: string
  categoryId: string
  categoryName: string
}

function flattenCatalog(categories: CategoryRow[]): FlatTag[] {
  const out: FlatTag[] = []
  for (const c of categories) {
    for (const t of c.tags ?? []) {
      out.push({
        slug: t.slug,
        label: t.label,
        categoryId: c.id,
        categoryName: c.name,
      })
    }
  }
  return out
}

function TagCatalogPicker({
  selectedSlugs,
  onChangeSlugs,
}: {
  selectedSlugs: string[]
  onChangeSlugs: (slugs: string[]) => void
}) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setCatalogError(null)
    try {
      const res = await fetch('/api/tags', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setCatalogError('Sign in to load tags.')
        setCategories([])
        return
      }
      if (!res.ok) {
        setCatalogError(typeof data.error === 'string' ? data.error : 'Failed to load tags')
        setCategories([])
        return
      }
      const list = Array.isArray(data.categories) ? data.categories : []
      setCategories(list as CategoryRow[])
    } catch {
      setCatalogError('Failed to load tags')
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const flat = useMemo(() => flattenCatalog(categories), [categories])

  const q = query.trim().toLowerCase()
  const filteredFlat = useMemo(() => {
    if (!q) return flat
    return flat.filter(
      (t) => t.slug.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
    )
  }, [flat, q])

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; tags: FlatTag[] }>()
    for (const t of filteredFlat) {
      let g = map.get(t.categoryId)
      if (!g) {
        g = { name: t.categoryName, tags: [] }
        map.set(t.categoryId, g)
      }
      g.tags.push(t)
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }))
  }, [filteredFlat])

  const flatPickOrder = useMemo(() => grouped.flatMap((g) => g.tags), [grouped])

  const slugToPickIndex = useMemo(() => {
    const m = new Map<string, number>()
    flatPickOrder.forEach((t, i) => {
      if (!m.has(t.slug)) m.set(t.slug, i)
    })
    return m
  }, [flatPickOrder])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectedSet = useMemo(() => new Set(selectedSlugs), [selectedSlugs])

  const addSlug = (slug: string) => {
    if (selectedSet.has(slug)) {
      setQuery('')
      return
    }
    onChangeSlugs([...selectedSlugs, slug])
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const removeSlug = (slug: string) => {
    onChangeSlugs(selectedSlugs.filter((s) => s !== slug))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter') && flatPickOrder.length) {
      setOpen(true)
      return
    }
    if (!open) return

    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => Math.min(i + 1, Math.max(0, flatPickOrder.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && flatPickOrder.length) {
      e.preventDefault()
      const t = flatPickOrder[highlight]
      if (t) addSlug(t.slug)
    }
  }

  const showManualSlugFallback = Boolean(catalogError) || (!loading && flat.length === 0)

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex min-h-[42px] w-full flex-wrap gap-1.5 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedSlugs.map((slug) => {
          const meta = flat.find((t) => t.slug === slug)
          return (
            <span
              key={slug}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
              title={meta ? `${meta.label} · ${meta.categoryName}` : slug}
            >
              <span className="truncate">{slug}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                aria-label={`Remove ${slug}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeSlug(slug)
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
          placeholder={selectedSlugs.length ? 'Add tag…' : 'Search tags…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {catalogError && (
        <p className="mt-2 text-xs text-red-600">
          {catalogError}{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {loading && !catalogError && (
        <p className="mt-2 text-xs text-slate-500">Loading tag catalog…</p>
      )}

      {open && !loading && !catalogError && flat.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {grouped.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-slate-500">No matching tags</div>
          ) : (
            grouped.map((g) => (
              <div key={g.id} className="py-1">
                <div className="sticky top-0 z-10 bg-[grey] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                  {g.name}
                </div>
                <ul className="px-1">
                  {g.tags.map((t) => {
                    const globalIdx = slugToPickIndex.get(t.slug) ?? 0
                    const isHi = globalIdx === highlight
                    const taken = selectedSet.has(t.slug)
                    return (
                      <li key={t.slug}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={taken}
                          disabled={taken}
                          className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            taken
                              ? 'cursor-not-allowed opacity-40'
                              : isHi
                                ? 'bg-sky-50 text-sky-950'
                                : 'text-slate-900 hover:bg-slate-50'
                          }`}
                          onMouseEnter={() => setHighlight(globalIdx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addSlug(t.slug)}
                        >
                          <span className="font-medium text-black">{t.label}</span>
                          <span className="text-xs text-slate-500">{t.slug}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {showManualSlugFallback && (
        <div className="mt-2 space-y-1">
          {catalogError ? (
            <p className="text-xs text-slate-600">You can still enter tag slugs that exist on your customers:</p>
          ) : (
            <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              No tags in the catalog yet. Enter slugs manually (same values as on customer tags):
            </p>
          )}
          <label className="block text-xs font-medium text-slate-600">
            Tag slugs (comma-separated)
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="inactive, monthly-buyer"
              value={selectedSlugs.join(', ')}
              onChange={(e) =>
                onChangeSlugs(
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
          </label>
        </div>
      )}
    </div>
  )
}

export function AudienceBuilder({
  value,
  onChange,
}: {
  value: CampaignAudienceFilters
  onChange: (next: CampaignAudienceFilters) => void
}) {
  const toggleStatus = (key: (typeof STATUSES)[number]) => {
    const cur = new Set(value.account_status ?? [])
    if (cur.has(key)) cur.delete(key)
    else cur.add(key)
    onChange({ ...value, account_status: Array.from(cur) })
  }

  const toggleEthnicity = (key: (typeof ETHNICITIES)[number]) => {
    const cur = new Set(value.ethnicities ?? [])
    if (cur.has(key)) cur.delete(key)
    else cur.add(key)
    onChange({ ...value, ethnicities: Array.from(cur) })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div id="audience-builder-tags">
        <label className="block text-sm font-medium text-slate-700">Tags (any match)</label>
        <div className="mt-1">
          <TagCatalogPicker
            selectedSlugs={value.tag_slugs ?? []}
            onChangeSlugs={(tag_slugs) => onChange({ ...value, tag_slugs })}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Search and pick tags from your catalog (grouped by category). Multiple tags use OR logic.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 text-slate-900">Account status (any match)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                checked={(value.account_status ?? []).includes(s)}
                onChange={() => toggleStatus(s)}
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 text-slate-900">Ethnicity (any match)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ETHNICITIES.map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                checked={(value.ethnicities ?? []).includes(e)}
                onChange={() => toggleEthnicity(e)}
              />
              {e}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Matches customers whose ethnicity is any of the selected values.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Monthly buyer</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={value.is_monthly_buyer === undefined ? '' : value.is_monthly_buyer ? 'yes' : 'no'}
            onChange={(e) => {
              const v = e.target.value
              onChange({
                ...value,
                is_monthly_buyer: v === '' ? undefined : v === 'yes',
              })
            }}
          >
            <option value="">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-900">
          <span className="font-medium text-slate-700">Friend flag</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={value.is_friend === undefined ? '' : value.is_friend ? 'yes' : 'no'}
            onChange={(e) => {
              const v = e.target.value
              onChange({
                ...value,
                is_friend: v === '' ? undefined : v === 'yes',
              })
            }}
          >
            <option value="">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-900">
          <span className="font-medium text-slate-700">Profile verified</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={
              value.profile_verified === undefined ? '' : value.profile_verified ? 'yes' : 'no'
            }
            onChange={(e) => {
              const v = e.target.value
              onChange({
                ...value,
                profile_verified: v === '' ? undefined : v === 'yes',
              })
            }}
          >
            <option value="">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <p className="text-xs text-slate-500">
            Matches the customer&apos;s Profile Verified field (account verified profile).
          </p>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-900">
          <span className="font-medium text-slate-700">Direct debit</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
            value={value.direct_debit === undefined ? '' : value.direct_debit ? 'yes' : 'no'}
            onChange={(e) => {
              const v = e.target.value
              onChange({
                ...value,
                direct_debit: v === '' ? undefined : v === 'yes',
              })
            }}
          >
            <option value="">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <p className="text-xs text-slate-500">
            Matches Direct Debit Subscription on the customer record.
          </p>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-slate-900">
        <span className="font-medium text-slate-700">Location contains</span>
        <input
          className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          value={value.location_contains ?? ''}
          onChange={(e) => onChange({ ...value, location_contains: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-900">
        <span className="font-medium text-slate-700">Date of birth</span>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          value={value.dob_is_today ? 'today' : ''}
          onChange={(e) => {
            const isToday = e.target.value === 'today'
            onChange({
              ...value,
              dob_is_today: isToday ? true : undefined,
              dob_month: undefined,
              dob_day_from: undefined,
              dob_day_to: undefined,
            })
          }}
        >
          <option value="">Any</option>
          <option value="today">Current date (day & month)</option>
        </select>
        <p className="text-xs text-slate-500">
          Matches customers whose birthday is today in Malaysia time (e.g. 23/05 on 23 May). Year is
          ignored — use this for daily birthday WhatsApp wishes when the campaign runs.
        </p>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-900">
        <span className="font-medium text-slate-700">Last purchase date</span>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          value={value.last_purchase_is_today ? 'today' : ''}
          onChange={(e) => {
            const isToday = e.target.value === 'today'
            onChange({
              ...value,
              last_purchase_is_today: isToday ? true : undefined,
              last_purchase_on_or_after: undefined,
              last_purchase_on_or_before: undefined,
            })
          }}
        >
          <option value="">Any</option>
          <option value="today">Current date (today)</option>
        </select>
        <p className="text-xs text-slate-500">
          Matches customers whose last purchase is today in Malaysia time (full calendar date).
        </p>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-900">
        <span className="font-medium text-slate-700">Register date</span>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          value={value.register_is_today ? 'today' : ''}
          onChange={(e) => {
            const isToday = e.target.value === 'today'
            onChange({
              ...value,
              register_is_today: isToday ? true : undefined,
              register_on_or_after: undefined,
              register_on_or_before: undefined,
            })
          }}
        >
          <option value="">Any</option>
          <option value="today">Current date (today)</option>
        </select>
        <p className="text-xs text-slate-500">
          Matches customers who registered today in Malaysia time (Date Register or account created date).
        </p>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Last purchase older than (days)</span>
        <input
          type="number"
          min={0}
          className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          value={value.last_purchase_days_gt ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              last_purchase_days_gt: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      </label>
    </div>
  )
}
