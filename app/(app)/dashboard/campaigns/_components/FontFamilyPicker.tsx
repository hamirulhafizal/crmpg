'use client'

import { IMAGE_FONT_GROUPS, IMAGE_FONT_OPTIONS } from '@/app/lib/campaigns/image-step/types'

const SAMPLE_CHARS = 'Aa Bb Cc · 123'

type Props = {
  value: string
  onChange: (fontFamily: string) => void
  /** Shown in the large preview (e.g. layer text or variable). */
  previewText?: string
  /** Toolbar popover: list only, no outer label. */
  compact?: boolean
}

function fontLabel(value: string): string {
  return IMAGE_FONT_OPTIONS.find((f) => f.value === value)?.label ?? 'Custom'
}

export function FontFamilyPicker({
  value,
  onChange,
  previewText = 'Sample text',
  compact = false,
}: Props) {
  const display = previewText.trim() || 'Sample text'

  const list = (
      <div className={`overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-inner ${compact ? 'max-h-56' : 'max-h-48'}`}>
        {IMAGE_FONT_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">
              {group.label}
            </p>
            <ul className="divide-y divide-slate-50">
              {group.options.map((f) => {
                const selected = value === f.value
                return (
                  <li key={f.value}>
                    <button
                      type="button"
                      onClick={() => onChange(f.value)}
                      className={`flex w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left transition ${
                        selected
                          ? 'bg-teal-50 ring-1 ring-inset ring-teal-500'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[10px] font-medium text-slate-500">{f.label}</span>
                      <span
                        className="text-[15px] leading-tight text-slate-900"
                        style={{ fontFamily: f.value }}
                      >
                        {SAMPLE_CHARS}
                      </span>
                      <span
                        className="line-clamp-1 text-xs text-slate-600"
                        style={{ fontFamily: f.value }}
                      >
                        {display}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
  )

  if (compact) {
    return <div className="space-y-2">{list}</div>
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-slate-600">Font family</span>

      <div
        className="rounded-lg border border-teal-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 shadow-sm"
        style={{ fontFamily: value }}
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Selected · {fontLabel(value)}
        </p>
        <p className="mt-1 line-clamp-2 text-xl font-bold leading-snug text-slate-900">{display}</p>
        <p className="mt-1 text-sm text-slate-600">{SAMPLE_CHARS}</p>
      </div>

      {list}
    </div>
  )
}
