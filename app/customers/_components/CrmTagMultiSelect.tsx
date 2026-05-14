'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

export type CrmTagCategory = {
  id: string
  key: string
  name: string
  sort_order: number
  allows_multiple: boolean
}

export type CrmTag = {
  id: string
  category_id: string
  slug: string
  label: string
}

type Props = {
  categories: CrmTagCategory[]
  tags: CrmTag[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  className?: string
}

export function CrmTagMultiSelect({
  categories,
  tags,
  selectedIds,
  onChange,
  disabled,
  className = '',
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [categories]
  )

  const tagsByCategory = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, CrmTag[]>()
    for (const c of sortedCategories) {
      map.set(c.id, [])
    }
    for (const t of tags) {
      const cat = categories.find((c) => c.id === t.category_id)
      const catName = cat?.name?.toLowerCase() ?? ''
      if (q) {
        const hit =
          t.label.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          catName.includes(q)
        if (!hit) continue
      }
      const list = map.get(t.category_id)
      if (list) list.push(t)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label))
    }
    return map
  }, [tags, sortedCategories, categories, query])

  const visibleCount = useMemo(() => {
    let n = 0
    for (const list of tagsByCategory.values()) n += list.length
    return n
  }, [tagsByCategory])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      searchRef.current?.focus()
    } else {
      setQuery('')
    }
  }, [open])

  const toggle = useCallback(
    (id: string) => {
      if (selectedSet.has(id)) {
        onChange(selectedIds.filter((x) => x !== id))
      } else {
        onChange([...selectedIds, id])
      }
    },
    [selectedSet, selectedIds, onChange]
  )

  const clearAll = useCallback(() => {
    onChange([])
  }, [onChange])

  const summary =
    selectedIds.length === 0
      ? 'CRM tags (all)'
      : selectedIds.length === 1
        ? '1 tag selected'
        : `${selectedIds.length} tags selected`

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled || tags.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => !disabled && tags.length > 0 && setOpen((o) => !o)}
        className="flex w-full min-h-[42px] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{summary}</span>
        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {selectedIds.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const t = tags.find((x) => x.id === id)
            const cat = t ? categories.find((c) => c.id === t.category_id) : null
            return (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
                title={t ? `${cat?.name ? `${cat.name}: ` : ''}${t.label}` : id}
              >
                <span className="truncate">{t?.label ?? id.slice(0, 8)}</span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                  aria-label={`Remove tag ${t?.label ?? id}`}
                  onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 z-[100] mt-1 flex max-h-[min(24rem,calc(100vh-12rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              type="search"
              role="searchbox"
              aria-label="Search tags"
              placeholder="Search by tag or category…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {visibleCount === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No matching tags</p>
            ) : (
              sortedCategories.map((cat) => {
                const catTags = tagsByCategory.get(cat.id) ?? []
                if (catTags.length === 0) return null
                return (
                  <div key={cat.id} className="border-b border-slate-50 last:border-0">
                    <div className="sticky top-0 z-10 bg-slate-50/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                      {cat.name}
                    </div>
                    <ul className="px-1 py-0.5">
                      {catTags.map((t) => {
                        const checked = selectedSet.has(t.id)
                        return (
                          <li key={t.id}>
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm text-slate-900 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={checked}
                                onChange={() => toggle(t.id)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{t.label}</span>
                                <span className="mt-0.5 block truncate text-xs text-slate-500">{t.slug}</span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-2 py-2">
            <span className="truncate px-1 text-xs text-slate-500">Match any selected tag (OR)</span>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
