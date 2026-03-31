'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { filterLocalityNames, getMergedLocalityNames } from '@/app/lib/customer-localities'

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  placeholder?: string
}

export default function CustomerLocationCombobox({
  value,
  onChange,
  className = '',
  id,
  placeholder = 'Search locality…',
}: Props) {
  const allNames = useMemo(() => getMergedLocalityNames(), [])
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = id ? `${id}-listbox` : 'customer-location-listbox'

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const suggestions = useMemo(() => {
    const filtered = filterLocalityNames(draft, allNames, 80)
    const trimmed = draft.trim()
    if (
      trimmed &&
      !allNames.some((x) => x.toLowerCase() === trimmed.toLowerCase()) &&
      !filtered.some((x) => x.toLowerCase() === trimmed.toLowerCase())
    ) {
      return [trimmed, ...filtered].slice(0, 80)
    }
    return filtered
  }, [draft, allNames])

  useEffect(() => {
    setHighlight(0)
  }, [draft, open])

  const pick = (name: string) => {
    setDraft(name)
    onChange(name)
    setOpen(false)
  }

  const commitDraft = () => {
    onChange(draft.trim())
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commitDraft()
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true)
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, Math.max(0, suggestions.length - 1)))
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
            return
          }
          if (e.key === 'Enter' && open && suggestions[highlight]) {
            e.preventDefault()
            pick(suggestions[highlight])
          }
        }}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((name, i) => (
            <li
              key={`${name}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`cursor-pointer px-3 py-2 text-sm text-slate-900 ${
                i === highlight ? 'bg-blue-50' : 'hover:bg-slate-50'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
